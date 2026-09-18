# 2026-09-17
# Safety guard: the first SG90 test must use verified IO1 wiring, bounded pulse
# widths, a neutral startup position, and no automatic sweep.

$ErrorActionPreference = "Stop"
$firmwarePath = Join-Path $PSScriptRoot "..\..\firmware\servo_smoke_test\servo_smoke_test.ino"
$firmware = Get-Content -LiteralPath $firmwarePath -Raw

$requiredPatterns = @(
  'constexpr uint8_t SERVO_PIN = 1;',
  'constexpr uint32_t SERVO_FREQUENCY_HZ = 50;',
  'constexpr uint16_t SERVO_LEFT_US = 1200;',
  'constexpr uint16_t SERVO_CENTER_US = 1500;',
  'constexpr uint16_t SERVO_RIGHT_US = 1800;',
  'writePosition(SERVO_CENTER_US, "CENTER");',
  'ledcDetach(SERVO_PIN);',
  'digitalWrite(SERVO_PIN, LOW);'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Servo smoke-test safety guard missing: $pattern"
  }
}

if ($firmware -match 'for\s*\([^)]*(?:SERVO_LEFT_US|SERVO_RIGHT_US)') {
  throw "Servo smoke test must not contain an automatic sweep loop."
}

Write-Output "Servo smoke-test safety guard passed."
