[CmdletBinding()]
param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is required.' }
$installArgs = @('install', '--frozen-lockfile', '--force')
if ($Offline) { $installArgs += '--offline' }

# pnpm rebuilds generated links for the new absolute path. No shell deletion is used.
foreach ($packagePath in @('logistics-sandbox', 'ecommerce-hive-nosql/backend', 'ecommerce-hive-nosql/web')) {
    $packageRoot = Join-Path $workspaceRoot $packagePath
    Write-Output "Installing locked dependencies: $packagePath"
    Push-Location -LiteralPath $packageRoot
    try {
        # Check manifest/lockfile consistency before force can recreate generated links.
        & pnpm install --lockfile-only --frozen-lockfile --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw "Manifest/lockfile mismatch for $packagePath. Align the declared range without changing resolved versions before repairing links." }
        & pnpm @installArgs
        if ($LASTEXITCODE -ne 0) { throw "Dependency repair failed for $packagePath. Inspect the pnpm error; retry without -Offline only for a missing local store entry." }
    } finally { Pop-Location }
}
Write-Output 'Locked dependency installation completed. Run each repository typecheck/test to assess source readiness.'
