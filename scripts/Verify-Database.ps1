[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$composeArgs = @('compose', '--project-directory', $workspaceRoot, '-f', (Join-Path $workspaceRoot 'compose.yaml'))

# A rolled-back probe proves grants on app-owned tables without retaining test data.
# psql prints only booleans; credentials are not read or printed by this script.
$operationsSql = @'
BEGIN;
SET ROLE operations_app;
CREATE TABLE public.workspace_access_probe (id integer);
INSERT INTO public.workspace_access_probe VALUES (1);
RESET ROLE;
SELECT
  NOT has_database_privilege('operations_app', 'distribution_planning', 'CONNECT')
  AND NOT has_database_privilege('planning_app', 'supply_chain_ops', 'CONNECT')
  AND NOT has_database_privilege('snapshot_reader', 'distribution_planning', 'CONNECT')
  AND has_table_privilege('snapshot_reader', 'public.workspace_access_probe', 'SELECT')
  AND NOT has_table_privilege('snapshot_reader', 'public.workspace_access_probe', 'INSERT')
  AND NOT has_table_privilege('snapshot_reader', 'public.workspace_access_probe', 'UPDATE')
  AND NOT has_table_privilege('snapshot_reader', 'public.workspace_access_probe', 'DELETE')
  AND NOT has_schema_privilege('snapshot_reader', 'public', 'CREATE');
SET ROLE snapshot_reader;
SELECT count(*) = 1 FROM public.workspace_access_probe;
RESET ROLE;
ROLLBACK;
'@
$execArgs = @('exec', '-T', 'postgres', 'sh', '-c', 'exec psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1')
$probeResults = @($operationsSql | & docker @composeArgs @execArgs)
if ($LASTEXITCODE -ne 0 -or $probeResults.Count -ne 2 -or @($probeResults | Where-Object { $_ -ne 't' }).Count) {
    throw 'Operational/planning access or read-only table-grant verification failed.'
}
$planningSql = "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis');"
$execArgs = @('exec', '-T', 'postgres', 'sh', '-c', 'exec psql -X -qAt -U "$POSTGRES_USER" -d distribution_planning -v ON_ERROR_STOP=1')
$extensionResult = $planningSql | & docker @composeArgs @execArgs
if ($LASTEXITCODE -ne 0 -or $extensionResult -ne 't') { throw 'Planning PostGIS extension verification failed.' }
Write-Output 'PASS: cross-database application isolation, snapshot SELECT-only grants, app-owned tables and planning PostGIS. Probe rolled back.'
