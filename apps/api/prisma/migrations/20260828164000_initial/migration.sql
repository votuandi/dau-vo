-- UUID defaults are generated in PostgreSQL so recovery workers and manual
-- operational tooling receive the same guarantees as Prisma clients.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED', 'ARCHIVED');
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'ROUND_1_RUNNING', 'BREAK', 'ROUND_2_RUNNING', 'FINISHED');
CREATE TYPE "AthleteColor" AS ENUM ('RED', 'BLUE');
CREATE TYPE "MatchRole" AS ENUM ('REFEREE_1', 'REFEREE_2', 'REFEREE_3', 'INSPECTOR');
CREATE TYPE "RefereeSlot" AS ENUM ('REFEREE_1', 'REFEREE_2', 'REFEREE_3');
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'RUNNING', 'ENDED');
CREATE TYPE "MatchSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'LOGGED_OUT');
CREATE TYPE "MatchSessionRevocationReason" AS ENUM ('TAKEOVER', 'CODE_REGENERATED', 'EXPIRED', 'LOGOUT', 'ADMIN_REVOKED');
CREATE TYPE "ScoringWindowStatus" AS ENUM ('OPEN', 'RESOLVING', 'RESOLVED');
CREATE TYPE "ScoreEventType" AS ENUM ('REFEREE_POINT', 'PENALTY', 'ADMIN_ADJUSTMENT');
CREATE TYPE "PenaltyType" AS ENUM ('VIOLATION');
CREATE TYPE "CommandType" AS ENUM ('VOTE_SUBMIT', 'ROUND_START', 'PENALTY_ADD');
CREATE TYPE "CommandStatus" AS ENUM ('RECEIVED', 'SUCCEEDED', 'REJECTED');
CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'MATCH_SESSION', 'SYSTEM', 'PUBLIC');
CREATE TYPE "AuditEventType" AS ENUM (
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'TOURNAMENT_CREATED',
  'TOURNAMENT_UPDATED',
  'TOURNAMENT_ARCHIVED',
  'MATCH_CREATED',
  'MATCH_UPDATED',
  'MATCH_CODE_REGENERATED',
  'MATCH_SESSION_CREATED',
  'SESSION_TAKEOVER',
  'SESSION_REVOKED',
  'SESSION_LOGOUT',
  'ROUND_STARTED',
  'ROUND_ENDED',
  'SCORING_WINDOW_CREATED',
  'VOTE_ACCEPTED',
  'VOTE_REJECTED',
  'SCORING_WINDOW_RESOLVED',
  'PENALTY_ADDED',
  'MATCH_FINISHED',
  'ADMIN_SCORE_ADJUSTMENT'
);
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED');

CREATE TABLE "admin_users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "username" VARCHAR(100) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_users_username_not_blank" CHECK (btrim("username") <> ''),
  CONSTRAINT "admin_users_username_normalized" CHECK ("username" = lower(btrim("username"))),
  CONSTRAINT "admin_users_password_hash_not_blank" CHECK (btrim("password_hash") <> '')
);

CREATE TABLE "admin_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6),
  "ip_address" VARCHAR(45),
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "admin_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "admin_sessions_revocation_after_creation" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
  CONSTRAINT "admin_sessions_last_seen_after_creation" CHECK ("last_seen_at" IS NULL OR "last_seen_at" >= "created_at")
);

CREATE TABLE "tournaments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "location" VARCHAR(255),
  "start_date" DATE,
  "end_date" DATE,
  "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournaments_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "tournaments_date_order" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "tournaments_archive_state" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE TABLE "matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "public_id" VARCHAR(32) NOT NULL,
  "tournament_id" UUID NOT NULL,
  "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
  "current_round" SMALLINT,
  "round_duration_ms" INTEGER NOT NULL DEFAULT 120000,
  "break_duration_ms" INTEGER NOT NULL DEFAULT 60000,
  "next_scoring_window_sequence" INTEGER NOT NULL DEFAULT 1,
  "state_version" BIGINT NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(6),
  "break_started_at" TIMESTAMPTZ(6),
  "break_ends_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matches_public_id_format" CHECK ("public_id" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,32}$'),
  CONSTRAINT "matches_round_duration_positive" CHECK ("round_duration_ms" > 0),
  CONSTRAINT "matches_break_duration_nonnegative" CHECK ("break_duration_ms" >= 0),
  CONSTRAINT "matches_next_window_sequence_positive" CHECK ("next_scoring_window_sequence" > 0),
  CONSTRAINT "matches_state_version_nonnegative" CHECK ("state_version" >= 0),
  CONSTRAINT "matches_break_timestamp_pair" CHECK (
    ("break_started_at" IS NULL AND "break_ends_at" IS NULL)
    OR ("break_started_at" IS NOT NULL AND "break_ends_at" IS NOT NULL AND "break_ends_at" >= "break_started_at")
  ),
  CONSTRAINT "matches_finished_after_started" CHECK ("finished_at" IS NULL OR ("started_at" IS NOT NULL AND "finished_at" >= "started_at")),
  CONSTRAINT "matches_lifecycle_shape" CHECK (
    ("status" = 'WAITING' AND "current_round" IS NULL AND "started_at" IS NULL AND "break_started_at" IS NULL AND "finished_at" IS NULL)
    OR ("status" = 'ROUND_1_RUNNING' AND "current_round" = 1 AND "started_at" IS NOT NULL AND "break_started_at" IS NULL AND "finished_at" IS NULL)
    OR ("status" = 'BREAK' AND "current_round" = 1 AND "started_at" IS NOT NULL AND "break_started_at" IS NOT NULL AND "finished_at" IS NULL)
    OR ("status" = 'ROUND_2_RUNNING' AND "current_round" = 2 AND "started_at" IS NOT NULL AND "break_started_at" IS NOT NULL AND "finished_at" IS NULL)
    OR ("status" = 'FINISHED' AND "current_round" = 2 AND "started_at" IS NOT NULL AND "break_started_at" IS NOT NULL AND "finished_at" IS NOT NULL)
  )
);

