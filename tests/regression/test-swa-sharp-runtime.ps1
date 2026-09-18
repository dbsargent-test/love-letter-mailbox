# 2026-09-16
# Bug: A Windows SWA deployment packaged only Sharp's Windows ARM64 binary,
# causing the production messages function to return HTTP 500.
# Root cause: SWA CLI deploys the local API dependency tree without adding the
# Azure Linux x64 optional native packages.
# Reference: Love Letter Mailbox firmware/web release v1.2.0.

$ErrorActionPreference = "Stop"
$packagePath = Join-Path $PSScriptRoot "..\..\web\api\package.json"
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$prepare = $package.scripts.'prepare:swa'

if ($prepare -notmatch '@img/sharp-linux-x64@0\.35\.4') {
  throw "prepare:swa must install the Sharp Linux x64 runtime."
}

if ($prepare -notmatch '@img/sharp-libvips-linux-x64@1\.3\.3') {
  throw "prepare:swa must install the libvips Linux x64 runtime."
}

Write-Output "SWA Sharp Linux runtime guard passed."
