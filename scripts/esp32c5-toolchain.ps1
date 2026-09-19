[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet("Compile", "Upload")]
  [string]$Action,

  [Parameter(Mandatory)]
  [string]$SketchDirectory,

  [Parameter(Mandatory)]
  [string]$BuildPath,

  [string]$Port = "COM4",

  [string]$Fqbn = "esp32:esp32:sparkfun_esp32c5_thing_plus",

  [string[]]$ExtraBuildProperty = @()
)

$ErrorActionPreference = "Stop"

$arduinoCli = "C:\Program Files\Arduino CLI\arduino-cli.exe"
if (-not (Test-Path -LiteralPath $arduinoCli)) {
  throw "Arduino CLI was not found at $arduinoCli"
}

$python = (Get-Command python -ErrorAction Stop).Source
$esptool = (Get-Command esptool.exe -ErrorAction Stop).Source
$esptoolDirectory = Split-Path -Parent $esptool
$coreRoot = Join-Path $env:LOCALAPPDATA "Arduino15\packages\esp32\hardware\esp32"
$core = Get-ChildItem -LiteralPath $coreRoot -Directory |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1

if (-not $core) {
  throw "No installed Espressif Arduino core was found under $coreRoot"
}

$partitionTool = Join-Path $core.FullName "tools\gen_esp32part.py"
if (-not (Test-Path -LiteralPath $partitionTool)) {
  throw "Partition generator was not found at $partitionTool"
}

$resolvedSketch = (Resolve-Path -LiteralPath $SketchDirectory).Path
New-Item -ItemType Directory -Force -Path $BuildPath | Out-Null
$resolvedBuild = (Resolve-Path -LiteralPath $BuildPath).Path

if ($Action -eq "Compile") {
  $partitionWrapper = Join-Path $resolvedBuild "gen-esp32part-policy-compatible.cmd"
  @(
    "@echo off"
    "`"$python`" `"$partitionTool`" %*"
  ) | Set-Content -LiteralPath $partitionWrapper -Encoding ascii

  $compileArgs = @(
    "compile",
    "--fqbn", $Fqbn,
    "--build-path", $resolvedBuild,
    "--build-property", "tools.esptool_py.path=$esptoolDirectory",
    "--build-property", "tools.gen_esp32part.cmd.windows=$partitionWrapper"
  )
  foreach ($property in $ExtraBuildProperty) {
    $compileArgs += @("--build-property", $property)
  }
  $compileArgs += $resolvedSketch

  & $arduinoCli @compileArgs

  if ($LASTEXITCODE -ne 0) {
    throw "ESP32-C5 compilation failed with exit code $LASTEXITCODE"
  }
  exit 0
}

$flashArgsPath = Join-Path $resolvedBuild "flash_args"
if (-not (Test-Path -LiteralPath $flashArgsPath)) {
  throw "Compile first; flash manifest was not found at $flashArgsPath"
}

$portMatch = & $arduinoCli board list | Select-String -Pattern "^$([regex]::Escape($Port))\s"
if (-not $portMatch) {
  throw "ESP32-C5 was not detected on $Port"
}

$flashArguments = @()
foreach ($line in Get-Content -LiteralPath $flashArgsPath) {
  $trimmed = $line.Trim()
  if ($trimmed) {
    $flashArguments += $trimmed -split "\s+"
  }
}

$esptoolArguments = @(
  "-m", "esptool",
  "--chip", "esp32c5",
  "--port", $Port,
  "--baud", "921600",
  "--before", "default-reset",
  "--after", "hard-reset",
  "write-flash"
) + $flashArguments

Push-Location $resolvedBuild
try {
  & $python @esptoolArguments
  if ($LASTEXITCODE -ne 0) {
    throw "ESP32-C5 upload failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
