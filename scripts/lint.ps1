# Run ESLint via node scripts/run-eslint.js (same as lint.cmd).
# Avoids: (1) npm.ps1 + execution policy, (2) npm.cmd spawning cmd.exe which
# rejects UNC cwd and falls back to C:\Windows.
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-eslint.js'
& node $runner
exit $LASTEXITCODE
