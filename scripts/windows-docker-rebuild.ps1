#Requires -Version 5.1
<#
.SYNOPSIS
  Rebuild and restart the w0pium Docker stack (same as: docker compose up --build -d).

  Intended for Windows Task Scheduler. Run from repo root or rely on default $RepoRoot.

.PARAMETER RepoRoot
  Path to the w0pium repo (folder that contains docker-compose.yml). Defaults to parent of this script's directory.
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $RepoRoot 'data'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("docker-rebuild-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Message) {
  $line = "{0:u} {1}" -f (Get-Date), $Message
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

Write-Log "Starting rebuild; RepoRoot=$RepoRoot"
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot 'docker-compose.yml'))) {
  Write-Log "ERROR: docker-compose.yml not found under $RepoRoot"
  exit 1
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Log "ERROR: docker not on PATH (install Docker Desktop / CLI and ensure it runs non-interactively)."
  exit 1
}

# Prefer Compose V2
$composeArgs = @('compose', 'up', '--build', '-d')
& docker @composeArgs
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Log "ERROR: docker compose exited with $code"
  exit $code
}

Write-Log "OK: docker compose up --build -d finished."
exit 0
