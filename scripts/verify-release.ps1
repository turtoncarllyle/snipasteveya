param([string]$Version, [string]$Directory)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (!$Version) { $Version = $package.version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
if (!$Directory) { $Directory = "artifacts\build\v$Version" }
$dir = if ([IO.Path]::IsPathRooted($Directory)) { $Directory } else { Join-Path $projectRoot $Directory }
$setup = Join-Path $dir "SnipasteVeya-$Version-win-x64-setup.exe"
$portable = Join-Path $dir "SnipasteVeya-$Version-win-x64-portable.zip"
$sums = Join-Path $dir 'SHA256SUMS.txt'
foreach ($file in @($setup, $portable, $sums)) { if (!(Test-Path -LiteralPath $file)) { throw "Missing release asset: $file" } }
$expected = foreach ($file in @($setup, $portable)) {
  '{0}  {1}' -f (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash, [IO.Path]::GetFileName($file)
}
$actual = @(Get-Content -LiteralPath $sums -Encoding UTF8 | Where-Object { $_.Trim() })
if (@(Compare-Object $expected $actual).Count) { throw 'SHA256SUMS.txt does not match the release assets.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($portable)
try {
  $config = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $runtime = $config.bundle.windows.webviewInstallMode.path.Replace('\', '/')
  $required = @('SnipasteVeya.exe', 'DirectML.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'README.txt', 'resources/ocr/pp-ocrv5_mobile_det.onnx', 'resources/ocr/pp-ocrv5_mobile_rec.onnx', 'resources/ocr/ppocrv5_dict.txt', "$runtime/msedgewebview2.exe", "$runtime/msedge.dll", "$runtime/icudtl.dat")
  $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  foreach ($name in $required) { if ($entries -notcontains $name) { throw "Portable package is missing $name" } }
} finally { $archive.Dispose() }
Write-Host "Release assets and portable contents verified: $dir"
$expected | ForEach-Object { Write-Host $_ }