CREATE TABLE "match_athletes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "organization" VARCHAR(255) NOT NULL,
  "color" "AthleteColor" NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "violation_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_athletes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_athletes_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "match_athletes_organization_not_blank" CHECK (btrim("organization") <> ''),
  CONSTRAINT "match_athletes_violation_count_nonnegative" CHECK ("violation_count" >= 0)
);

CREATE TABLE "match_access_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "role" "MatchRole" NOT NULL,
  "code_hash" VARCHAR(255) NOT NULL,
  "code_version" INTEGER NOT NULL DEFAULT 1,
  "ownership_version" BIGINT NOT NULL DEFAULT 0,
  "rotated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_access_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_access_credentials_code_hash_not_blank" CHECK (btrim("code_hash") <> ''),
  CONSTRAINT "match_access_credentials_code_version_positive" CHECK ("code_version" > 0),
  CONSTRAINT "match_access_credentials_ownership_version_nonnegative" CHECK ("ownership_version" >= 0),
  CONSTRAINT "match_access_credentials_rotated_after_creation" CHECK ("rotated_at" IS NULL OR "rotated_at" >= "created_at")
);

CREATE TABLE "match_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "credential_id" UUID NOT NULL,
  "device_id" VARCHAR(128) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "ownership_version" BIGINT NOT NULL,
  "status" "MatchSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "revocation_reason" "MatchSessionRevocationReason",
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_sessions_device_id_not_blank" CHECK (btrim("device_id") <> ''),
  CONSTRAINT "match_sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "match_sessions_ownership_version_positive" CHECK ("ownership_version" > 0),
  CONSTRAINT "match_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "match_sessions_last_seen_after_creation" CHECK ("last_seen_at" IS NULL OR "last_seen_at" >= "created_at"),
  CONSTRAINT "match_sessions_terminal_shape" CHECK (
    ("status" = 'ACTIVE' AND "revoked_at" IS NULL AND "revocation_reason" IS NULL)
    OR ("status" <> 'ACTIVE' AND "revoked_at" IS NOT NULL AND "revoked_at" >= "created_at" AND "revocation_reason" IS NOT NULL)
  ),
  CONSTRAINT "match_sessions_reason_matches_status" CHECK (
    ("status" = 'EXPIRED' AND "revocation_reason" = 'EXPIRED')
    OR ("status" = 'LOGGED_OUT' AND "revocation_reason" = 'LOGOUT')
    OR ("status" = 'REVOKED' AND "revocation_reason" IN ('TAKEOVER', 'CODE_REGENERATED', 'ADMIN_REVOKED'))
    OR "status" = 'ACTIVE'
  )
);

CREATE TABLE "match_rounds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "number" SMALLINT NOT NULL,
  "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
  "scheduled_duration_ms" INTEGER NOT NULL,
  "started_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_rounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_rounds_number_valid" CHECK ("number" IN (1, 2)),
  CONSTRAINT "match_rounds_duration_positive" CHECK ("scheduled_duration_ms" > 0),
  CONSTRAINT "match_rounds_lifecycle_shape" CHECK (
    ("status" = 'PENDING' AND "started_at" IS NULL AND "ends_at" IS NULL AND "ended_at" IS NULL)
    OR ("status" = 'RUNNING' AND "started_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "started_at" AND "ended_at" IS NULL)
    OR ("status" = 'ENDED' AND "started_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "started_at" AND "ended_at" IS NOT NULL AND "ended_at" >= "ends_at")
  )
);

CREATE TABLE "scoring_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "round_id" UUID NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "status" "ScoringWindowStatus" NOT NULL DEFAULT 'OPEN',
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "resolved_at" TIMESTAMPTZ(6),
  "winning_color" "AthleteColor",
  "score_awarded" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scoring_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scoring_windows_sequence_positive" CHECK ("sequence_number" > 0),
  CONSTRAINT "scoring_windows_exact_duration" CHECK ("ends_at" = "started_at" + INTERVAL '1 second'),
  CONSTRAINT "scoring_windows_resolution_shape" CHECK (
    ("status" IN ('OPEN', 'RESOLVING') AND "resolved_at" IS NULL AND "winning_color" IS NULL AND "score_awarded" = false)
    OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_at" >= "ends_at"
      AND (("winning_color" IS NULL AND "score_awarded" = false) OR ("winning_color" IS NOT NULL AND "score_awarded" = true)))
  )
);

