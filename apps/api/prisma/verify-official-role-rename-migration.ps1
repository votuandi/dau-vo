[CmdletBinding()]
param([string]$Image = 'postgres:16-alpine')

# Prerequisites: Docker, Node.js 20+, pnpm, and dependencies installed.
# Run from apps/api: pnpm prisma:verify:official-role-rename
# Expected output: the disposable database catalog and Prisma-client contract
# checks pass. This rehearses historical migration SQL only; it does not prove
# production backups, concurrent production traffic, or application workflows.
# This repository has no CI workflow, so this command is not CI-enforced.
# DATABASE_URL is constructed below for this container only. Do not change this
# script to call migrate deploy or to load the repository .env.
$ErrorActionPreference = 'Stop'
$container = "dau-vo-official-role-rename-verify-$PID"
$database = 'official_role_rename_upgrade'
$readinessDeadline = (Get-Date).AddSeconds(60)
$migrationRoot = Join-Path $PSScriptRoot 'migrations'
$targetName = '20260928230000_official_role_judge_supervisor_rename'
$repairName = '20260929200000_v2_result_scope_delete_repair'
$metadataRepairName = '20260929210000_audit_role_metadata_path_correction'
$metadataGuardCleanupName = '20260929220000_audit_role_metadata_clean_replay_guard_cleanup'
$migrations = @(Get-ChildItem -Directory $migrationRoot | Sort-Object Name)
$beforeTarget = @($migrations | Where-Object Name -lt $targetName)
$targetSql = Join-Path $migrationRoot "$targetName/migration.sql"
$repairSql = Join-Path $migrationRoot "$repairName/migration.sql"
$metadataRepairSql = Join-Path $migrationRoot "$metadataRepairName/migration.sql"
$metadataGuardCleanupSql = Join-Path $migrationRoot "$metadataGuardCleanupName/migration.sql"

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
function Get-ContainerPort {
  $mapping = (& docker port $container 5432/tcp).Trim()
  if ($LASTEXITCODE -ne 0 -or $mapping -notmatch ':(\d+)$') { throw 'Could not determine the disposable PostgreSQL port.' }
  return $Matches[1]
}

try {
  & docker run --rm -d --name $container -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=postgres $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable PostgreSQL.' }
  do {
    Start-Sleep -Milliseconds 300
    & docker exec $container pg_isready -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
  } while ((Get-Date) -lt $readinessDeadline)
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not become ready within 60 seconds. Check Docker daemon/image availability.' }
  Invoke-Sql postgres "CREATE DATABASE $database;"
  foreach ($migration in $beforeTarget) { Invoke-Migration $database $migration }

  # Snapshot the old enum labels before upgrading; IDs/table rows are not rebuilt
  # by the target migration, which uses only ALTER ... RENAME operations.
  Assert-Scalar $database "SELECT enum_range(NULL::tournament_official_role)::text;" '{REFEREE,INSPECTOR}'
  Assert-Scalar $database "SELECT to_regclass('public.referee_votes')::text;" 'referee_votes'
  # A representative, linked legacy crew.  Fixed IDs let the assertions prove
  # that rows, relationships, active state, access codes, sessions, votes, and
  # audit history survive the upgrade instead of merely proving an empty schema.
  Invoke-Sql $database @'
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
INSERT INTO match_sessions (id, match_id, access_code_id, role, referee_slot, device_id, token_hash, active, revoked_at) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000008', 'INSPECTOR', NULL, 'inspector-device', 'inspector-token', true, NULL),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000009', 'REFEREE', 'REFEREE_1', 'referee-device', 'referee-token', true, NULL),
  ('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000009', 'REFEREE', 'REFEREE_1', 'revoked-referee-device', 'revoked-referee-token', false, now());
INSERT INTO match_official_assignments (id, match_id, tournament_id, official_id, role, referee_position, assigned_by_inspector_id, assigned_at, released_at, release_reason) VALUES
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'INSPECTOR', NULL, NULL, now(), NULL, NULL),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000007', 'REFEREE', 1, '00000000-0000-0000-0000-000000000006', now(), NULL, NULL),
  ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000007', 'REFEREE', 2, '00000000-0000-0000-0000-000000000006', now() - interval '1 minute', now(), 'REPLACED');
