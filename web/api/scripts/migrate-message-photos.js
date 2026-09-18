/**
 * Normalize existing message photos without overwriting originals.
 *
 * Dry run:
 *   node web/api/scripts/migrate-message-photos.js
 *
 * Apply after reviewing the dry-run output:
 *   node web/api/scripts/migrate-message-photos.js --apply
 *
 * Requires STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  AzureNamedKeyCredential,
  TableClient,
} = require("@azure/data-tables");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");
const {
  NORMALIZER_VERSION,
  normalizeMessagePhoto,
} = require("../shared/image-normalization");

const ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY;
const APPLY = process.argv.includes("--apply");
const LIMIT = readNumericArgument("--limit");
const PHOTOS_CONTAINER = "photos";
const TABLE_NAME = "messages";

if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
  console.error(
    "Set STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY before running the migration."
  );
  process.exit(1);
}

function readNumericArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return Number.POSITIVE_INFINITY;
  const value = Number.parseInt(process.argv[index + 1], 10);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`${name} must be followed by a positive integer.`);
    process.exit(1);
  }
  return value;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function describeError(error) {
  return error?.message || error?.code || error?.name ||
    `HTTP ${error?.statusCode || "unknown"}`;
}

function getBlobName(blobUrl) {
  const parsed = new URL(blobUrl);
  const prefix = `/${PHOTOS_CONTAINER}/`;
  const index = parsed.pathname.indexOf(prefix);
  if (index < 0) throw new Error("Photo URL does not reference the photos container");
  return decodeURIComponent(parsed.pathname.slice(index + prefix.length));
}

function migrationBlobName(messageId) {
  return `${messageId}-device-v${NORMALIZER_VERSION}.jpg`;
}

async function ensureImmutableUpload(blobClient, normalized, sourceHash) {
  try {
    const properties = await blobClient.getProperties();
    if (properties.metadata?.sourceSha256 !== sourceHash ||
        properties.metadata?.normalizerVersion !== String(NORMALIZER_VERSION)) {
      throw new Error("Existing migration blob does not match the source image");
    }
    return;
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }

  await blobClient.upload(normalized.data, normalized.size, {
    conditions: { ifNoneMatch: "*" },
    blobHTTPHeaders: { blobContentType: "image/jpeg" },
    metadata: {
      sourceSha256: sourceHash,
      normalizedSha256: sha256(normalized.data),
      width: String(normalized.width),
      height: String(normalized.height),
      normalizerVersion: String(NORMALIZER_VERSION),
    },
  });
}

async function migrate() {
  const credential = new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  const table = new TableClient(
    `https://${ACCOUNT_NAME}.table.core.windows.net`,
    TABLE_NAME,
    credential
  );
  const blobService = new BlobServiceClient(
    `https://${ACCOUNT_NAME}.blob.core.windows.net`,
    new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  );
  const container = blobService.getContainerClient(PHOTOS_CONTAINER);
  const manifest = {
    mode: APPLY ? "apply" : "dry-run",
    normalizerVersion: NORMALIZER_VERSION,
    createdAt: new Date().toISOString(),
    entries: [],
  };

  let examined = 0;
  let eligible = 0;
  let changed = 0;
  let failed = 0;
  let originalBytes = 0;
  let normalizedBytes = 0;

  for await (const entity of table.listEntities()) {
    if (!entity.photoUrl) continue;
    examined++;
    if (eligible >= LIMIT) break;
    if (entity.photoVersion === NORMALIZER_VERSION &&
        entity.photoUrl.includes(`-device-v${NORMALIZER_VERSION}.jpg`)) {
      continue;
    }
    eligible++;

    try {
      const sourceName = getBlobName(entity.photoUrl);
      const sourceBlob = container.getBlockBlobClient(sourceName);
      const source = await sourceBlob.downloadToBuffer();
      const normalized = await normalizeMessagePhoto(source);
      const sourceHash = sha256(source);
      const targetName = migrationBlobName(entity.rowKey);
      const targetBlob = container.getBlockBlobClient(targetName);

      const entry = {
        partitionKey: entity.partitionKey,
        rowKey: entity.rowKey,
        originalUrl: entity.photoUrl,
        normalizedUrl: targetBlob.url,
        originalBytes: source.length,
        normalizedBytes: normalized.size,
        width: normalized.width,
        height: normalized.height,
        sourceSha256: sourceHash,
        normalizedSha256: sha256(normalized.data),
        status: APPLY ? "pending" : "would-update",
      };

      if (APPLY) {
        await ensureImmutableUpload(targetBlob, normalized, sourceHash);
        await table.updateEntity({
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          photoOriginalUrl: entity.photoOriginalUrl || entity.photoUrl,
          photoUrl: targetBlob.url,
          photoWidth: normalized.width,
          photoHeight: normalized.height,
          photoBytes: normalized.size,
          photoVersion: NORMALIZER_VERSION,
        }, "Merge");
        entry.status = "updated";
      }

      manifest.entries.push(entry);
      changed++;
      originalBytes += source.length;
      normalizedBytes += normalized.size;
      console.log(
        `${APPLY ? "UPDATED" : "WOULD UPDATE"} ${entity.partitionKey}/${entity.rowKey}: ` +
        `${source.length} -> ${normalized.size} bytes, ` +
        `${normalized.width}x${normalized.height}`
      );
    } catch (error) {
      failed++;
      const errorMessage = describeError(error);
      manifest.entries.push({
        partitionKey: entity.partitionKey,
        rowKey: entity.rowKey,
        photoUrl: entity.photoUrl,
        status: "failed",
        error: errorMessage,
      });
      console.error(`FAILED ${entity.partitionKey}/${entity.rowKey}: ${errorMessage}`);
    }
  }

  manifest.summary = {
    examined,
    eligible,
    changed,
    failed,
    originalBytes,
    normalizedBytes,
    bytesSaved: originalBytes - normalizedBytes,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestDirectory = path.resolve(process.cwd(), "local", "migrations");
  fs.mkdirSync(manifestDirectory, { recursive: true });
  const manifestPath = path.join(
    manifestDirectory,
    `message-photo-migration-${APPLY ? "apply" : "dry-run"}-${timestamp}.json`
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest.summary, null, 2));
  console.log(`Manifest: ${manifestPath}`);
  if (!APPLY) {
    console.log("Dry run only. No blobs or message entities were changed.");
  }
  if (failed > 0) process.exitCode = 1;
}

migrate().catch(error => {
  console.error("Photo migration failed:", describeError(error));
  process.exit(1);
});
