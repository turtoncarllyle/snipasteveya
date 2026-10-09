$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$profile = if ($env:TAURI_ENV_DEBUG -eq 'true') { 'debug' } else { 'release' }
$targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $projectRoot 'src-tauri\target' }
$candidates = @((Join-Path $targetDir "$profile\DirectML.dll"))
if ($env:TAURI_ENV_TARGET_TRIPLE) {
  $candidates += Join-Path $targetDir "$($env:TAURI_ENV_TARGET_TRIPLE)\$profile\DirectML.dll"
}
$directML = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$directML) { throw 'DirectML.dll was not produced by the OCR build; refusing to create an incomplete installer.' }
$nativeDir = Join-Path $projectRoot 'src-tauri\runtime'
if (!(Test-Path -LiteralPath (Join-Path $nativeDir 'msvcp140_1.dll'))) {
  throw 'Run scripts\prepare-windows-runtime.ps1 before bundling.'
}
Copy-Item -LiteralPath $directML -Destination (Join-Path $nativeDir 'DirectML.dll') -Force
Write-Host 'Included DirectML.dll in the installer resources.'