INSERT INTO match_athletes (id, match_id, tournament_id, name, organization, color) VALUES
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'Legacy red', 'Verify', 'RED'),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'Legacy blue', 'Verify', 'BLUE');
INSERT INTO rounds (id, match_id, round_number, stage, attempt_number, started_at, ends_at) VALUES
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000005', 1, 'REGULATION', 0, now(), now() + interval '1 minute');
INSERT INTO round_athlete_results (id, match_id, round_id, athlete_id, referee_points, fault_count) VALUES
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000051', 3, 0);
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO match_appeals (id, match_id, scope, attempt_number, source_round_id, completed_inspector_assignment_id) VALUES
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000005', 'REGULATION', 0, '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000012');
INSERT INTO match_appeal_adjustments (id, appeal_id, athlete_id, base_referee_score, final_score) VALUES
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000051', 3, 3),
  ('00000000-0000-0000-0000-000000000057', '00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000056', 2, 2);
COMMIT;
INSERT INTO scoring_windows (id, match_id, round_number, started_at, ends_at) VALUES
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000005', 1, now(), now() + interval '1 minute');
INSERT INTO referee_votes (id, scoring_window_id, match_id, referee_slot, athlete_color, session_id) VALUES
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000005', 'REFEREE_1', 'RED', '00000000-0000-0000-0000-000000000011');
INSERT INTO audit_logs (id, match_id, session_id, event_type, metadata) VALUES
  ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000011', 'MATCH_ACTION', '{"role":"REFEREE","before":{"role":"INSPECTOR"},"note":"REFEREE prose remains unchanged"}'),
  ('00000000-0000-0000-0000-000000000019', NULL, NULL, 'MATCH_ACTION', '{"role":"REFEREE","before":{"role":"INSPECTOR"},"after":{"role":"REFEREE"},"context":{"actor":{"role":"INSPECTOR"},"entries":[{"role":"REFEREE"},"REFEREE and INSPECTOR are legacy prose"]},"message":"REFEREE and INSPECTOR are legacy prose"}'::jsonb),
  ('00000000-0000-0000-0000-000000000031', NULL, NULL, 'MATCH_ACTION', '[{"role":"REFEREE"},{"nested":{"role":"INSPECTOR"}},"REFEREE and INSPECTOR are legacy prose"]'::jsonb),
  ('00000000-0000-0000-0000-000000000032', NULL, NULL, 'MATCH_ACTION', '"REFEREE and INSPECTOR are legacy prose"'::jsonb),
  ('00000000-0000-0000-0000-000000000033', NULL, NULL, 'MATCH_ACTION', '{"context":{"actor":{"role":"INSPECTOR"}},"message":"REFEREE and INSPECTOR are legacy prose"}'::jsonb),
  ('00000000-0000-0000-0000-000000000034', NULL, NULL, 'MATCH_ACTION', NULL);
