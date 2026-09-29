param(
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "src-tauri\target\release"
$artifactDir = Join-Path $root "artifacts\build"
$portableDir = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-portable"
$zipPath = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-portable.zip"
$setupSource = Join-Path $releaseDir "bundle\nsis\SnipasteVeya_0.1.0_x64-setup.exe"

if (!(Test-Path (Join-Path $releaseDir "snipasteveya.exe"))) { throw "Release executable not found: $releaseDir" }
if (!(Test-Path $setupSource)) { throw "NSIS installer not found: $setupSource" }

New-Item -ItemType Directory -Force $artifactDir | Out-Null
if (Test-Path $portableDir) { Remove-Item -LiteralPath $portableDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Force $portableDir | Out-Null
Copy-Item (Join-Path $releaseDir "snipasteveya.exe") (Join-Path $portableDir "SnipasteVeya.exe")
if (Test-Path (Join-Path $releaseDir "DirectML.dll")) { Copy-Item (Join-Path $releaseDir "DirectML.dll") $portableDir }
Copy-Item (Join-Path $releaseDir "resources") (Join-Path $portableDir "resources") -Recurse
Copy-Item (Join-Path $root ".tooling\webview2.cab") (Join-Path $portableDir "WebView2Runtime.cab")
@"
SnipasteVeya $Version portable package

Run SnipasteVeya.exe. The WebView2Runtime.cab is included for offline deployment
and is used by the installer when WebView2 is not already present.
"@ | Set-Content (Join-Path $portableDir "README.txt") -Encoding utf8
Compress-Archive -Path (Join-Path $portableDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item $setupSource (Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-setup.exe") -Force
 $setupAsset = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-setup.exe"
 $portableAsset = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-portable.zip"
 $sumLines = @(
   "$(Get-FileHash $setupAsset -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $([IO.Path]::GetFileName($setupAsset))"
   "$(Get-FileHash $portableAsset -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $([IO.Path]::GetFileName($portableAsset))"
 )
 [IO.File]::WriteAllText((Join-Path $artifactDir "SHA256SUMS.txt"), ($sumLines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Write-Host "Created $zipPath"
