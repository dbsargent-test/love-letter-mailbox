# 2026-09-21
# Feature: remote heartbeat/status telemetry so deployed mailboxes can confirm
# firmware version, OTA outcome, and health without physical inspection.

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$firmwarePath = Join-Path $repoRoot "firmware\mailbox_firmware\mailbox_firmware.ino"
$endpointPath = Join-Path $repoRoot "web\api\device-status\index.js"
$functionPath = Join-Path $repoRoot "web\api\device-status\function.json"

$firmware = Get-Content -LiteralPath $firmwarePath -Raw
$endpoint = Get-Content -LiteralPath $endpointPath -Raw
$function = Get-Content -LiteralPath $functionPath -Raw

$firmwarePatterns = @(
  '#define FIRMWARE_VERSION "1.2.11"',
  'constexpr unsigned long STATUS_INTERVAL_MS = 60UL * 1000UL;',
  'apiBaseUrl + "/api/device/status"',
  'document["firmwareVersion"] = FIRMWARE_VERSION;',
  'document["bootId"] = bootId;',
  'document["wifiRssi"] = WiFi.RSSI();',
  'sendDeviceStatus("heartbeat", "")',
  'sendDeviceStatus("boot", resetReasonName())',
  'sendDeviceStatus("ota_confirmed", FIRMWARE_VERSION)',
  'sendDeviceStatus("message_marked_read", messageId)'
)

foreach ($pattern in $firmwarePatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Device heartbeat firmware guard missing: $pattern"
  }
}

$endpointPatterns = @(
  'verifyDeviceKey(req, deviceKeysTable)',
  'getTableClient(account, key, "deviceStatus")',
  'getTableClient(account, key, "deviceEvents")',
  'await statusTable.upsertEntity(buildSnapshotEntity(device, body, receivedAt), "Replace")',
  'await eventsTable.createEntity(eventEntity)',
  'function parseBody(body)',
  'JSON.parse(body)',
  'const body = parseBody(req.body);',
  'boundedString(body.firmwareVersion)',
  '"wifiRssi"',
  'safeNumber(body[field])'
)

foreach ($pattern in $endpointPatterns) {
  if (-not $endpoint.Contains($pattern)) {
    throw "Device heartbeat endpoint guard missing: $pattern"
  }
}

if (-not $function.Contains('"route": "device/status"')) {
  throw "Device heartbeat route must remain /api/device/status."
}

Write-Output "Device heartbeat telemetry guard passed."