'@
  Assert-Scalar $database "SELECT count(*) FROM referee_votes;" '1'
  Assert-Scalar $database "SELECT count(*) FROM match_sessions WHERE active;" '2'
  Assert-Scalar $database "SELECT count(*) FROM match_sessions WHERE NOT active AND revoked_at IS NOT NULL;" '1'
  Assert-Scalar $database "SELECT count(*) FROM match_official_assignments WHERE released_at IS NULL;" '2'
  Assert-Scalar $database "SELECT count(*) FROM match_official_assignments WHERE released_at IS NOT NULL;" '1'
  Invoke-Sql $database (Get-Content -Raw -Encoding UTF8 $targetSql)
  Invoke-Sql $database (Get-Content -Raw -Encoding UTF8 $repairSql)
  Invoke-Sql $database (Get-Content -Raw -Encoding UTF8 $metadataRepairSql)
  Invoke-Sql $database (Get-Content -Raw -Encoding UTF8 $metadataGuardCleanupSql)

  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::tournament_official_role)::text;" '{JUDGE,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::match_role)::text;" '{JUDGE,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::match_access_role)::text;" '{JUDGE_1,JUDGE_2,JUDGE_3,SUPERVISOR}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::judge_slot)::text;" '{JUDGE_1,JUDGE_2,JUDGE_3}'
  Assert-Scalar official_role_rename_upgrade "SELECT enum_range(NULL::score_event_type)::text;" '{JUDGE_POINT,PENALTY,ADMIN_ADJUSTMENT}'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regclass('public.judge_votes')::text;" 'judge_votes'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regclass('public.referee_votes') IS NULL;" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM pg_constraint WHERE conname IN ('judge_votes_pkey','judge_votes_authorization_provenance_check','match_official_assignments_assigned_by_supervisor_id_fkey');" '3'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM pg_trigger WHERE tgname='judge_votes_validate_authorization_trigger' AND NOT tgisinternal;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM pg_trigger WHERE tgname IN ('faults_validate_scope_trigger','round_athlete_results_validate_scope_trigger','match_appeals_validate_scope_trigger','match_appeal_adjustments_validate_scope_trigger','match_outcomes_validate_scope_trigger') AND NOT tgisinternal AND (tgtype & 28) = 28;" '5'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM judge_votes WHERE id='00000000-0000-0000-0000-000000000015' AND judge_slot='JUDGE_1' AND session_id='00000000-0000-0000-0000-000000000011';" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_sessions WHERE active AND id IN ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011') AND ((id='00000000-0000-0000-0000-000000000010' AND role='SUPERVISOR') OR (id='00000000-0000-0000-0000-000000000011' AND role='JUDGE' AND judge_slot='JUDGE_1'));" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_access_codes WHERE match_id='00000000-0000-0000-0000-000000000005' AND access_role IN ('SUPERVISOR','JUDGE_1');" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_official_assignments WHERE match_id='00000000-0000-0000-0000-000000000005' AND ((id='00000000-0000-0000-0000-000000000012' AND role='SUPERVISOR' AND assigned_by_supervisor_id IS NULL) OR (id='00000000-0000-0000-0000-000000000013' AND role='JUDGE' AND judge_position=1 AND assigned_by_supervisor_id='00000000-0000-0000-0000-000000000006'));" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_official_assignments WHERE id='00000000-0000-0000-0000-000000000017' AND role='JUDGE' AND judge_position=2 AND released_at IS NOT NULL;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_sessions WHERE id='00000000-0000-0000-0000-000000000018' AND role='JUDGE' AND NOT active AND revoked_at IS NOT NULL;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM round_athlete_results WHERE id='00000000-0000-0000-0000-000000000053' AND judge_points=3;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_appeal_adjustments WHERE id='00000000-0000-0000-0000-000000000055' AND base_judge_score=3 AND final_score=3;" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_appeals WHERE id='00000000-0000-0000-0000-000000000054' AND completed_supervisor_assignment_id='00000000-0000-0000-0000-000000000012';" '1'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM tournament_officials WHERE (id='00000000-0000-0000-0000-000000000006' AND role='SUPERVISOR') OR (id='00000000-0000-0000-0000-000000000007' AND role='JUDGE');" '2'
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM tournament_officials WHERE id='00000000-0000-0000-0000-000000000006' AND role='JUDGE' OR id='00000000-0000-0000-0000-000000000007' AND role='SUPERVISOR';" '0'
  Assert-Scalar official_role_rename_upgrade "SELECT (metadata->>'role') || ':' || (metadata->'before'->>'role') || ':' || (metadata->>'note') FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000016';" 'JUDGE:SUPERVISOR:REFEREE prose remains unchanged'
  Assert-Scalar official_role_rename_upgrade "SELECT metadata = '{\"role\":\"JUDGE\",\"before\":{\"role\":\"SUPERVISOR\"},\"after\":{\"role\":\"JUDGE\"},\"context\":{\"actor\":{\"role\":\"INSPECTOR\"},\"entries\":[{\"role\":\"REFEREE\"},\"REFEREE and INSPECTOR are legacy prose\"]},\"message\":\"REFEREE and INSPECTOR are legacy prose\"}'::jsonb FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000019';" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT metadata = '[{\"role\":\"REFEREE\"},{\"nested\":{\"role\":\"INSPECTOR\"}},\"REFEREE and INSPECTOR are legacy prose\"]'::jsonb FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000031';" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT metadata = '\"REFEREE and INSPECTOR are legacy prose\"'::jsonb FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000032';" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT metadata = '{\"context\":{\"actor\":{\"role\":\"INSPECTOR\"}},\"message\":\"REFEREE and INSPECTOR are legacy prose\"}'::jsonb FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000033';" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT metadata IS NULL FROM audit_logs WHERE id='00000000-0000-0000-0000-000000000034';" 't'
  Assert-Scalar official_role_rename_upgrade "SELECT to_regprocedure('preserve_audit_role_metadata_during_clean_replay()') IS NULL;" 't'
  $port = Get-ContainerPort
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:$port/$database?schema=public"
    Push-Location (Split-Path $PSScriptRoot -Parent)
    try {
      # The local API may hold Prisma's shared Windows engine DLL open. Client
      # code still regenerates here; retaining the installed engine avoids a
      # shared-workspace file lock while the contract runner exercises it.
      & pnpm exec prisma generate --no-engine
      if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed for the disposable database contract check.' }
      & pnpm exec tsx prisma/verify-official-role-rename-prisma-client.ts
      if ($LASTEXITCODE -ne 0) { throw 'Generated Prisma client contract verification failed.' }
    } finally { Pop-Location }
  } finally { $env:DATABASE_URL = $previousDatabaseUrl }
  # Exercise every V2 scope-trigger table after the forward repair.  The block
  # asserts valid INSERT/UPDATE behavior, 23514 scope/role rejections, direct
  # deletes, and a cascading adjustment delete through its appeal FK.
  Invoke-Sql official_role_rename_upgrade @'
