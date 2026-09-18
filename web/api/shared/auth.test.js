const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");

process.env.JWT_SECRET = "test-only-secret-that-is-long-enough";

const {
  createToken,
  isTokenRevoked,
  verifyDeviceKey,
  verifyUserSession,
} = require("./auth");

function requestWithToken(token, extra = {}) {
  return {
    headers: { "x-auth-token": token, ...(extra.headers || {}) },
    query: extra.query || {},
  };
}

test("revocation lookup fails closed except for entity not found", async () => {
  const notFoundTable = {
    getEntity: async () => {
      const error = new Error("missing");
      error.statusCode = 404;
      throw error;
    },
  };
  assert.equal(await isTokenRevoked("token", notFoundTable), false);

  const unavailableTable = {
    getEntity: async () => {
      const error = new Error("unavailable");
      error.statusCode = 503;
      throw error;
    },
  };
  await assert.rejects(() => isTokenRevoked("token", unavailableTable), /unavailable/);
});

test("session version invalidates every previously issued token", async () => {
  const token = createToken({ username: "sender", partner: "recipient", sessionVersion: 3 });
  const usersTable = {
    getEntity: async () => ({
      rowKey: "sender",
      partner: "recipient",
      mustChangePassword: false,
      sessionVersion: 4,
    }),
  };
  const revokedTable = {
    getEntity: async () => {
      const error = new Error("missing");
      error.statusCode = 404;
      throw error;
    },
  };

  assert.equal(
    await verifyUserSession(requestWithToken(token), usersTable, revokedTable),
    null
  );
});

test("valid session returns current user state", async () => {
  const token = createToken({ username: "sender", partner: "old", sessionVersion: 2 });
  const usersTable = {
    getEntity: async () => ({
      rowKey: "sender",
      partner: "recipient",
      mustChangePassword: true,
      sessionVersion: 2,
    }),
  };
  const revokedTable = {
    getEntity: async () => {
      const error = new Error("missing");
      error.statusCode = 404;
      throw error;
    },
  };

  const user = await verifyUserSession(requestWithToken(token), usersTable, revokedTable);
  assert.equal(user.username, "sender");
  assert.equal(user.partner, "recipient");
  assert.equal(user.mustChangePw, true);
});

test("device authentication ignores query-string credentials", async () => {
  const rawKey = "device-secret";
  const expectedHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const table = {
    getEntity: async (partitionKey, rowKey) => {
      assert.equal(partitionKey, "devicekey");
      assert.equal(rowKey, expectedHash);
      return { mailbox: "recipient", timeZone: "UTC" };
    },
  };

  assert.equal(
    await verifyDeviceKey({ headers: {}, query: { deviceKey: rawKey } }, table),
    null
  );
  const device = await verifyDeviceKey(
    { headers: { "x-device-key": rawKey }, query: {} },
    table
  );
  assert.equal(device.mailbox, "recipient");
});
