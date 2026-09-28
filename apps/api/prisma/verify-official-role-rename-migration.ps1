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
  # A representative, linked legacy crew.  Fixed IDs let the assertions prove
  # that rows, relationships, active state, access codes, sessions, votes, and
  # audit history survive the upgrade instead of merely proving an empty schema.
  Invoke-Sql official_role_rename_upgrade @'
INSERT INTO users (id, username, normalized_username, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'rename-owner', 'rename-owner', 'hash');
INSERT INTO sport_groups (id, code, name) VALUES
  ('00000000-0000-0000-0000-000000000002', 'RENAME', 'Rename sport group');
INSERT INTO sports (id, code, name, normalized_name, sport_group_id) VALUES
  ('00000000-0000-0000-0000-000000000003', 'RENAME', 'Rename sport', 'rename sport', '00000000-0000-0000-0000-000000000002');
INSERT INTO tournaments (id, public_code, name, owner_user_id, sport_id) VALUES
  ('00000000-0000-0000-0000-000000000004', 'RENAME', 'Rename tournament', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
INSERT INTO matches (id, public_id, tournament_id, round_duration_ms, break_duration_ms) VALUES
  ('00000000-0000-0000-0000-000000000005', 'RENAME-MATCH', '00000000-0000-0000-0000-000000000004', 60000, 10000);
INSERT INTO tournament_officials (id, tournament_id, role, name, normalized_name, passcode_hash, passcode_lookup_digest) VALUES
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'INSPECTOR', 'Legacy inspector', 'legacy inspector', 'hash', repeat('a', 64)),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004', 'REFEREE', 'Legacy referee', 'legacy referee', 'hash', repeat('b', 64));
INSERT INTO match_access_codes (id, match_id, access_role, code_hash) VALUES
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000005', 'INSPECTOR', 'inspector-code'),
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005', 'REFEREE_1', 'referee-code');
INSERT INTO match_sessions (id, match_id, access_code_id, role, referee_slot, device_id, token_hash, active) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000008', 'INSPECTOR', NULL, 'inspector-device', 'inspector-token', true),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000009', 'REFEREE', 'REFEREE_1', 'referee-device', 'referee-token', true);
INSERT INTO match_official_assignments (id, match_id, tournament_id, official_id, role, referee_position, assigned_by_inspector_id) VALUES
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'INSPECTOR', NULL, NULL),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000007', 'REFEREE', 1, '00000000-0000-0000-0000-000000000006');
INSERT INTO scoring_windows (id, match_id, round_number, started_at, ends_at) VALUES
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000005', 1, now(), now() + interval '1 minute');
INSERT INTO referee_votes (id, scoring_window_id, match_id, referee_slot, athlete_color, session_id) VALUES
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000005', 'REFEREE_1', 'RED', '00000000-0000-0000-0000-000000000011');
INSERT INTO audit_logs (id, match_id, session_id, event_type, metadata) VALUES
  ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000011', 'MATCH_ACTION', '{"role":"REFEREE","before":{"role":"INSPECTOR"},"note":"REFEREE prose remains unchanged"}');
'@
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM referee_votes;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_sessions WHERE active;" '2'
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
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM judge_votes WHERE id='00000000-0000-0000-0000-000000000015' AND judge_slot='JUDGE_1' AND session_id='00000000-0000-0000-0000-000000000011';" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_sessions WHERE active AND id IN ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011') AND ((id='00000000-0000-0000-0000-000000000010' AND role='SUPERVISOR') OR (id='00000000-0000-0000-0000-000000000011' AND role='JUDGE' AND judge_slot='JUDGE_1'));" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_access_codes WHERE match_id='00000000-0000-0000-0000-000000000005' AND access_role IN ('SUPERVISOR','JUDGE_1');" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_official_assignments WHERE match_id='00000000-0000-0000-0000-000000000005' AND ((id='00000000-0000-0000-0000-000000000012' AND role='SUPERVISOR' AND assigned_by_supervisor_id IS NULL) OR (id='00000000-0000-0000-0000-000000000013' AND role='JUDGE' AND judge_position=1 AND assigned_by_supervisor_id='00000000-0000-0000-0000-000000000006'));" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT (metadata->>'role') || ':' || (metadata->'before'->>'role') || ':' || (metadata->>'note') FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000016';" 'JUDGE:SUPERVISOR:REFEREE prose remains unchanged'
  Write-Host 'Official role rename migration catalog verification passed on a disposable PostgreSQL database.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) { & docker rm -f $container | Out-Null }
}
