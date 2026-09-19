# 2026-09-16
# Bug: Qwiic queue ages were treated as fixed timestamps, unmatched press
# entries caused quick taps to be measured as multi-minute holds, and later
# double-click/long-press gestures made the physical mailbox too complex.
# Root cause: The button returns elapsed ages for separate press/click queues;
# pairs must be resynchronized, but every valid completed press now has one
# behavior: mark the current unread message read and advance the queue.
# Reference: Love Letter Mailbox firmware releases v1.2.2-v1.2.8.

$ErrorActionPreference = "Stop"
$firmwarePath = Join-Path $PSScriptRoot "..\..\firmware\mailbox_firmware\mailbox_firmware.ino"
$firmware = Get-Content -LiteralPath $firmwarePath -Raw

$requiredPatterns = @(
  'heldFor > MAX_VALID_PRESS_MS',
  'Button queue resync: discarded stale press',
  'Button action: MARK READ AND ADVANCE',
  'void revealMessageFromScreensaver()',
  'Screensaver reveal and read',
  'acknowledgeCurrent();',
  'void showLastDisplayedOrIdle()',
  'drawReadControlBar(message.read);',
  'display.print("READ");',
  'removeLocalMessageAt(currentIndex);',
  'prefetchQueuedPhotos();'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Button gesture regression guard missing: $pattern"
  }
}

$forbiddenPatterns = @(
  'DOUBLE_PRESS_MS',
  'LONG_PRESS_MS',
  'Button action: BACK',
  'Button action: NEXT',
  'handleDoublePress',
  'handleLongPress',
  'moveBack()',
  'moveForward()',
  'clickPending'
)

foreach ($pattern in $forbiddenPatterns) {
  if ($firmware.Contains($pattern)) {
    throw "Removed gesture/navigation behavior still present: $pattern"
  }
}

Write-Output "Button gesture timing guard passed."
