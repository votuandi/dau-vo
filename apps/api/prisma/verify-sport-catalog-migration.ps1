[CmdletBinding()]
param([string]$Image = 'postgres:16-alpine')

$ErrorActionPreference = 'Stop'
$container = "dau-vo-sport-catalog-verify-$PID"
$port = Get-Random -Minimum 55000 -Maximum 59999
$apiRoot = Split-Path -Parent $PSScriptRoot
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260912090000_sport_catalog'
$migrations = @(Get-ChildItem -Directory $migrationRoot | Sort-Object Name)
$beforeTarget = @($migrations | Where-Object Name -lt $targetName)
$targetSql = Join-Path $migrationRoot "$targetName/migration.sql"

function Invoke-Sql([string]$Database, [string]$Sql) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $Sql | & docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database 2>&1 | ForEach-Object { Write-Host $_ }; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $old }
  if ($code -ne 0) { throw "SQL failed for disposable database $Database." }
}
function Invoke-Migration([string]$Database, $Migration) { Invoke-Sql $Database (Get-Content -Raw -Encoding UTF8 (Join-Path $Migration.FullName 'migration.sql')) }
function Invoke-Utf8File([string]$Database, [string]$Path) {
  # Docker/psql receives a file rather than text through Windows PowerShell's
  # native pipeline, which otherwise recodes Vietnamese catalog text.
  & docker cp $Path "${container}:/tmp/migration.sql"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy UTF-8 migration into the disposable container.' }
  & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database -f /tmp/migration.sql
  if ($LASTEXITCODE -ne 0) { throw "UTF-8 migration failed for disposable database $Database." }
}
function Assert-Scalar([string]$Database, [string]$Query, [string]$Expected) {
  $actual = (& docker exec $container psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d $Database -c $Query).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $Expected) { throw "Expected '$Expected' from [$Query], received '$actual'." }
}

try {
  & docker run --rm -d --name $container -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:${port}:5432" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable PostgreSQL container.' }
  do { Start-Sleep -Milliseconds 300; & docker exec $container pg_isready -U postgres | Out-Null } until ($LASTEXITCODE -eq 0)
  Invoke-Sql postgres 'CREATE DATABASE sport_catalog_upgrade;'
  foreach ($migration in $beforeTarget) { Invoke-Migration sport_catalog_upgrade $migration }

  # A pre-EPIC fixture deliberately includes retention state, ownership, a
  # match, score ledger, and audit history. The Sport migration may only add
  # catalog data and the tournament FK.
  Invoke-Sql sport_catalog_upgrade @'
INSERT INTO users (id, username, normalized_username, password_hash, role) VALUES
 ('00000000-0000-0000-0000-000000000901', 'sport-legacy', 'sport-legacy', 'hash', 'ADMIN');
INSERT INTO admin_entitlements (user_id, status, active_from, active_until, tournament_limit)
 VALUES ('00000000-0000-0000-0000-000000000901', 'ACTIVE', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day', 9);
INSERT INTO tournaments (id, name, owner_user_id, soft_deleted_at, purge_after, deletion_reason)
 VALUES ('00000000-0000-0000-0000-000000000902', 'legacy-active', '00000000-0000-0000-0000-000000000901', NULL, NULL, NULL),
        ('00000000-0000-0000-0000-000000000903', 'legacy-retained', '00000000-0000-0000-0000-000000000901', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', 'ADMIN_SUBSCRIPTION_LAPSED');
INSERT INTO matches (id, public_id, tournament_id, round_duration_ms, break_duration_ms)
 VALUES ('00000000-0000-0000-0000-000000000904', 'LEGACY1', '00000000-0000-0000-0000-000000000902', 60000, 30000);
INSERT INTO match_athletes (id, match_id, name, organization, color) VALUES
 ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000904', 'red', 'legacy', 'RED'),
 ('00000000-0000-0000-0000-000000000906', '00000000-0000-0000-0000-000000000904', 'blue', 'legacy', 'BLUE');
INSERT INTO score_events (id, match_id, athlete_id, type, value)
 VALUES ('00000000-0000-0000-0000-000000000907', '00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000905', 'ADMIN_ADJUSTMENT', 1);
INSERT INTO audit_logs (id, match_id, user_id, event_type, metadata)
 VALUES ('00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000901', 'TOURNAMENT_CREATED', '{"legacy":true}');
'@
  Invoke-Utf8File sport_catalog_upgrade $targetSql
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM sport_groups WHERE code = 'ONE_ON_ONE_COMBAT';" '1'
  # Compare UTF-8 bytes so Windows PowerShell's legacy console encoding cannot
  # turn the Vietnamese display name into a false-negative assertion.
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM sports WHERE code = 'STICK_FIGHTING' AND encode(convert_to(name, 'UTF8'), 'hex') = '56c3b52047e1baad79' AND is_active;" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM sports s JOIN sport_groups g ON g.id=s.sport_group_id WHERE s.code='STICK_FIGHTING' AND g.code='ONE_ON_ONE_COMBAT';" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM tournaments WHERE sport_id = 'd91e1cf7-89a7-4475-bd93-6b5f35a14574';" '2'
  Assert-Scalar sport_catalog_upgrade 'SELECT count(*) FROM matches;' '1'
  Assert-Scalar sport_catalog_upgrade 'SELECT count(*) FROM score_events;' '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM audit_logs WHERE metadata->>'legacy' = 'true';" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM tournaments WHERE owner_user_id='00000000-0000-0000-0000-000000000901' AND purge_after IS NOT NULL;" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT is_nullable FROM information_schema.columns WHERE table_name='tournaments' AND column_name='sport_id';" 'NO'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM pg_constraint WHERE conname='tournaments_sport_id_fkey';" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM pg_indexes WHERE tablename='tournaments' AND indexname='tournaments_sport_id_idx';" '1'

  $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:${port}/sport_catalog_upgrade?schema=public"
  Push-Location $apiRoot
  try { & pnpm.cmd run prisma:seed; if ($LASTEXITCODE -ne 0) { throw 'First seed execution failed.' }; & pnpm.cmd run prisma:seed; if ($LASTEXITCODE -ne 0) { throw 'Repeated seed execution failed.' } }
  finally { Pop-Location }
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM sport_groups WHERE code='ONE_ON_ONE_COMBAT';" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM sports WHERE code='STICK_FIGHTING';" '1'
  Assert-Scalar sport_catalog_upgrade "SELECT count(*) FROM matches WHERE public_id='LEGACY1';" '1'
  Write-Host 'Sport catalog migration verification passed on a pre-EPIC PostgreSQL fixture and repeated seeds.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) { & docker rm -f $container | Out-Null }
}
