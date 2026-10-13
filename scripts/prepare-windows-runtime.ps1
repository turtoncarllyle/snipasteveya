param(
  [string]$VCRuntimeDirectory = "$env:WINDIR\System32"
)

$ErrorActionPreference = 'Stop'
# Use this PowerShell edition's module when a parent process supplies a
# PSModulePath containing modules from another PowerShell installation.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$LiteralPath)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runtimePath = Join-Path (Join-Path $projectRoot 'src-tauri') $config.bundle.windows.webviewInstallMode.path
$runtimeExe = Join-Path $runtimePath 'msedgewebview2.exe'
$webviewVersion = '154.0.4258.37'
$cabHash = '143DA7F7C4939FDDD3875ED918E44022D7EB87063BF912FE3E32DF37C6B0B8C3'
$cabUrl = 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/b82d47e8-d146-4563-94d1-3a3176b25c0a/Microsoft.WebView2.FixedVersionRuntime.154.0.4258.37.x64.cab'
$cab = Join-Path $projectRoot '.tooling\webview2.cab'

if (!(Test-Path -LiteralPath $runtimeExe)) {
  [IO.Directory]::CreateDirectory((Split-Path -Parent $cab)) | Out-Null
  if (!(Test-Path -LiteralPath $cab)) {
    & curl.exe --fail --location --silent --show-error --output $cab $cabUrl
    if ($LASTEXITCODE -ne 0) { throw 'Failed to download the fixed WebView2 runtime.' }
  }
  if ((Get-Sha256Hex -LiteralPath $cab) -ne $cabHash) {
    throw 'WebView2 CAB checksum mismatch. Obtain the pinned Microsoft runtime before building.'
  }
  $destination = Join-Path $projectRoot 'src-tauri\WebView2'
  [IO.Directory]::CreateDirectory($destination) | Out-Null
  & expand.exe $cab '-F:*' $destination | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to extract WebView2.' }
}
if ((Get-Item -LiteralPath $runtimeExe).VersionInfo.ProductVersion -ne $webviewVersion) {
  throw "Expected WebView2 $webviewVersion."
}
if ((Get-AuthenticodeSignature -LiteralPath $runtimeExe).Status -ne 'Valid') {
  throw 'WebView2 signature validation failed.'
}

# App-local DLLs also cover ONNX Runtime's C++ dependencies. End users do not
# install the redistributable; a build host supplies Microsoft's x64 DLLs.
$nativeDir = Join-Path $projectRoot 'src-tauri\runtime'
[IO.Directory]::CreateDirectory($nativeDir) | Out-Null
$nativeFiles = @('msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'concrt140.dll')
foreach ($name in $nativeFiles) {
  $source = Join-Path $VCRuntimeDirectory $name
  if (!(Test-Path -LiteralPath $source)) {
    throw "Missing $name. Install the x64 Visual C++ 2015-2026 redistributable on the build machine, or supply -VCRuntimeDirectory."
  }
  if ([version](Get-Item -LiteralPath $source).VersionInfo.ProductVersion -lt [version]'14.51.36247.0') {
    throw "Update the build machine's x64 Visual C++ runtime: $name is older than 14.51.36247.0."
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $nativeDir $name) -Force
}
Write-Host "Prepared WebView2 $webviewVersion and app-local Visual C++ DLLs."
