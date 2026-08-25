const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { verifyDeviceKey } = require("../shared/auth");

module.exports = async function (context, req) {
  // Authenticate device
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  if (account && key) {
    const credential = new AzureNamedKeyCredential(account, key);
    const deviceKeysTable = new TableClient(`https://${account}.table.core.windows.net`, "devicekeys", credential);
    const device = await verifyDeviceKey(req, deviceKeysTable);
    if (!device) {
      context.res = { status: 401, body: { error: "Device authentication required" } };
      return;
    }
  }

  const deviceId = req.query.deviceId || "default";

  // Firmware version check for OTA updates
  // Update this when pushing new firmware
  const currentFirmware = {
    version: "1.0.0",
    url: `https://lovelettermlbx.blob.core.windows.net/firmware/firmware-1.0.0.bin`,
    sha256: "",
    releaseNotes: "Initial release"
  };

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: currentFirmware
  };
};