CREATE TABLE "command_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "command_id" UUID NOT NULL,
  "command_type" "CommandType" NOT NULL,
  "status" "CommandStatus" NOT NULL DEFAULT 'RECEIVED',
  "outcome_code" VARCHAR(100),
  "response" JSONB,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "command_receipts_completion_shape" CHECK (
    ("status" = 'RECEIVED' AND "completed_at" IS NULL AND "outcome_code" IS NULL)
    OR ("status" IN ('SUCCEEDED', 'REJECTED') AND "completed_at" IS NOT NULL AND "completed_at" >= "created_at" AND "outcome_code" IS NOT NULL)
  )
);

CREATE TABLE "referee_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "scoring_window_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "command_receipt_id" UUID NOT NULL,
  "referee_slot" "RefereeSlot" NOT NULL,
  "athlete_color" "AthleteColor" NOT NULL,
  "server_received_at" TIMESTAMPTZ(6) NOT NULL,
  "client_pressed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referee_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "penalties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "athlete_id" UUID NOT NULL,
  "round_number" SMALLINT,
  "type" "PenaltyType" NOT NULL DEFAULT 'VIOLATION',
  "value" INTEGER NOT NULL DEFAULT -1,
  "created_by_session_id" UUID NOT NULL,
  "command_receipt_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "penalties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "penalties_round_number_valid" CHECK ("round_number" IS NULL OR "round_number" IN (1, 2)),
  CONSTRAINT "penalties_violation_value" CHECK ("type" = 'VIOLATION' AND "value" = -1)
);

CREATE TABLE "score_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "athlete_id" UUID NOT NULL,
  "round_number" SMALLINT,
  "type" "ScoreEventType" NOT NULL,
  "value" INTEGER NOT NULL,
  "scoring_window_id" UUID,
  "penalty_id" UUID,
  "created_by_admin_user_id" UUID,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "score_events_round_number_valid" CHECK ("round_number" IS NULL OR "round_number" IN (1, 2)),
  CONSTRAINT "score_events_source_shape" CHECK (
    ("type" = 'REFEREE_POINT' AND "value" = 1 AND "scoring_window_id" IS NOT NULL AND "penalty_id" IS NULL AND "created_by_admin_user_id" IS NULL)
    OR ("type" = 'PENALTY' AND "value" = -1 AND "scoring_window_id" IS NULL AND "penalty_id" IS NOT NULL AND "created_by_admin_user_id" IS NULL)
    OR ("type" = 'ADMIN_ADJUSTMENT' AND "value" <> 0 AND "scoring_window_id" IS NULL AND "penalty_id" IS NULL AND "created_by_admin_user_id" IS NOT NULL AND btrim(COALESCE("reason", '')) <> '')
  )
);

CREATE TABLE "match_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "red_score" INTEGER NOT NULL,
  "blue_score" INTEGER NOT NULL,
  "winner_color" "AthleteColor",
  "is_draw" BOOLEAN NOT NULL,
  "finalized_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_results_winner_shape" CHECK (
    ("is_draw" = true AND "winner_color" IS NULL AND "red_score" = "blue_score")
    OR ("is_draw" = false AND "winner_color" = 'RED' AND "red_score" > "blue_score")
    OR ("is_draw" = false AND "winner_color" = 'BLUE' AND "blue_score" > "red_score")
  )
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID,
  "actor_type" "AuditActorType" NOT NULL,
  "admin_user_id" UUID,
  "match_session_id" UUID,
  "event_type" "AuditEventType" NOT NULL,
  "request_id" VARCHAR(100),
  "command_id" UUID,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_actor_shape" CHECK (
    ("actor_type" = 'ADMIN' AND "admin_user_id" IS NOT NULL AND "match_session_id" IS NULL)
    OR ("actor_type" = 'MATCH_SESSION' AND "admin_user_id" IS NULL AND "match_session_id" IS NOT NULL)
    OR ("actor_type" IN ('SYSTEM', 'PUBLIC') AND "admin_user_id" IS NULL AND "match_session_id" IS NULL)
  )
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "aggregate_version" BIGINT NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "deduplication_key" VARCHAR(200) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" VARCHAR(100),
  "published_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_version_nonnegative" CHECK ("aggregate_version" >= 0),
  CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "outbox_events_type_not_blank" CHECK (btrim("event_type") <> ''),
  CONSTRAINT "outbox_events_deduplication_key_not_blank" CHECK (btrim("deduplication_key") <> ''),
  CONSTRAINT "outbox_events_delivery_shape" CHECK (
    ("status" = 'PENDING' AND "published_at" IS NULL AND "locked_at" IS NULL AND "locked_by" IS NULL)
    OR ("status" = 'PROCESSING' AND "published_at" IS NULL AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)
    OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_admin_user_id_revoked_at_idx" ON "admin_sessions"("admin_user_id", "revoked_at");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");
