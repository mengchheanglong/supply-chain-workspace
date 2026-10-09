[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot

function New-LocalPassword {
    $passwordBytes = New-Object byte[] 32
    $passwordGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $passwordGenerator.GetBytes($passwordBytes) }
    finally { $passwordGenerator.Dispose() }
    return [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$envPath = Join-Path $workspaceRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath (Join-Path $workspaceRoot '.env.example') -Destination $envPath
}
foreach ($relativePath in @('.secrets', 'runtime/artifacts', 'runtime/reports')) {
    New-Item -ItemType Directory -Path (Join-Path $workspaceRoot $relativePath) -Force | Out-Null
}
foreach ($secretName in @('postgres-admin', 'operations-app', 'planning-app', 'snapshot-reader')) {
    $secretPath = Join-Path $workspaceRoot ".secrets/$secretName-password.txt"
    if (-not (Test-Path -LiteralPath $secretPath)) {
        [IO.File]::WriteAllText($secretPath, (New-LocalPassword), $utf8)
    }
}
Write-Output 'Local .env, credentials and artifact directories are ready. Existing values were preserved.'
Write-Output 'Run ./scripts/Validate.ps1, then ./scripts/Workspace.ps1 up.'
