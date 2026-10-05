<#
  Daily backup of the Dermverse database and uploaded files.
  Schedule with Windows Task Scheduler (e.g. every day at 9 PM):
    powershell -ExecutionPolicy Bypass -File D:\Dermiverse\scripts\backup.ps1

  Copies are kept in .\backups and, if set, mirrored to $OffsiteDir
  (an external drive or a Google Drive / OneDrive synced folder).
#>
param(
  [string]$OffsiteDir = "",
  [int]$KeepDays = 30
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$dest = Join-Path $root "backups"
New-Item -ItemType Directory -Force $dest | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"

# Read DATABASE_URL from backend\.env
$dbUrl = (Get-Content (Join-Path $backend ".env") -ErrorAction SilentlyContinue |
  Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=", ""

if ($dbUrl -like "postgres*") {
  $file = Join-Path $dest "dermverse_$stamp.dump"
  & pg_dump --format=custom --file="$file" "$dbUrl"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
} else {
  $file = Join-Path $dest "dermverse_$stamp.sqlite3"
  Copy-Item (Join-Path $backend "db.sqlite3") $file
}

$media = Join-Path $backend "media"
if (Test-Path $media) {
  Compress-Archive -Path "$media\*" -DestinationPath (Join-Path $dest "media_$stamp.zip") -Force
}

# Keep the last $KeepDays days
Get-ChildItem $dest | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force

if ($OffsiteDir) {
  New-Item -ItemType Directory -Force $OffsiteDir | Out-Null
  Copy-Item "$dest\*_$stamp*" $OffsiteDir
}
Set-Content (Join-Path $dest "LAST_SUCCESS.txt") (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Write-Host "Backup complete: $file"
