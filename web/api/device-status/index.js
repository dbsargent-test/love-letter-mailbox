const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const crypto = require("crypto");
const { verifyDeviceKey } = require("../shared/auth");

const MAX_EVENT_NAME_LENGTH = 48;
const MAX_DETAIL_LENGTH = 240;
const MAX_STRING_LENGTH = 120;
const NUMERIC_FIELDS = [
  "uptimeMs",
  "wifiRssi",
  "freeHeap",
  "minFreeHeap",
  "freePsram",
  "minFreePsram",
  "unreadCount",
  "lastPollStatus",
];
const STRING_FIELDS = [
  "firmwareVersion",
  "bootId",
  "resetReason",
  "displayState",
  "currentMessageId",
  "flagState",
  "buttonLedState",
  "lastErrorCode",
];

function getTableClient(account, key, tableName) {
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(
    `https://${account}.table.core.windows.net`,
    tableName,
    credential
  );
}

async function ensureTable(tableClient, context, tableName) {
  try {
    await tableClient.createTable();
  } catch (error) {
    if (error && (error.statusCode === 409 || error.code === "TableAlreadyExists")) {
      return;
    }
    context.log.error(`Unable to create ${tableName} table:`, error);
    throw error;
  }
}

function boundedString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function safeNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function buildSnapshotEntity(device, body, receivedAt) {
  const entity = {
    partitionKey: device.mailbox,
    rowKey: "latest",
    mailbox: device.mailbox,
    receivedAt,
  };

  for (const field of STRING_FIELDS) {
    const value = boundedString(body[field]);
    if (value) entity[field] = value;
  }

  for (const field of NUMERIC_FIELDS) {
    const value = safeNumber(body[field]);
    if (value !== undefined) entity[field] = value;
  }

  return entity;
}

function buildEventEntity(device, body, receivedAt) {
  const eventName = boundedString(body.event, MAX_EVENT_NAME_LENGTH);
  if (!eventName) return null;

  return {
    partitionKey: device.mailbox,
    rowKey: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    mailbox: device.mailbox,
    event: eventName,
    detail: boundedString(body.detail, MAX_DETAIL_LENGTH),
    firmwareVersion: boundedString(body.firmwareVersion),
    bootId: boundedString(body.bootId),
    uptimeMs: safeNumber(body.uptimeMs) ?? 0,
    receivedAt,
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  if (typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = async function (context, req) {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  if (!account || !key) {
    context.res = { status: 503, body: { error: "Device service is not configured" } };
    return;
  }

  let device;
  try {
    const deviceKeysTable = getTableClient(account, key, "devicekeys");
    device = await verifyDeviceKey(req, deviceKeysTable);
  } catch (error) {
    context.log.error("Device status authentication failed:", error);
    context.res = { status: 503, body: { error: "Authentication service unavailable" } };
    return;
  }

  if (!device) {
    context.res = { status: 401, body: { error: "Device authentication required" } };
    return;
  }

  const body = parseBody(req.body);
  const receivedAt = new Date().toISOString();
  const statusTable = getTableClient(account, key, "deviceStatus");
  const eventsTable = getTableClient(account, key, "deviceEvents");

  try {
    await ensureTable(statusTable, context, "deviceStatus");
    await ensureTable(eventsTable, context, "deviceEvents");
    await statusTable.upsertEntity(buildSnapshotEntity(device, body, receivedAt), "Replace");
    const eventEntity = buildEventEntity(device, body, receivedAt);
    if (eventEntity) {
      await eventsTable.createEntity(eventEntity);
    }
  } catch (error) {
    context.log.error("Device status write failed:", error);
    context.res = { status: 500, body: { error: "Device status was not recorded" } };
    return;
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { ok: true, receivedAt },
  };
};