CREATE INDEX "tournaments_status_start_date_idx" ON "tournaments"("status", "start_date");
CREATE UNIQUE INDEX "matches_public_id_key" ON "matches"("public_id");
CREATE INDEX "matches_tournament_id_status_idx" ON "matches"("tournament_id", "status");
CREATE INDEX "matches_status_finished_at_idx" ON "matches"("status", "finished_at");
CREATE UNIQUE INDEX "match_athletes_match_id_color_key" ON "match_athletes"("match_id", "color");
CREATE INDEX "match_athletes_match_id_idx" ON "match_athletes"("match_id");
CREATE UNIQUE INDEX "match_access_credentials_match_id_role_key" ON "match_access_credentials"("match_id", "role");
CREATE INDEX "match_access_credentials_match_id_idx" ON "match_access_credentials"("match_id");
CREATE UNIQUE INDEX "match_sessions_token_hash_key" ON "match_sessions"("token_hash");
CREATE INDEX "match_sessions_match_id_status_idx" ON "match_sessions"("match_id", "status");
CREATE INDEX "match_sessions_credential_id_status_idx" ON "match_sessions"("credential_id", "status");
CREATE INDEX "match_sessions_status_expires_at_idx" ON "match_sessions"("status", "expires_at");
CREATE UNIQUE INDEX "match_rounds_match_id_number_key" ON "match_rounds"("match_id", "number");
CREATE INDEX "match_rounds_status_ends_at_idx" ON "match_rounds"("status", "ends_at");
CREATE UNIQUE INDEX "scoring_windows_match_id_sequence_number_key" ON "scoring_windows"("match_id", "sequence_number");
CREATE INDEX "scoring_windows_match_id_resolved_at_ends_at_idx" ON "scoring_windows"("match_id", "resolved_at", "ends_at");
CREATE INDEX "scoring_windows_status_ends_at_idx" ON "scoring_windows"("status", "ends_at");
CREATE UNIQUE INDEX "command_receipts_session_id_command_id_key" ON "command_receipts"("session_id", "command_id");
CREATE INDEX "command_receipts_match_id_created_at_idx" ON "command_receipts"("match_id", "created_at");
CREATE INDEX "command_receipts_session_id_created_at_idx" ON "command_receipts"("session_id", "created_at");
CREATE UNIQUE INDEX "referee_votes_command_receipt_id_key" ON "referee_votes"("command_receipt_id");
CREATE UNIQUE INDEX "referee_votes_scoring_window_id_referee_slot_key" ON "referee_votes"("scoring_window_id", "referee_slot");
CREATE INDEX "referee_votes_scoring_window_id_server_received_at_idx" ON "referee_votes"("scoring_window_id", "server_received_at");
CREATE INDEX "referee_votes_match_id_created_at_idx" ON "referee_votes"("match_id", "created_at");
CREATE UNIQUE INDEX "penalties_command_receipt_id_key" ON "penalties"("command_receipt_id");
CREATE INDEX "penalties_match_id_created_at_idx" ON "penalties"("match_id", "created_at");
CREATE INDEX "penalties_athlete_id_created_at_idx" ON "penalties"("athlete_id", "created_at");
CREATE UNIQUE INDEX "score_events_scoring_window_id_key" ON "score_events"("scoring_window_id");
CREATE UNIQUE INDEX "score_events_penalty_id_key" ON "score_events"("penalty_id");
CREATE INDEX "score_events_match_id_created_at_idx" ON "score_events"("match_id", "created_at");
CREATE INDEX "score_events_athlete_id_created_at_idx" ON "score_events"("athlete_id", "created_at");
CREATE UNIQUE INDEX "match_results_match_id_key" ON "match_results"("match_id");
CREATE INDEX "audit_logs_match_id_occurred_at_idx" ON "audit_logs"("match_id", "occurred_at");
CREATE INDEX "audit_logs_event_type_occurred_at_idx" ON "audit_logs"("event_type", "occurred_at");
CREATE INDEX "audit_logs_admin_user_id_occurred_at_idx" ON "audit_logs"("admin_user_id", "occurred_at");
CREATE INDEX "audit_logs_match_session_id_occurred_at_idx" ON "audit_logs"("match_session_id", "occurred_at");
CREATE UNIQUE INDEX "outbox_events_deduplication_key_key" ON "outbox_events"("deduplication_key");
CREATE INDEX "outbox_events_status_available_at_created_at_idx" ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_match_id_aggregate_version_idx" ON "outbox_events"("match_id", "aggregate_version");

