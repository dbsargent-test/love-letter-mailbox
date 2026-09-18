const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");
const { verifyDeviceKey } = require("../shared/auth");

module.exports = async function (context, req) {
  // Authenticate device
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  if (!account || !key) {
    context.res = { status: 503, body: { error: "Device service is not configured" } };
    return;
  }

  const credential = new AzureNamedKeyCredential(account, key);
  const deviceKeysTable = new TableClient(`https://${account}.table.core.windows.net`, "devicekeys", credential);
  const device = await verifyDeviceKey(req, deviceKeysTable);
  if (!device) {
    context.res = { status: 401, body: { error: "Device authentication required" } };
    return;
  }

  const enabled = process.env.FIRMWARE_RELEASE_ENABLED === "true";
  const version = process.env.FIRMWARE_VERSION || "";
  const blobName = process.env.FIRMWARE_BLOB_NAME || "";
  const sha256 = (process.env.FIRMWARE_SHA256 || "").toLowerCase();
  const configured =
    enabled &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    /^[a-zA-Z0-9._-]+$/.test(blobName) &&
    /^[a-f0-9]{64}$/.test(sha256);

  if (!configured) {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { available: false }
    };
    return;
  }

  const blobCredential = new StorageSharedKeyCredential(account, key);
  const sas = generateBlobSASQueryParameters({
    containerName: "firmware",
    blobName,
    permissions: BlobSASPermissions.parse("r"),
    startsOn: new Date(Date.now() - 5 * 60 * 1000),
    expiresOn: new Date(Date.now() + 60 * 60 * 1000),
  }, blobCredential).toString();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      available: true,
      version,
      url: `https://${account}.blob.core.windows.net/firmware/${blobName}?${sas}`,
      sha256,
      releaseNotes: process.env.FIRMWARE_RELEASE_NOTES || ""
    }
  };
};
