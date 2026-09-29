param(
  [string]$Version = "0.1.0",
  [string]$Directory = "artifacts/build"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root $Directory
$setup = Join-Path $dir "SnipasteVeya-$Version-win-x64-setup.exe"
$portable = Join-Path $dir "SnipasteVeya-$Version-win-x64-portable.zip"
$sums = Join-Path $dir "SHA256SUMS.txt"
foreach ($file in @($setup, $portable, $sums)) { if (!(Test-Path $file)) { throw "Missing release asset: $file" } }
$lines = @(
  "$(Get-FileHash $setup -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $([IO.Path]::GetFileName($setup))"
  "$(Get-FileHash $portable -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $([IO.Path]::GetFileName($portable))"
)
$expected = $lines -join [Environment]::NewLine
$actual = (Get-Content $sums -Raw).Trim()
if ($actual -ne $expected) { throw "SHA256SUMS.txt does not match local assets" }
Write-Host "Release assets verified: $dir"
Write-Host $expected
