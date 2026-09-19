# 2026-09-17
# Feature: rotated TFT, two-minute floating-hearts screensaver, and bounded
# queued-image prefetch before notification so button reveal does not wait on
# download.

$ErrorActionPreference = "Stop"
$firmwarePath = Join-Path $PSScriptRoot "..\..\firmware\mailbox_firmware\mailbox_firmware.ino"
$firmware = Get-Content -LiteralPath $firmwarePath -Raw

$requiredPatterns = @(
  'display.setRotation(3);',
  'constexpr unsigned long SCREENSAVER_DELAY_MS = 2UL * 60UL * 1000UL;',
  'constexpr unsigned long OTA_CHECK_INTERVAL_MS = 15UL * 60UL * 1000UL;',
  'constexpr size_t PHOTO_CACHE_SLOTS = 4;',
  'constexpr size_t MIN_FREE_PSRAM_BYTES = 512UL * 1024UL;',
  'void drawScreensaverStatic()',
  'void drawScreensaverFrame()',
  'bool heartFrameDrawn = false;',
  'if (NAVIGATION_ENABLED) showScreensaver();',
  'void revealMessageFromScreensaver()',
  'apiBaseUrl + "/api/messages?unread=true&page=0&pageSize="',
  'void prefetchQueuedPhotos()',
  'hasPhotoCacheHeadroom(bufferSize)',
  'prefetchQueuedPhotos();'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $firmware.Contains($pattern)) {
    throw "Landscape/screensaver regression guard missing: $pattern"
  }
}

$prefetch = $firmware.IndexOf('prefetchQueuedPhotos();', $firmware.IndexOf('void pollMessages()'))
$notify = $firmware.IndexOf('playNotification();', $prefetch)
if ($prefetch -lt 0 -or $notify -lt 0 -or $prefetch -gt $notify) {
  throw "New-message notification must occur after queued photo prefetch."
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