BEGIN;
INSERT INTO matches (id, public_id, tournament_id, round_duration_ms, break_duration_ms) VALUES
  ('00000000-0000-0000-0000-000000000029', 'RENAME-OTHER', '00000000-0000-0000-0000-000000000004', 60000, 10000);
INSERT INTO match_athletes (id, match_id, tournament_id, name, organization, color) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'Red', 'Verify', 'RED'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'Blue', 'Verify', 'BLUE'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000004', 'Other', 'Verify', 'RED');
INSERT INTO rounds (id, match_id, round_number, stage, attempt_number, started_at, ends_at) VALUES
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000005', 1, 'REGULATION', 0, now(), now() + interval '1 minute'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000005', 1, 'OVERTIME', 1, now(), now() + interval '1 minute');
INSERT INTO faults (id, match_id, athlete_id, round_id, recording_supervisor_assignment_id) VALUES
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000012');
INSERT INTO round_athlete_results (id, match_id, round_id, athlete_id, judge_points, fault_count) VALUES
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 3, 0);
INSERT INTO match_appeals (id, match_id, scope, attempt_number, source_round_id, completed_supervisor_assignment_id) VALUES
  ('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000005', 'REGULATION', 0, '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000012');
INSERT INTO match_appeal_adjustments (id, appeal_id, athlete_id, base_judge_score, final_score) VALUES
  ('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000020', 3, 3);
INSERT INTO match_outcomes (id, match_id, winner_athlete_id, winner_color, method, source_appeal_id, published_supervisor_assignment_id, snapshot) VALUES
  ('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000020', 'RED', 'REGULATION_SCORE', '00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000012', '{}'::jsonb);
UPDATE faults SET created_at = created_at WHERE id='00000000-0000-0000-0000-000000000024';
UPDATE round_athlete_results SET judge_points = 4 WHERE id='00000000-0000-0000-0000-000000000025';
UPDATE match_appeals SET completed_at = completed_at WHERE id='00000000-0000-0000-0000-000000000026';
UPDATE match_appeal_adjustments SET base_judge_score = 4, final_score = 4 WHERE id='00000000-0000-0000-0000-000000000027';
UPDATE match_outcomes SET published_at = published_at WHERE id='00000000-0000-0000-0000-000000000028';
DO $$
BEGIN
  BEGIN
    INSERT INTO faults (match_id, athlete_id, round_id, recording_supervisor_assignment_id) VALUES
      ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000013');
    RAISE EXCEPTION 'wrong-role fault unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO round_athlete_results (match_id, round_id, athlete_id, judge_points, fault_count) VALUES
      ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000021', 1, 0);
    UPDATE round_athlete_results SET athlete_id='00000000-0000-0000-0000-000000000030' WHERE id='00000000-0000-0000-0000-000000000025';
    RAISE EXCEPTION 'cross-match update unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END $$;
