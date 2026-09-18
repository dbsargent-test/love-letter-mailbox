# 2026-09-17
# Bug: Arduino CLI's bundled PyInstaller helpers are blocked by Windows
# Application Control before compilation or upload can start.
# Root cause: bundled Python DLLs extract under Temp and are denied by policy.

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "..\..\scripts\esp32c5-toolchain.ps1"
$script = Get-Content -LiteralPath $scriptPath -Raw

$requiredPatterns = @(
  'tools.esptool_py.path=',
  'tools.gen_esp32part.cmd.windows=',
  '"-m", "esptool"',
  '"write-flash"',
  'Get-Content -LiteralPath $flashArgsPath'
)

foreach ($pattern in $requiredPatterns) {
  if (-not $script.Contains($pattern)) {
    throw "Policy-compatible ESP32-C5 toolchain guard missing: $pattern"
  }
}

if ($script.Contains("arduino-cli upload")) {
  throw "Upload must use python -m esptool, not Arduino CLI's blocked uploader."
}

Write-Output "Policy-compatible ESP32-C5 toolchain guard passed."
