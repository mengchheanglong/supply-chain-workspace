[CmdletBinding()]
param(
    [switch]$RealOsm
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Executing Cross-Repository Operational Planning Pipeline (SIM-EXP-01)..." -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'Run-Pipeline.mjs')

if ($LASTEXITCODE -ne 0) {
    throw "Pipeline execution failed with exit code $LASTEXITCODE"
}
