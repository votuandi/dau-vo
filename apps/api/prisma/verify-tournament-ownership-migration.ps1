[CmdletBinding()]
param(
  [string]$Image = 'postgres:16-alpine'
)

$ErrorActionPreference = 'Stop'
$container = "dau-vo-ownership-verify-$PID"
# A high random loopback port avoids the developer PostgreSQL port and lets
# repeated verification runs coexist with local infrastructure.
$port = Get-Random -Minimum 55000 -Maximum 59999
$apiRoot = Split-Path -Parent $PSScriptRoot
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260911100000_tournament_ownership'
$migrations = @(Get-ChildItem -Directory $migrationRoot | Sort-Object Name)
$beforeTarget = @($migrations | Where-Object Name -lt $targetName)
$afterTarget = @($migrations | Where-Object Name -gt $targetName)
$targetSql = Join-Path $migrationRoot "$targetName/migration.sql"

function Invoke-Sql([string]$Database, [string]$Sql, [switch]$ExpectFailure) {
  $Sql | & docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database 2>&1 | ForEach-Object { Write-Host $_ }
  $succeeded = $LASTEXITCODE -eq 0
  if ($ExpectFailure) {
    if ($succeeded) { throw "Expected SQL to fail for disposable database $Database." }
    return
  }
  if (!$succeeded) { throw "SQL failed for disposable database $Database." }
}

function Invoke-MigrationFile([string]$Database, [string]$Path) {
  Invoke-Sql $Database (Get-Content -Raw $Path)
}

function Initialize-LegacyDatabase([string]$Database) {
  Invoke-Sql 'postgres' "CREATE DATABASE `"$Database`";"
  foreach ($migration in $beforeTarget) {
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

  # 1. Fresh empty schema: ownership migration must not require any seed user.
  Initialize-LegacyDatabase 'ownership_fresh'
  Invoke-MigrationFile 'ownership_fresh' $targetSql
  Assert-Scalar 'ownership_fresh' 'SELECT count(*) FROM tournaments;' '0'

  # 2. Complete audit history: earliest creation event wins, even with later events.
  Initialize-LegacyDatabase 'ownership_audit'
  Invoke-Sql 'ownership_audit' @'
INSERT INTO users (id, username, normalized_username, password_hash, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'first', 'first', 'hash', '2020-01-01', '2020-01-01'),
       ('00000000-0000-0000-0000-000000000002', 'later', 'later', 'hash', '2020-01-02', '2020-01-02');
INSERT INTO tournaments (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'audited');
INSERT INTO audit_logs (id, event_type, user_id, metadata, created_at)
VALUES ('20000000-0000-0000-0000-000000000002', 'TOURNAMENT_CREATED', '00000000-0000-0000-0000-000000000002', '{"tournamentId":"10000000-0000-0000-0000-000000000001"}', '2022-01-02'),
       ('20000000-0000-0000-0000-000000000001', 'TOURNAMENT_CREATED', '00000000-0000-0000-0000-000000000001', '{"tournamentId":"10000000-0000-0000-0000-000000000001"}', '2022-01-01');
'@
  Invoke-MigrationFile 'ownership_audit' $targetSql
  Assert-Scalar 'ownership_audit' "SELECT owner_user_id FROM tournaments WHERE id = '10000000-0000-0000-0000-000000000001';" '00000000-0000-0000-0000-000000000001'

  # 3/4. Missing audit and multiple eligible administrators: oldest creation time wins.
  Initialize-LegacyDatabase 'ownership_fallback'
  Invoke-Sql 'ownership_fallback' @'
INSERT INTO users (id, username, normalized_username, password_hash, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000010', 'newer', 'newer', 'hash', '2021-01-02', '2021-01-02'),
       ('00000000-0000-0000-0000-000000000009', 'older', 'older', 'hash', '2021-01-01', '2021-01-01');
INSERT INTO tournaments (id, name) VALUES ('10000000-0000-0000-0000-000000000002', 'orphan');
'@
  Invoke-MigrationFile 'ownership_fallback' $targetSql
  Assert-Scalar 'ownership_fallback' "SELECT owner_user_id FROM tournaments WHERE id = '10000000-0000-0000-0000-000000000002';" '00000000-0000-0000-0000-000000000009'
  Assert-Scalar 'ownership_fallback' "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'owner_user_id';" 'NO'

  # 5. Invalid legacy data must produce the actionable error, not a seed reference.
  Initialize-LegacyDatabase 'ownership_no_user'
  Invoke-Sql 'ownership_no_user' "INSERT INTO tournaments (id, name) VALUES ('10000000-0000-0000-0000-000000000003', 'invalid');"
  $failure = (Get-Content -Raw $targetSql) + "`n"
  $failure | & docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d ownership_no_user 2>&1 | Tee-Object -Variable failureOutput | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -eq 0 -or ($failureOutput -join "`n") -notmatch 'active, non-deleted legacy ADMIN user') {
    throw 'No-user case did not fail with the required actionable ownership error.'
  }

  # 6. Apply later migrations, then prove the real idempotent seed owns superadmin.
  foreach ($migration in $afterTarget) {
    Invoke-MigrationFile 'ownership_fallback' (Join-Path $migration.FullName 'migration.sql')
  }
  $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:${port}/ownership_fallback?schema=public"
  Push-Location $apiRoot
  try {
    & pnpm.cmd run prisma:seed
    if ($LASTEXITCODE -ne 0) { throw 'First seed execution failed.' }
    & pnpm.cmd run prisma:seed
    if ($LASTEXITCODE -ne 0) { throw 'Repeated seed execution failed.' }
  } finally { Pop-Location }
  Assert-Scalar 'ownership_fallback' "SELECT count(*) FROM users WHERE normalized_username = 'superadmin';" '1'
  Assert-Scalar 'ownership_fallback' "SELECT role::text FROM users WHERE normalized_username = 'superadmin';" 'SUPER_ADMIN'

  Write-Host 'Tournament ownership migration verification passed on disposable PostgreSQL databases.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) {
    & docker rm -f $container | Out-Null
  }
}