-- Partial uniqueness is the final ownership/window concurrency barrier. Time is
-- intentionally absent from predicates: expiry is materialized as session state.
CREATE UNIQUE INDEX "match_sessions_one_active_per_credential_key"
  ON "match_sessions"("credential_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "scoring_windows_one_unresolved_per_match_key"
  ON "scoring_windows"("match_id") WHERE "resolved_at" IS NULL;

ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_athletes" ADD CONSTRAINT "match_athletes_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_access_credentials" ADD CONSTRAINT "match_access_credentials_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_credential_id_fkey"
  FOREIGN KEY ("credential_id") REFERENCES "match_access_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_rounds" ADD CONSTRAINT "match_rounds_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scoring_windows" ADD CONSTRAINT "scoring_windows_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scoring_windows" ADD CONSTRAINT "scoring_windows_round_id_fkey"
  FOREIGN KEY ("round_id") REFERENCES "match_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_scoring_window_id_fkey"
  FOREIGN KEY ("scoring_window_id") REFERENCES "scoring_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_command_receipt_id_fkey"
  FOREIGN KEY ("command_receipt_id") REFERENCES "command_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_athlete_id_fkey"
  FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_created_by_session_id_fkey"
  FOREIGN KEY ("created_by_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_command_receipt_id_fkey"
  FOREIGN KEY ("command_receipt_id") REFERENCES "command_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_athlete_id_fkey"
  FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_scoring_window_id_fkey"
  FOREIGN KEY ("scoring_window_id") REFERENCES "scoring_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_penalty_id_fkey"
  FOREIGN KEY ("penalty_id") REFERENCES "penalties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_created_by_admin_user_id_fkey"
  FOREIGN KEY ("created_by_admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_match_session_id_fkey"
  FOREIGN KEY ("match_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cross-table tenant and role validation prevents an ID from another match from
-- being combined into an otherwise valid row.
CREATE FUNCTION "validate_match_session_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  credential_match_id UUID;
  credential_ownership_version BIGINT;
BEGIN
  SELECT "match_id", "ownership_version"
    INTO credential_match_id, credential_ownership_version
    FROM "match_access_credentials" WHERE "id" = NEW."credential_id";
  IF credential_match_id IS DISTINCT FROM NEW."match_id" THEN
    RAISE EXCEPTION 'Session credential does not belong to match'
      USING ERRCODE = '23514', CONSTRAINT = 'match_sessions_credential_match_scope';
  END IF;
  IF NEW."status" = 'ACTIVE' AND NEW."ownership_version" IS DISTINCT FROM credential_ownership_version THEN
    RAISE EXCEPTION 'Active session ownership version is stale'
      USING ERRCODE = '23514', CONSTRAINT = 'match_sessions_current_ownership_version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "match_sessions_validate_scope"
  BEFORE INSERT OR UPDATE OF "match_id", "credential_id", "ownership_version", "status"
  ON "match_sessions" FOR EACH ROW EXECUTE FUNCTION "validate_match_session_scope"();

CREATE FUNCTION "validate_scoring_window_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  round_match_id UUID;
  round_started_at TIMESTAMPTZ(6);
  round_ends_at TIMESTAMPTZ(6);
BEGIN
  SELECT "match_id", "started_at", "ends_at"
    INTO round_match_id, round_started_at, round_ends_at
    FROM "match_rounds" WHERE "id" = NEW."round_id";
  IF round_match_id IS DISTINCT FROM NEW."match_id" THEN
    RAISE EXCEPTION 'Scoring window round does not belong to match'
      USING ERRCODE = '23514', CONSTRAINT = 'scoring_windows_round_match_scope';
  END IF;
  IF TG_OP = 'INSERT' AND (round_started_at IS NULL OR NEW."started_at" < round_started_at OR NEW."started_at" >= round_ends_at) THEN
    RAISE EXCEPTION 'Scoring window must start inside its official round'
      USING ERRCODE = '23514', CONSTRAINT = 'scoring_windows_start_inside_round';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "scoring_windows_validate_scope"
  BEFORE INSERT OR UPDATE OF "match_id", "round_id", "started_at"
  ON "scoring_windows" FOR EACH ROW EXECUTE FUNCTION "validate_scoring_window_scope"();

CREATE FUNCTION "validate_command_receipt_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_match_id UUID;
BEGIN
  SELECT "match_id" INTO session_match_id FROM "match_sessions" WHERE "id" = NEW."session_id";
  IF session_match_id IS DISTINCT FROM NEW."match_id" THEN
    RAISE EXCEPTION 'Command session does not belong to match'
      USING ERRCODE = '23514', CONSTRAINT = 'command_receipts_session_match_scope';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "command_receipts_validate_scope"
  BEFORE INSERT OR UPDATE OF "match_id", "session_id"
  ON "command_receipts" FOR EACH ROW EXECUTE FUNCTION "validate_command_receipt_scope"();

CREATE FUNCTION "validate_referee_vote"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  window_match_id UUID;
  window_round_id UUID;
  window_status "ScoringWindowStatus";
  window_started_at TIMESTAMPTZ(6);
  window_ends_at TIMESTAMPTZ(6);
  round_ends_at TIMESTAMPTZ(6);
  session_match_id UUID;
  session_role "MatchRole";
  receipt_match_id UUID;
  receipt_session_id UUID;
  receipt_type "CommandType";
BEGIN
  SELECT sw."match_id", sw."round_id", sw."status", sw."started_at", sw."ends_at", mr."ends_at"
    INTO window_match_id, window_round_id, window_status, window_started_at, window_ends_at, round_ends_at
    FROM "scoring_windows" sw
    JOIN "match_rounds" mr ON mr."id" = sw."round_id"
    WHERE sw."id" = NEW."scoring_window_id";
  SELECT ms."match_id", mac."role"
    INTO session_match_id, session_role
    FROM "match_sessions" ms
    JOIN "match_access_credentials" mac ON mac."id" = ms."credential_id"
    WHERE ms."id" = NEW."session_id";
  SELECT "match_id", "session_id", "command_type"
    INTO receipt_match_id, receipt_session_id, receipt_type
    FROM "command_receipts" WHERE "id" = NEW."command_receipt_id";

  IF window_match_id IS DISTINCT FROM NEW."match_id" OR session_match_id IS DISTINCT FROM NEW."match_id"
    OR receipt_match_id IS DISTINCT FROM NEW."match_id" OR receipt_session_id IS DISTINCT FROM NEW."session_id" THEN
    RAISE EXCEPTION 'Vote references cross-match data'
      USING ERRCODE = '23514', CONSTRAINT = 'referee_votes_match_scope';
  END IF;
  IF receipt_type IS DISTINCT FROM 'VOTE_SUBMIT' THEN
    RAISE EXCEPTION 'Vote must use a vote command receipt'
      USING ERRCODE = '23514', CONSTRAINT = 'referee_votes_command_type';
  END IF;
  IF session_role::text IS DISTINCT FROM NEW."referee_slot"::text THEN
    RAISE EXCEPTION 'Vote slot does not match authenticated credential role'
      USING ERRCODE = '23514', CONSTRAINT = 'referee_votes_authenticated_slot';
  END IF;
  IF window_status <> 'OPEN' OR NEW."server_received_at" < window_started_at
    OR NEW."server_received_at" >= window_ends_at OR NEW."server_received_at" >= round_ends_at THEN
    RAISE EXCEPTION 'Vote falls outside the half-open scoring/round interval'
      USING ERRCODE = '23514', CONSTRAINT = 'referee_votes_authoritative_time_window';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "referee_votes_validate"
  BEFORE INSERT ON "referee_votes" FOR EACH ROW EXECUTE FUNCTION "validate_referee_vote"();

CREATE FUNCTION "validate_penalty"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  athlete_match_id UUID;
  session_match_id UUID;
  session_role "MatchRole";
  receipt_match_id UUID;
  receipt_session_id UUID;
  receipt_type "CommandType";
BEGIN
  SELECT "match_id" INTO athlete_match_id FROM "match_athletes" WHERE "id" = NEW."athlete_id";
  SELECT ms."match_id", mac."role"
    INTO session_match_id, session_role
    FROM "match_sessions" ms
    JOIN "match_access_credentials" mac ON mac."id" = ms."credential_id"
    WHERE ms."id" = NEW."created_by_session_id";
  SELECT "match_id", "session_id", "command_type"
    INTO receipt_match_id, receipt_session_id, receipt_type
    FROM "command_receipts" WHERE "id" = NEW."command_receipt_id";
  IF athlete_match_id IS DISTINCT FROM NEW."match_id" OR session_match_id IS DISTINCT FROM NEW."match_id"
    OR receipt_match_id IS DISTINCT FROM NEW."match_id" OR receipt_session_id IS DISTINCT FROM NEW."created_by_session_id" THEN
    RAISE EXCEPTION 'Penalty references cross-match data'
      USING ERRCODE = '23514', CONSTRAINT = 'penalties_match_scope';
  END IF;
  IF session_role <> 'INSPECTOR' OR receipt_type <> 'PENALTY_ADD' THEN
    RAISE EXCEPTION 'Penalty requires an inspector penalty command'
      USING ERRCODE = '23514', CONSTRAINT = 'penalties_inspector_command';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "penalties_validate"
  BEFORE INSERT ON "penalties" FOR EACH ROW EXECUTE FUNCTION "validate_penalty"();

-- Match creation is one atomic aggregate: exactly two color slots, four role
-- credentials and two round lifecycle rows must exist at commit.
CREATE FUNCTION "assert_match_configuration"(target_match_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  athlete_count INTEGER;
  credential_count INTEGER;
  round_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "matches" WHERE "id" = target_match_id) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO athlete_count FROM "match_athletes" WHERE "match_id" = target_match_id;
  SELECT count(*) INTO credential_count FROM "match_access_credentials" WHERE "match_id" = target_match_id;
  SELECT count(*) INTO round_count FROM "match_rounds" WHERE "match_id" = target_match_id;
  IF athlete_count <> 2 THEN
    RAISE EXCEPTION 'Match % must have exactly two athlete color slots', target_match_id
      USING ERRCODE = '23514', CONSTRAINT = 'matches_require_two_athletes';
  END IF;
  IF credential_count <> 4 THEN
    RAISE EXCEPTION 'Match % must have exactly four access credentials', target_match_id
      USING ERRCODE = '23514', CONSTRAINT = 'matches_require_four_credentials';
  END IF;
  IF round_count <> 2 THEN
    RAISE EXCEPTION 'Match % must have exactly two round rows', target_match_id
      USING ERRCODE = '23514', CONSTRAINT = 'matches_require_two_rounds';
  END IF;
END;
$$;

CREATE FUNCTION "check_match_configuration"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_match_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'matches' THEN
    target_match_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    target_match_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."match_id" ELSE NEW."match_id" END;
  END IF;
  PERFORM "assert_match_configuration"(target_match_id);
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'matches' AND OLD."match_id" IS DISTINCT FROM NEW."match_id" THEN
    PERFORM "assert_match_configuration"(OLD."match_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "matches_configuration_complete"
  AFTER INSERT OR UPDATE ON "matches" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_configuration"();
CREATE CONSTRAINT TRIGGER "match_athletes_configuration_complete"
  AFTER INSERT OR UPDATE OR DELETE ON "match_athletes" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_configuration"();
CREATE CONSTRAINT TRIGGER "match_credentials_configuration_complete"
  AFTER INSERT OR UPDATE OR DELETE ON "match_access_credentials" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_configuration"();
CREATE CONSTRAINT TRIGGER "match_rounds_configuration_complete"
  AFTER INSERT OR UPDATE OR DELETE ON "match_rounds" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_configuration"();

-- Score and violation projections are transactionally derived from immutable
-- ledger inserts. Application services must not increment these columns again.
CREATE FUNCTION "apply_score_event_projection"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE athlete_match_id UUID;
BEGIN
  SELECT "match_id" INTO athlete_match_id FROM "match_athletes" WHERE "id" = NEW."athlete_id" FOR UPDATE;
  IF athlete_match_id IS DISTINCT FROM NEW."match_id" THEN
    RAISE EXCEPTION 'Score event athlete does not belong to match'
      USING ERRCODE = '23514', CONSTRAINT = 'score_events_athlete_match_scope';
  END IF;
  UPDATE "match_athletes"
    SET "score" = "score" + NEW."value", "updated_at" = clock_timestamp()
    WHERE "id" = NEW."athlete_id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "score_events_apply_projection"
  AFTER INSERT ON "score_events" FOR EACH ROW EXECUTE FUNCTION "apply_score_event_projection"();

CREATE FUNCTION "apply_penalty_projection"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "match_athletes"
    SET "violation_count" = "violation_count" + 1, "updated_at" = clock_timestamp()
    WHERE "id" = NEW."athlete_id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "penalties_apply_projection"
  AFTER INSERT ON "penalties" FOR EACH ROW EXECUTE FUNCTION "apply_penalty_projection"();

CREATE FUNCTION "prevent_ledger_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000', CONSTRAINT = 'immutable_official_ledger';
END;
$$;

CREATE TRIGGER "referee_votes_immutable" BEFORE UPDATE OR DELETE ON "referee_votes"
  FOR EACH ROW EXECUTE FUNCTION "prevent_ledger_mutation"();
CREATE TRIGGER "penalties_immutable" BEFORE UPDATE OR DELETE ON "penalties"
  FOR EACH ROW EXECUTE FUNCTION "prevent_ledger_mutation"();
CREATE TRIGGER "score_events_immutable" BEFORE UPDATE OR DELETE ON "score_events"
  FOR EACH ROW EXECUTE FUNCTION "prevent_ledger_mutation"();
CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "prevent_ledger_mutation"();

-- A penalty and an awarded window cannot commit without exactly one matching
-- score event. Non-awarded windows cannot have a point event.
CREATE FUNCTION "assert_penalty_score_event"(target_penalty_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE valid_event_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "penalties" WHERE "id" = target_penalty_id) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO valid_event_count
    FROM "score_events" se
    JOIN "penalties" p ON p."id" = se."penalty_id"
    WHERE p."id" = target_penalty_id
      AND se."type" = 'PENALTY'
      AND se."match_id" = p."match_id"
      AND se."athlete_id" = p."athlete_id"
      AND se."value" = p."value";
  IF valid_event_count <> 1 THEN
    RAISE EXCEPTION 'Penalty % must have exactly one matching score event', target_penalty_id
      USING ERRCODE = '23514', CONSTRAINT = 'penalties_require_score_event';
  END IF;
END;
$$;

CREATE FUNCTION "assert_window_score_event"(target_window_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  target_status "ScoringWindowStatus";
  target_awarded BOOLEAN;
  target_winner "AthleteColor";
  valid_event_count INTEGER;
BEGIN
  SELECT "status", "score_awarded", "winning_color"
    INTO target_status, target_awarded, target_winner
    FROM "scoring_windows" WHERE "id" = target_window_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT count(*) INTO valid_event_count
    FROM "score_events" se
    JOIN "match_athletes" ma ON ma."id" = se."athlete_id"
    JOIN "scoring_windows" sw ON sw."id" = se."scoring_window_id"
    WHERE sw."id" = target_window_id
      AND se."type" = 'REFEREE_POINT'
      AND se."match_id" = sw."match_id"
      AND se."value" = 1
      AND ma."match_id" = sw."match_id"
      AND ma."color" = target_winner;
  IF target_status = 'RESOLVED' AND target_awarded AND valid_event_count <> 1 THEN
    RAISE EXCEPTION 'Awarded scoring window % must have exactly one matching point event', target_window_id
      USING ERRCODE = '23514', CONSTRAINT = 'awarded_windows_require_score_event';
  END IF;
  IF (target_status <> 'RESOLVED' OR NOT target_awarded) AND valid_event_count <> 0 THEN
    RAISE EXCEPTION 'Unawarded scoring window % cannot have a point event', target_window_id
      USING ERRCODE = '23514', CONSTRAINT = 'unawarded_windows_forbid_score_event';
  END IF;
END;
$$;

CREATE FUNCTION "check_penalty_score_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "assert_penalty_score_event"(CASE WHEN TG_TABLE_NAME = 'penalties' THEN NEW."id" ELSE NEW."penalty_id" END);
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_window_score_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "assert_window_score_event"(CASE WHEN TG_TABLE_NAME = 'scoring_windows' THEN NEW."id" ELSE NEW."scoring_window_id" END);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "penalties_score_event_complete"
  AFTER INSERT ON "penalties" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_penalty_score_event"();
CREATE CONSTRAINT TRIGGER "score_events_penalty_complete"
  AFTER INSERT ON "score_events" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW."penalty_id" IS NOT NULL) EXECUTE FUNCTION "check_penalty_score_event"();
CREATE CONSTRAINT TRIGGER "scoring_windows_score_event_complete"
  AFTER INSERT OR UPDATE ON "scoring_windows" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_window_score_event"();
CREATE CONSTRAINT TRIGGER "score_events_window_complete"
  AFTER INSERT ON "score_events" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW."scoring_window_id" IS NOT NULL) EXECUTE FUNCTION "check_window_score_event"();

-- FINISHED is committed only together with a durable result snapshot equal to
-- the current ledger projection. Until the final overlapping window resolves,
-- the match therefore remains ROUND_2_RUNNING with an expired official timer.
CREATE FUNCTION "assert_match_result"(target_match_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  target_status "MatchStatus";
  result_count INTEGER;
  projection_matches BOOLEAN;
BEGIN
  SELECT "status" INTO target_status FROM "matches" WHERE "id" = target_match_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT count(*), COALESCE(bool_and(
      mr."red_score" = red."score" AND mr."blue_score" = blue."score"
    ), false)
    INTO result_count, projection_matches
    FROM "match_results" mr
    JOIN "match_athletes" red ON red."match_id" = mr."match_id" AND red."color" = 'RED'
    JOIN "match_athletes" blue ON blue."match_id" = mr."match_id" AND blue."color" = 'BLUE'
    WHERE mr."match_id" = target_match_id;
  IF target_status = 'FINISHED' AND (result_count <> 1 OR NOT projection_matches) THEN
    RAISE EXCEPTION 'Finished match % requires a result matching score projections', target_match_id
      USING ERRCODE = '23514', CONSTRAINT = 'finished_matches_require_current_result';
  END IF;
  IF target_status <> 'FINISHED' AND result_count <> 0 THEN
    RAISE EXCEPTION 'Unfinished match % cannot have a final result', target_match_id
      USING ERRCODE = '23514', CONSTRAINT = 'unfinished_matches_forbid_result';
  END IF;
END;
$$;

CREATE FUNCTION "check_match_result"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_match_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'matches' THEN
    target_match_id := NEW."id";
  ELSE
    target_match_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."match_id" ELSE NEW."match_id" END;
  END IF;
  PERFORM "assert_match_result"(target_match_id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "matches_result_complete"
  AFTER INSERT OR UPDATE ON "matches" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_result"();
CREATE CONSTRAINT TRIGGER "match_results_complete"
  AFTER INSERT OR UPDATE OR DELETE ON "match_results" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_result"();
CREATE CONSTRAINT TRIGGER "match_athlete_projection_result_complete"
  AFTER UPDATE ON "match_athletes" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_match_result"();
