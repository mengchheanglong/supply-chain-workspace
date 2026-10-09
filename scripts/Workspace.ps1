[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet('up', 'down', 'status', 'logs', 'validate')]
    [string]$Action = 'status',
    [switch]$Routing,
    [switch]$RealOsm,
    [switch]$Simulation
)
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required.' }
if ($Action -eq 'validate') { & (Join-Path $PSScriptRoot 'Validate.ps1'); return }

$composeArgs = @('compose', '--project-directory', $workspaceRoot, '-f', (Join-Path $workspaceRoot 'compose.yaml'))
if ($RealOsm) {
    $envPath = Join-Path $workspaceRoot '.env'
    $osmPath = './osm-pathfinder/data/cambodia-latest.osm.pbf'
    if (Test-Path -LiteralPath $envPath) {
        foreach ($line in (Get-Content -LiteralPath $envPath)) {
            if ($line -match '^OSM_PBF_PATH=(.+)$') { $osmPath = $Matches[1].Trim().Trim('"').Trim("'") }
        }
    }
    if ($env:OSM_PBF_PATH) { $osmPath = $env:OSM_PBF_PATH }
    if (-not [IO.Path]::IsPathRooted($osmPath)) { $osmPath = Join-Path $workspaceRoot $osmPath }
    if ($Action -eq 'up' -and -not (Test-Path -LiteralPath $osmPath -PathType Leaf)) {
        throw 'Real OSM input is missing. Set OSM_PBF_PATH in .env to an existing .osm.pbf file.'
    }
    $composeArgs += @('-f', (Join-Path $workspaceRoot 'compose.osm.yaml'))
}
if ($Routing -or $RealOsm) { $composeArgs += @('--profile', 'routing') }
if ($Simulation) { $composeArgs += @('--profile', 'simulation') }

switch ($Action) {
    'up' {
        & (Join-Path $PSScriptRoot 'Setup.ps1')
        & (Join-Path $PSScriptRoot 'Validate.ps1')
        & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Docker engine is stopped. Start Docker Desktop, then rerun this command.' }
        $composeArgs += @('up', '-d', '--build', '--wait', '--wait-timeout', '600')
    }
    'down' { $composeArgs += @('--profile', '*', 'down') }
    'status' { $composeArgs += @('--profile', '*', 'ps') }
    'logs' { $composeArgs += @('--profile', '*', 'logs', '--tail', '100') }
}
& docker @composeArgs
if ($LASTEXITCODE -ne 0) { throw "Docker Compose $Action failed." }
