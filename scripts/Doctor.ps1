[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $workspaceRoot 'workspace.json') | ConvertFrom-Json

foreach ($toolName in @('git', 'docker', 'node', 'pnpm', 'cargo')) {
    $tool = Get-Command $toolName -ErrorAction SilentlyContinue
    if ($tool) { Write-Output "AVAILABLE: $toolName ($($tool.Source))" }
    else { Write-Output "MISSING: $toolName" }
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
    & docker compose version
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Output 'READY: Docker engine' }
    else { Write-Output 'STOPPED: Docker engine. Start Docker Desktop before workspace up.' }
}
foreach ($repo in $manifest.repositories) {
    $repoPath = Join-Path $workspaceRoot $repo.path
    if (-not (Test-Path -LiteralPath $repoPath)) { Write-Output "PLANNED: $($repo.path)"; continue }
    if (Test-Path -LiteralPath (Join-Path $repoPath '.git')) {
        Write-Output "REPOSITORY: $($repo.path)"
        & git -C $repoPath status --short
    } else { Write-Output "UNINITIALIZED: $($repo.path)" }
}
foreach ($packagePath in @('logistics-sandbox/backend', 'logistics-sandbox/frontend', 'ecommerce-hive-nosql/backend', 'ecommerce-hive-nosql/web')) {
    $compilerPath = Join-Path $workspaceRoot "$packagePath/node_modules/typescript/bin/tsc"
    if (Test-Path -LiteralPath $compilerPath -PathType Leaf) { Write-Output "LINK OK: $packagePath TypeScript" }
    else { Write-Output "DEPENDENCIES NOT READY: $packagePath (run Repair-Dependencies.ps1)" }
}
Write-Output 'Configured services: postgres (default); routing (optional). Application profiles are pending Phase 0.'
