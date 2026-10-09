param([string]$Version)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (!$Version) { $Version = $package.version }
if ($Version -ne $package.version -or $Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Package version must match package.json.' }
$releaseDir = Join-Path $projectRoot 'src-tauri\target\release'
$artifactDir = Join-Path $projectRoot "artifacts\build\v$Version"
$portableDir = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-portable"
$zipPath = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-portable.zip"
$setupSource = Join-Path $releaseDir "bundle\nsis\SnipasteVeya_${Version}_x64-setup.exe"
$nativeDir = Join-Path $projectRoot 'src-tauri\runtime'
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$webviewPath = Join-Path $releaseDir $config.bundle.windows.webviewInstallMode.path

foreach ($file in @((Join-Path $releaseDir 'snipasteveya.exe'), $setupSource, (Join-Path $nativeDir 'DirectML.dll'), (Join-Path $webviewPath 'msedgewebview2.exe'))) {
  if (!(Test-Path -LiteralPath $file)) { throw "Missing build output: $file" }
}
# Keep each version in a separate directory and refuse to replace an existing
# archive. A stale package must not silently overwrite a published build.
if ((Test-Path -LiteralPath $portableDir) -or (Test-Path -LiteralPath $zipPath)) { throw "Package already exists: $artifactDir" }
[IO.Directory]::CreateDirectory($portableDir) | Out-Null
Copy-Item -LiteralPath (Join-Path $releaseDir 'snipasteveya.exe') -Destination (Join-Path $portableDir 'SnipasteVeya.exe')
Get-ChildItem -LiteralPath $nativeDir -Filter '*.dll' -File | Copy-Item -Destination $portableDir
Copy-Item -LiteralPath (Join-Path $releaseDir 'resources') -Destination (Join-Path $portableDir 'resources') -Recurse
Copy-Item -LiteralPath (Join-Path $releaseDir 'WebView2') -Destination (Join-Path $portableDir 'WebView2') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $portableDir
@"
SnipasteVeya $Version

中文
解压整个压缩包后运行 SnipasteVeya.exe。请保留旁边的 DLL、resources 和
WebView2 文件夹。已内置固定 WebView2 与中英文 OCR 模型，首次启动无需下载。
F1 截图，F3 贴图，Shift+F3 隐藏/显示全部贴图；设置在系统托盘菜单中。
如果快捷键已被 Snipaste 等程序占用，请退出占用程序或在设置中修改快捷键。

English
Extract the entire archive and run SnipasteVeya.exe. Keep the DLLs, resources
and WebView2 folders next to it. The fixed WebView2 runtime and bilingual OCR
models are bundled; first launch does not download them.
F1 captures, F3 pins, Shift+F3 toggles all pins. Open Settings from the tray.
If another app uses these keys, close it or select different keys in Settings.
"@ | Set-Content -LiteralPath (Join-Path $portableDir 'README.txt') -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($portableDir, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
$setupAsset = Join-Path $artifactDir "SnipasteVeya-$Version-win-x64-setup.exe"
Copy-Item -LiteralPath $setupSource -Destination $setupAsset
$sumLines = foreach ($file in @($setupAsset, $zipPath)) {
  '{0}  {1}' -f (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash, [IO.Path]::GetFileName($file)
}
[IO.File]::WriteAllText((Join-Path $artifactDir 'SHA256SUMS.txt'), ($sumLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "Created release assets in $artifactDir"
