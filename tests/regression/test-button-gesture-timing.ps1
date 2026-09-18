# 2026-09-16
# Bug: Qwiic queue ages were treated as fixed timestamps, and unmatched press
# entries caused quick taps to be measured as multi-minute holds.
# Root cause: The button returns elapsed ages for separate press/click queues;
# pairs must be resynchronized and converted to local event timestamps.
# Reference: Love Letter Mailbox firmware releases v1.2.2-v1.2.3.

$ErrorActionPreference = "Stop"
$firmwarePath = Join-Path $PSScriptRoot "..\..\firmware\mailbox_firmware\mailbox_firmware.ino"
$firmware = Get-Content -LiteralPath $firmwarePath -Raw

$requiredPatterns = @(
  'constexpr unsigned long DOUBLE_PRESS_MS = 750;',
  'const uint32_t clickOccurredAt = millis() - clickAge;',
  'heldFor > MAX_VALID_PRESS_MS',
  'Button queue resync: discarded stale press',
  'Button action: NEXT',
  'Button action: BACK',
  'Button action: MARK READ'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Button gesture regression guard missing: $pattern"
  }
}

Write-Output "Button gesture timing guard passed."
