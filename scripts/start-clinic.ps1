<#
  Runs Dermverse on the clinic server PC.
  Other PCs on the clinic network open:  http://<server-pc-name>:8000

  Build the frontend first (once per update):  .\scripts\update.ps1
  To start automatically at boot, register this script as a Windows service with NSSM:
    nssm install Dermverse powershell -ExecutionPolicy Bypass -File D:\Dermiverse\scripts\start-clinic.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "backend")
& .\.venv\Scripts\python.exe manage.py check --deploy --fail-level ERROR
& .\.venv\Scripts\waitress-serve.exe --listen=0.0.0.0:8000 --threads=8 config.wsgi:application
