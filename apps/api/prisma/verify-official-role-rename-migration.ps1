[CmdletBinding()]
param([string]$Image = 'postgres:16-alpine')

$ErrorActionPreference = 'Stop'
$container = "dau-vo-official-role-rename-verify-$PID"
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260928230000_official_role_judge_supervisor_rename'
$migrations = @(Get-ChildItem -Directory $migrationRoot | Sort-Object Name)
$beforeTarget = @($migrations | Where-Object Name -lt $targetName)
$targetSql = Join-Path $migrationRoot "$targetName/migration.sql"

function Invoke-Sql([string]$Database, [string]$Sql) {
  $Sql | & docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database
  if ($LASTEXITCODE -ne 0) { throw "SQL failed for disposable database $Database." }
}
function Invoke-Migration([string]$Database, $Migration) {
  Invoke-Sql $Database (Get-Content -Raw -Encoding UTF8 (Join-Path $Migration.FullName 'migration.sql'))
}
function Assert-Scalar([string]$Database, [string]$Query, [string]$Expected) {
  $actual = (& docker exec $container psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d $Database -c $Query).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $Expected) { throw "Expected '$Expected', received '$actual': $Query" }
}

try {
  & docker run --rm -d --name $container -e POSTGRES_PASSWORD=postgres $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable PostgreSQL.' }
  do { Start-Sleep -Milliseconds 300; & docker exec $container pg_isready -U postgres | Out-Null } until ($LASTEXITCODE -eq 0)
  Invoke-Sql postgres 'CREATE DATABASE official_role_rename_upgrade;'
  foreach ($migration in $beforeTarget) { Invoke-Migration official_role_rename_upgrade $migration }

  # Snapshot the old enum labels before upgrading; IDs/table rows are not rebuilt
  # by the target migration, which uses only ALTER ... RENAME operations.
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::tournament_official_role)::text;" '{REFEREE,INSPECTOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regclass('public.referee_votes')::text;" 'referee_votes'
  Invoke-Sql official_role_rename_upgrade (Get-Content -Raw -Encoding UTF8 $targetSql)

  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::tournament_official_role)::text;" '{JUDGE,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::match_role)::text;" '{JUDGE,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::match_access_role)::text;" '{JUDGE_1,JUDGE_2,JUDGE_3,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::judge_slot)::text;" '{JUDGE_1,JUDGE_2,JUDGE_3}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::score_event_type)::text;" '{JUDGE_POINT,PENALTY,ADMIN_ADJUSTMENT}'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regclass('public.judge_votes')::text;" 'judge_votes'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regclass('public.referee_votes') IS NULL;" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM pg_constraint WHERE conname IN ('judge_votes_pkey','judge_votes_authorization_provenance_check','match_official_assignments_assigned_by_supervisor_id_fkey');" '3'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM pg_trigger WHERE tgname='judge_votes_validate_authorization_trigger' AND NOT tgisinternal;" '1'
  Write-Host 'Official role rename migration catalog verification passed on a disposable PostgreSQL database.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) { & docker rm -f $container | Out-Null }
}
