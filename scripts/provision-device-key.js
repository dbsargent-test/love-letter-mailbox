/**
 * Provision or rotate one physical mailbox device key.
 *
 * Usage:
 *   node scripts/provision-device-key.js <mailbox> <device-id> [time-zone]
 *
 * Requires STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY.
 * The plaintext key is displayed once and only its SHA-256 hash is stored.
 */
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const crypto = require("crypto");

const account = process.env.STORAGE_ACCOUNT_NAME;
const accountKey = process.env.STORAGE_ACCOUNT_KEY;
const mailbox = process.argv[2];
const deviceId = process.argv[3];
const timeZone = process.argv[4] || "UTC";

if (!account || !accountKey) {
  console.error(
    "Set STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY before provisioning a device."
  );
  process.exit(1);
}

if (!/^[a-z0-9_]{3,20}$/.test(mailbox || "")) {
  console.error("Mailbox must match [a-z0-9_]{3,20}.");
  process.exit(1);
}

if (!/^[a-z0-9_-]{3,40}$/.test(deviceId || "")) {
  console.error("Device ID must match [a-z0-9_-]{3,40}.");
  process.exit(1);
}

try {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
} catch {
  console.error("Time zone must be a valid IANA time zone.");
  process.exit(1);
}

async function provision() {
  const credential = new AzureNamedKeyCredential(account, accountKey);
  const table = new TableClient(
    `https://${account}.table.core.windows.net`,
    "devicekeys",
    credential
  );

  try {
    await table.createTable();
  } catch (error) {
    if (error.statusCode !== 409) throw error;
  }

  for await (const entity of table.listEntities({
    queryOptions: { filter: `deviceId eq '${deviceId}'` },
  })) {
    await table.deleteEntity(entity.partitionKey, entity.rowKey);
  }

  const plaintextKey = crypto.randomBytes(32).toString("base64url");
  const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");

  await table.createEntity({
    partitionKey: "devicekey",
    rowKey: keyHash,
    mailbox,
    deviceId,
    timeZone,
    createdAt: new Date().toISOString(),
  });

  console.log("Device key provisioned. Copy it now; it is not stored in plaintext:");
  console.log(plaintextKey);
}

provision().catch(error => {
  console.error("Device provisioning failed:", error.message);
  process.exit(1);
});
