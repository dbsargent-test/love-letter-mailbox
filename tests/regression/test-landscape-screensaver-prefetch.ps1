# 2026-09-17
# Feature: landscape TFT, two-minute floating-hearts screensaver, and image
# prefetch before notification so the first reveal does not wait on download.

$ErrorActionPreference = "Stop"
$firmwarePath = Join-Path $PSScriptRoot "..\..\firmware\mailbox_firmware\mailbox_firmware.ino"
$firmware = Get-Content -LiteralPath $firmwarePath -Raw

$requiredPatterns = @(
  'display.setRotation(1);',
  'constexpr unsigned long SCREENSAVER_DELAY_MS = 2UL * 60UL * 1000UL;',
  'void drawScreensaverStatic()',
  'void drawScreensaverFrame()',
  'bool heartFrameDrawn = false;',
  'void revealMessageFromScreensaver()',
  'messageRevealedFromScreensaver = !messages[currentIndex].read;',
  'Button action: MARK REVEALED MESSAGE READ',
  'prefetchPhoto(messages[newMessageIndex]);'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Landscape/screensaver regression guard missing: $pattern"
  }
}

$prefetch = $firmware.IndexOf('prefetchPhoto(messages[newMessageIndex]);')
$notify = $firmware.IndexOf('playNotification();', $prefetch)
if ($prefetch -lt 0 -or $notify -lt 0 -or $prefetch -gt $notify) {
  throw "New-message notification must occur after photo prefetch."
}

$frameStart = $firmware.IndexOf('void drawScreensaverFrame()')
$frameEnd = $firmware.IndexOf('void showScreensaver()', $frameStart)
if ($frameStart -lt 0 -or $frameEnd -lt 0) {
  throw "Unable to isolate the screensaver frame renderer."
}

$frameRenderer = $firmware.Substring($frameStart, $frameEnd - $frameStart)
if ($frameRenderer.Contains('display.fillScreen(')) {
  throw "Animated screensaver frames must not clear the entire display."
}

Write-Output "Landscape screensaver and photo-prefetch guard passed."
