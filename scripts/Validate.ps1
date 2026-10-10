[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

foreach ($relativePath in @('AGENTS.md', 'README.md', 'workspace.json', 'docs/PLAN.md', 'docs/ARCHITECTURE.md', 'docs/BACKLOG.md', 'docs/SETUP_STATUS.md', 'compose.yaml', 'compose.osm.yaml', 'osm-pathfinder/Cargo.lock', 'infrastructure/routing/Dockerfile', 'infrastructure/sandbox/backend.Dockerfile', 'infrastructure/sandbox/frontend.Dockerfile')) {
    Assert-Condition (Test-Path -LiteralPath (Join-Path $workspaceRoot $relativePath) -PathType Leaf) "Missing required file: $relativePath"
}
$manifest = Get-Content -Raw -LiteralPath (Join-Path $workspaceRoot 'workspace.json') | ConvertFrom-Json
Assert-Condition ($manifest.schemaVersion -eq 1) 'Unknown workspace registry version.'
$registeredPorts = @($manifest.hostPorts.PSObject.Properties | ForEach-Object { [int]$_.Value })
Assert-Condition (@($registeredPorts | Select-Object -Unique).Count -eq $registeredPorts.Count) 'Registry contains colliding host ports.'

foreach ($scriptFile in (Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')) {
    $scriptTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$scriptTokens, [ref]$parseErrors) | Out-Null
    Assert-Condition ($parseErrors.Count -eq 0) "PowerShell syntax error in $($scriptFile.Name): $parseErrors"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Compose CLI is required for configuration validation.' }
$baseArgs = @('compose', '--project-directory', $workspaceRoot, '-f', (Join-Path $workspaceRoot 'compose.yaml'))
foreach ($realOsm in @($false, $true)) {
    $composeArgs = $baseArgs
    if ($realOsm) { $composeArgs += @('-f', (Join-Path $workspaceRoot 'compose.osm.yaml')) }
    $composeArgs += @('--profile', '*', 'config', '--format', 'json')
    $configText = & docker @composeArgs
    Assert-Condition ($LASTEXITCODE -eq 0) 'Compose configuration failed.'
    $config = $configText | ConvertFrom-Json
    Assert-Condition (@($config.services.PSObject.Properties).Count -eq 4) 'Unexpected service enabled in initial workspace.'
    Assert-Condition ($config.services.postgres.environment.POSTGRES_DB -eq 'supply_chain_ops') 'Bootstrap requires the fixed operations database name.'
    Assert-Condition ($config.services.postgres.environment.POSTGRES_PASSWORD_FILE -eq '/run/secrets/postgres_admin_password') 'Admin credentials must use a file secret.'
    Assert-Condition ($config.services.routing.environment.SERVER_HOST -eq '0.0.0.0') 'Router must listen on the container interface.'
    Assert-Condition ($null -eq $config.services.routing.secrets -or @($config.services.routing.secrets).Count -eq 0) 'Router must not receive database credentials.'
    Assert-Condition (@($config.services.routing.networks.PSObject.Properties.Name).Count -eq 1 -and @($config.services.routing.networks.PSObject.Properties.Name) -contains 'planning') 'Routing must stay on its planning network.'
    Assert-Condition ($null -eq $config.services.'sandbox-api'.secrets -or @($config.services.'sandbox-api'.secrets).Count -eq 0) 'Sandbox API must not receive database credentials.'
    Assert-Condition ($null -eq $config.services.'sandbox-web'.secrets -or @($config.services.'sandbox-web'.secrets).Count -eq 0) 'Sandbox web must not receive database credentials.'
    Assert-Condition (@($config.services.'sandbox-api'.networks.PSObject.Properties.Name).Count -eq 1 -and @($config.services.'sandbox-api'.networks.PSObject.Properties.Name) -contains 'planning') 'Sandbox API must stay on its planning network.'
    Assert-Condition (@($config.services.'sandbox-web'.networks.PSObject.Properties.Name).Count -eq 1 -and @($config.services.'sandbox-web'.networks.PSObject.Properties.Name) -contains 'planning') 'Sandbox web must stay on its planning network.'
    Assert-Condition (@($config.services.'sandbox-api'.profiles) -contains 'simulation') 'Sandbox API must belong to simulation profile.'
    Assert-Condition (@($config.services.'sandbox-web'.profiles) -contains 'simulation') 'Sandbox web must belong to simulation profile.'
    Assert-Condition (@($config.services.postgres.networks.PSObject.Properties.Name).Count -eq 1 -and @($config.services.postgres.networks.PSObject.Properties.Name) -contains 'operations') 'Database must stay on its operations network.'
    Assert-Condition ($config.networks.operations.driver -eq 'bridge' -and $config.networks.planning.driver -eq 'bridge') 'Use separate bridge networks for local host access.'
    Assert-Condition (@($config.services.postgres.volumes | Where-Object { $_.type -eq 'volume' -and $_.target -eq '/var/lib/postgresql' }).Count -eq 1) 'PostgreSQL 18 requires the parent data volume path.'
    $publishedPorts = @()
    foreach ($service in $config.services.PSObject.Properties) {
        foreach ($port in $service.Value.ports) {
            Assert-Condition ($port.host_ip -eq '127.0.0.1') 'Local ports must be bound to loopback.'
            $publishedPorts += $port.published
        }
    }
    Assert-Condition (@($publishedPorts | Select-Object -Unique).Count -eq $publishedPorts.Count) 'Compose contains colliding host ports.'
    foreach ($secret in $config.secrets.PSObject.Properties) {
        Assert-Condition (Test-Path -LiteralPath $secret.Value.file -PathType Leaf) "Missing secret file: $($secret.Name). Run Setup.ps1."
    }
    if ($realOsm) {
        Assert-Condition ($config.services.routing.command[0] -eq '--data') 'OSM overlay must replace demo command.'
        $osmMount = @($config.services.routing.volumes | Where-Object { $_.target -eq '/data/network.osm.pbf' })
        Assert-Condition ($osmMount.Count -eq 1 -and $osmMount[0].read_only -and -not $osmMount[0].bind.create_host_path) 'OSM mount must be read-only and must not create a missing source.'
    } else {
        Assert-Condition ($config.services.routing.command[0] -eq '--demo') 'Default router must explicitly declare demo mode.'
    }
}

if (Test-Path -LiteralPath (Join-Path $workspaceRoot '.git')) {
    foreach ($ignoredPath in @('.env', '.secrets/postgres-admin-password.txt', 'runtime/artifacts/', 'supply-chain-platform/', 'logistics-sandbox/', 'osm-pathfinder/', 'ecommerce-hive-nosql/', 'distribution-intelligence/', 'platform-admin/')) {
        & git -C $workspaceRoot check-ignore --quiet -- $ignoredPath
        Assert-Condition ($LASTEXITCODE -eq 0) "Root Git must ignore: $ignoredPath"
    }
    $tracked = & git -C $workspaceRoot ls-files
    Assert-Condition (-not @($tracked | Where-Object { $_ -match '^(\.secrets/|runtime/|supply-chain-platform/|logistics-sandbox/|osm-pathfinder/|ecommerce-hive-nosql/|distribution-intelligence/|platform-admin/)' }).Count) 'Root Git is tracking private/generated or nested repository content.'
}
Write-Output 'PASS: PowerShell syntax, registry, base/OSM Compose, secret files, ports, networks and Git boundaries.'
Write-Output 'Container images, database bootstrap and application behavior require runtime verification separately.'
