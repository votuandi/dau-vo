[CmdletBinding()]
param([string]$Image = 'postgres:16-alpine')

$ErrorActionPreference = 'Stop'
$container = "dau-vo-match-lifecycle-verify-$PID"
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260920120000_match_lifecycle_phase_foundation'
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
function Assert-Scalar([string]$Database, [string]$Query, [string]$Expected) {
  $actual = (& docker exec $container psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d $Database -c $Query).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $Expected) { throw "Expected '$Expected' from [$Query], received '$actual'." }
}

try {
  & docker run --rm -d --name $container -e POSTGRES_PASSWORD=postgres $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable PostgreSQL.' }
  do { Start-Sleep -Milliseconds 300; & docker exec $container pg_isready -U postgres | Out-Null } until ($LASTEXITCODE -eq 0)
  Invoke-Sql postgres 'CREATE DATABASE match_lifecycle_upgrade;'
  foreach ($migration in $beforeTarget) { Invoke-Migration match_lifecycle_upgrade $migration }

  Invoke-Sql match_lifecycle_upgrade @'
INSERT INTO users (id, username, normalized_username, password_hash, role) VALUES
 ('10000000-0000-4000-8000-000000000001', 'owner', 'owner', 'hash', 'ADMIN');
INSERT INTO tournaments (id, public_code, name, owner_user_id, sport_id) VALUES
 ('20000000-0000-4000-8000-000000000001', 'LIFECYCLE', 'Lifecycle migration', '10000000-0000-4000-8000-000000000001', 'd91e1cf7-89a7-4475-bd93-6b5f35a14574');
INSERT INTO matches (id, public_id, tournament_id, status, current_round, round_duration_ms, break_duration_ms, started_at, finished_at) VALUES
 ('30000000-0000-4000-8000-000000000001', 'WAITING', '20000000-0000-4000-8000-000000000001', 'WAITING', NULL, 60000, 30000, NULL, NULL),
 ('30000000-0000-4000-8000-000000000002', 'R1RUN', '20000000-0000-4000-8000-000000000001', 'ROUND_1_RUNNING', 1, 60000, 30000, CURRENT_TIMESTAMP, NULL),
 ('30000000-0000-4000-8000-000000000003', 'R1PAUSE', '20000000-0000-4000-8000-000000000001', 'ROUND_1_PAUSED', 1, 60000, 30000, CURRENT_TIMESTAMP, NULL),
 ('30000000-0000-4000-8000-000000000004', 'BREAK', '20000000-0000-4000-8000-000000000001', 'BREAK', 1, 60000, 30000, CURRENT_TIMESTAMP, NULL),
 ('30000000-0000-4000-8000-000000000005', 'R2RUN', '20000000-0000-4000-8000-000000000001', 'ROUND_2_RUNNING', 2, 60000, 30000, CURRENT_TIMESTAMP, NULL),
 ('30000000-0000-4000-8000-000000000006', 'R2PAUSE', '20000000-0000-4000-8000-000000000001', 'ROUND_2_PAUSED', 2, 60000, 30000, CURRENT_TIMESTAMP, NULL),
 ('30000000-0000-4000-8000-000000000007', 'FINISHED', '20000000-0000-4000-8000-000000000001', 'FINISHED', 2, 60000, 30000, CURRENT_TIMESTAMP - INTERVAL '3 minutes', CURRENT_TIMESTAMP);
'@
  Invoke-Sql match_lifecycle_upgrade (Get-Content -Raw -Encoding UTF8 $targetSql)

  Assert-Scalar match_lifecycle_upgrade "SELECT count(*) FROM matches WHERE status='WAITING' AND lifecycle='NOT_STARTED';" '1'
  Assert-Scalar match_lifecycle_upgrade "SELECT count(*) FROM matches WHERE status IN ('ROUND_1_RUNNING','ROUND_1_PAUSED','BREAK','ROUND_2_RUNNING','ROUND_2_PAUSED') AND lifecycle='IN_PROGRESS';" '5'
  Assert-Scalar match_lifecycle_upgrade "SELECT count(*) FROM matches WHERE status='FINISHED' AND lifecycle='COMPLETED' AND finished_at IS NOT NULL;" '1'
  Assert-Scalar match_lifecycle_upgrade 'SELECT count(*) FROM matches;' '7'
  Assert-Scalar match_lifecycle_upgrade "SELECT count(*) FROM pg_indexes WHERE tablename='matches' AND indexname='matches_lifecycle_idx';" '1'
  Assert-Scalar match_lifecycle_upgrade "SELECT count(*) FROM pg_constraint WHERE conname IN ('matches_completed_lifecycle_check','matches_not_started_lifecycle_check','matches_suspended_timestamp_check');" '3'
  Write-Host 'Match lifecycle migration verification passed for every legacy match phase.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) { & docker rm -f $container | Out-Null }
}