DELETE FROM match_outcomes WHERE id='00000000-0000-0000-0000-000000000028';
DELETE FROM faults WHERE id='00000000-0000-0000-0000-000000000024';
DELETE FROM round_athlete_results WHERE id='00000000-0000-0000-0000-000000000025';
DELETE FROM match_appeals WHERE id='00000000-0000-0000-0000-000000000026';
COMMIT;
'@
  Assert-Scalar official_role_rename_upgrade "SELECT count(*) FROM match_appeal_adjustments WHERE id='00000000-0000-0000-0000-000000000027';" '0'

  # Verify the forward repair in isolation against pre-rename audit JSON. This
  # makes each supported path and preservation boundary explicit; applying it
  # after the historical migration cannot reconstruct ambiguous nested values
  # already changed by that migration.
  Invoke-Sql postgres 'CREATE DATABASE official_role_metadata_path_safety;'
  foreach ($migration in $beforeTarget) { Invoke-Migration official_role_metadata_path_safety $migration }
  Invoke-Sql official_role_metadata_path_safety @'
INSERT INTO audit_logs (id, event_type, metadata) VALUES
  ('10000000-0000-0000-0000-000000000001', 'MATCH_ACTION', '{"role":"REFEREE","count":7,"enabled":true,"none":null}'::jsonb),
  ('10000000-0000-0000-0000-000000000002', 'MATCH_ACTION', '{"before":{"role":"INSPECTOR","actor":{"role":"REFEREE"}},"after":{"role":"REFEREE","context":{"role":"INSPECTOR"}}}'::jsonb),
  ('10000000-0000-0000-0000-000000000003', 'MATCH_ACTION', '{"role":"ADMIN","before":{"role":"USER"},"after":{"role":null}}'::jsonb),
  ('10000000-0000-0000-0000-000000000004', 'MATCH_ACTION', '{"note":"REFEREE and INSPECTOR remain prose","values":["REFEREE",{"role":"INSPECTOR"},false,3,null]}'::jsonb),
  ('10000000-0000-0000-0000-000000000005', 'MATCH_ACTION', NULL),
  ('10000000-0000-0000-0000-000000000006', 'MATCH_ACTION', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000007', 'MATCH_ACTION', '[{"role":"REFEREE"},"INSPECTOR",0,false,null]'::jsonb),
  ('10000000-0000-0000-0000-000000000008', 'MATCH_ACTION', '{"before":{"actor":{"role":"REFEREE"}},"after":{"context":{"role":"INSPECTOR"}},"nested":[{"role":"REFEREE"}]}'::jsonb),
  ('10000000-0000-0000-0000-000000000009', 'MATCH_ACTION', '{"role":"INSPECTOR","before":{"role":"REFEREE"},"after":{"role":"INSPECTOR"}}'::jsonb);
'@
  Invoke-Sql official_role_metadata_path_safety (Get-Content -Raw -Encoding UTF8 $metadataRepairSql)
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"role\":\"JUDGE\",\"count\":7,\"enabled\":true,\"none\":null}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000001';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"before\":{\"role\":\"SUPERVISOR\",\"actor\":{\"role\":\"REFEREE\"}},\"after\":{\"role\":\"JUDGE\",\"context\":{\"role\":\"INSPECTOR\"}}}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000002';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"role\":\"ADMIN\",\"before\":{\"role\":\"USER\"},\"after\":{\"role\":null}}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000003';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"note\":\"REFEREE and INSPECTOR remain prose\",\"values\":[\"REFEREE\",{\"role\":\"INSPECTOR\"},false,3,null]}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000004';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT count(*) FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000005' AND metadata IS NULL;" '1'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000006';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '[{\"role\":\"REFEREE\"},\"INSPECTOR\",0,false,null]'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000007';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"before\":{\"actor\":{\"role\":\"REFEREE\"}},\"after\":{\"context\":{\"role\":\"INSPECTOR\"}},\"nested\":[{\"role\":\"REFEREE\"}]}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000008';" 't'
  Assert-Scalar official_role_metadata_path_safety "SELECT metadata = '{\"role\":\"SUPERVISOR\",\"before\":{\"role\":\"JUDGE\"},\"after\":{\"role\":\"SUPERVISOR\"}}'::jsonb FROM audit_logs WHERE id='10000000-0000-0000-0000-000000000009';" 't'
  Write-Host 'Official role rename migration catalog verification passed on a disposable PostgreSQL database.'
} finally {
  if (& docker ps -a --format '{{.Names}}' | Select-String -Quiet -SimpleMatch $container) { & docker rm -f $container | Out-Null }
}
