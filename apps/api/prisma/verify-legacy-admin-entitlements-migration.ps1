[CmdletBinding()]
param(
  [string]$Image = 'postgres:16-alpine'
)

$ErrorActionPreference = 'Stop'
$container = "dau-vo-legacy-entitlements-verify-$PID"
$port = Get-Random -Minimum 55000 -Maximum 59999
$apiRoot = Split-Path -Parent $PSScriptRoot
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260911150000_legacy_admin_transitional_entitlements'
$unifiedUsersName = '20260911090000_unified_users_and_auth'
$migrations = @(Get-ChildItem -Directory $migrationRoot | Sort-Object Name)
$beforeTarget = @($migrations | Where-Object Name -lt $targetName)
$beforeUnifiedUsers = @($migrations | Where-Object Name -lt $unifiedUsersName)
$featureMigrations = @($migrations | Where-Object { $_.Name -ge $unifiedUsersName -and $_.Name -lt $targetName })
$targetSql = Join-Path $migrationRoot "$targetName/migration.sql"

function Invoke-Sql([string]$Database, [string]$Sql) {
  # PostgreSQL emits benign NOTICE lines on stderr. Allow native stderr while
  # retaining explicit exit-code handling for actual SQL failures.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $Sql | & docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw "SQL failed for disposable database $Database." }
}

function Invoke-MigrationFile([string]$Database, [string]$Path) {
  Invoke-Sql $Database (Get-Content -Raw $Path)
}

function Initialize-Database([string]$Database, $MigrationSet) {
  Invoke-Sql 'postgres' "CREATE DATABASE `"$Database`";"
  foreach ($migration in $MigrationSet) {
    Invoke-MigrationFile $Database (Join-Path $migration.FullName 'migration.sql')
  }
}

function Assert-Scalar([string]$Database, [string]$Query, [string]$Expected) {
  $value = (& docker exec $container psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d $Database -c $Query).Trim()
  if ($LASTEXITCODE -ne 0 -or $value -ne $Expected) {
    throw "Expected '$Expected' from [$Query], received '$value'."
  }
}

try {
  & docker run --rm -d --name $container -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:${port}:5432" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable PostgreSQL container.' }
  do {
    Start-Sleep -Milliseconds 500
    & docker exec $container pg_isready -U postgres | Out-Null
  } until ($LASTEXITCODE -eq 0)

  # Fresh database: all prior migrations plus this data migration work with no rows.
  Initialize-Database 'legacy_entitlements_fresh' $beforeTarget
  Invoke-MigrationFile 'legacy_entitlements_fresh' $targetSql
  Assert-Scalar 'legacy_entitlements_fresh' 'SELECT count(*) FROM admin_entitlements;' '0'

  # Representative pre-feature snapshot: start before unified users/entitlements,
  # seed legacy admin_users and tournaments, then apply the feature migration chain.
  Initialize-Database 'legacy_entitlements_upgrade' $beforeUnifiedUsers
  Invoke-Sql 'legacy_entitlements_upgrade' @'
INSERT INTO admin_users (id, username, password_hash, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000101', 'eligible', 'hash', '2024-01-01', '2024-01-01'),
  ('00000000-0000-0000-0000-000000000102', 'existing', 'hash', '2024-01-02', '2024-01-02'),
  ('00000000-0000-0000-0000-000000000103', 'inactive', 'hash', '2024-01-03', '2024-01-03'),
  ('00000000-0000-0000-0000-000000000104', 'deleted', 'hash', '2024-01-04', '2024-01-04'),
  ('00000000-0000-0000-0000-000000000105', 'super', 'hash', '2024-01-05', '2024-01-05');
INSERT INTO tournaments (id, name) VALUES
  ('10000000-0000-0000-0000-000000000101', 'eligible-1'),
  ('10000000-0000-0000-0000-000000000102', 'eligible-2'),
  ('10000000-0000-0000-0000-000000000103', 'eligible-3'),
  ('10000000-0000-0000-0000-000000000104', 'eligible-4'),
  ('10000000-0000-0000-0000-000000000105', 'eligible-5'),
  ('10000000-0000-0000-0000-000000000106', 'eligible-soft-deleted');
'@
  foreach ($migration in $featureMigrations) {
    Invoke-MigrationFile 'legacy_entitlements_upgrade' (Join-Path $migration.FullName 'migration.sql')
  }
  Invoke-Sql 'legacy_entitlements_upgrade' @'
UPDATE users SET is_active = false WHERE normalized_username = 'inactive';
UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE normalized_username = 'deleted';
UPDATE users SET role = 'SUPER_ADMIN' WHERE normalized_username = 'super';
UPDATE tournaments SET owner_user_id = '00000000-0000-0000-0000-000000000101'
  WHERE id BETWEEN '10000000-0000-0000-0000-000000000101' AND '10000000-0000-0000-0000-000000000106';
UPDATE tournaments SET soft_deleted_at = CURRENT_TIMESTAMP
  WHERE id = '10000000-0000-0000-0000-000000000106';
INSERT INTO admin_entitlements (user_id, status, active_from, active_until, tournament_limit)
VALUES ('00000000-0000-0000-0000-000000000102', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 months', 9);
'@
  Invoke-MigrationFile 'legacy_entitlements_upgrade' $targetSql

  # Eligible legacy ADMIN is bridged immediately; its five live tournaments set quota five.
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT status::text FROM admin_entitlements WHERE user_id = '00000000-0000-0000-0000-000000000101';" 'ACTIVE'
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT tournament_limit FROM admin_entitlements WHERE user_id = '00000000-0000-0000-0000-000000000101';" '5'
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT (active_from <= CURRENT_TIMESTAMP AND active_until > CURRENT_TIMESTAMP AND active_until = active_from + INTERVAL '12 months')::text FROM admin_entitlements WHERE user_id = '00000000-0000-0000-0000-000000000101';" 'true'
  # Existing entitlement is preserved; ineligible admin and SUPER_ADMIN rows are untouched.
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT tournament_limit FROM admin_entitlements WHERE user_id = '00000000-0000-0000-0000-000000000102';" '9'
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT count(*) FROM admin_entitlements WHERE user_id IN ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000105');" '0'
  # Manual replay proves conflict protection: no duplicate or overwritten row.
  Invoke-MigrationFile 'legacy_entitlements_upgrade' $targetSql
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT count(*) FROM admin_entitlements WHERE user_id = '00000000-0000-0000-0000-000000000101';" '1'
  Assert-Scalar 'legacy_entitlements_upgrade' "SELECT count(*) FROM admin_entitlements;" '2'

  Write-Host 'Legacy ADMIN entitlement migration verification passed on fresh and representative pre-feature PostgreSQL schemas.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) {
    & docker rm -f $container | Out-Null
  }
}
