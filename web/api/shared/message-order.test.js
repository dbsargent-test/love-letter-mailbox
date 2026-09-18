const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatDeviceTimestamp,
  getPageSize,
  sortMessages,
} = require("./message-order");

const newer = { id: "newer", timestamp: "2026-09-16T18:00:00.000Z" };
const older = { id: "older", timestamp: "2026-09-16T17:00:00.000Z" };

test("unread device polling returns oldest messages first", () => {
  assert.deepEqual(sortMessages([newer, older], true).map(message => message.id), [
    "older",
    "newer",
  ]);
});

test("normal message history remains newest first", () => {
  assert.deepEqual(sortMessages([older, newer], false).map(message => message.id), [
    "newer",
    "older",
  ]);
});

test("page size defaults to ten and is capped at twenty", () => {
  assert.equal(getPageSize(undefined), 10);
  assert.equal(getPageSize("invalid"), 10);
  assert.equal(getPageSize("0"), 1);
  assert.equal(getPageSize("15"), 15);
  assert.equal(getPageSize("200"), 20);
});

test("device timestamps use the configured IANA timezone", () => {
  assert.equal(
    formatDeviceTimestamp("2026-09-16T20:55:24.607Z", "America/Santiago"),
    "Sep 16, 5:55 PM"
  );
});

test("invalid device timezone falls back to UTC", () => {
  assert.equal(
    formatDeviceTimestamp("2026-09-16T20:55:24.607Z", "Invalid/Zone"),
    "Sep 16, 8:55 PM"
  );
});
