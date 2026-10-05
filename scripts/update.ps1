<#
  Installs a new version: backup first, then dependencies, database migrations and a fresh frontend build.
  Run from the server PC after pulling the latest code (git pull) or unzipping a release.
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "1/4 Backing up..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "backup.ps1")

Write-Host "2/4 Backend dependencies and migrations..." -ForegroundColor Yellow
Set-Location (Join-Path $root "backend")
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\pip.exe install -q -r requirements.txt
& .\.venv\Scripts\python.exe manage.py migrate --noinput
& .\.venv\Scripts\python.exe manage.py collectstatic --noinput | Out-Null

Write-Host "3/4 Building the app screens..." -ForegroundColor Yellow
Set-Location (Join-Path $root "frontend")
npm ci --no-audit --no-fund
npm run build

Write-Host "4/4 Done. Restart the Dermverse service (or start-clinic.ps1)." -ForegroundColor Green
