-- EnableExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "athlete_color" AS ENUM ('RED', 'BLUE');

-- CreateEnum
CREATE TYPE "tournament_status" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('WAITING', 'ROUND_1_RUNNING', 'BREAK', 'ROUND_2_RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "match_role" AS ENUM ('REFEREE', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "referee_slot" AS ENUM ('REFEREE_1', 'REFEREE_2', 'REFEREE_3');

-- CreateEnum
CREATE TYPE "match_access_role" AS ENUM ('REFEREE_1', 'REFEREE_2', 'REFEREE_3', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "score_event_type" AS ENUM ('REFEREE_POINT', 'PENALTY', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "audit_event_type" AS ENUM ('ADMIN_ACTION', 'MATCH_ACTION', 'SESSION_ACTION', 'SCORE_ACTION', 'PENALTY_ACTION', 'SYSTEM_EVENT');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(255),
    "start_date" DATE,
    "end_date" DATE,
    "status" "tournament_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" VARCHAR(32) NOT NULL,
    "tournament_id" UUID NOT NULL,
    "status" "match_status" NOT NULL DEFAULT 'WAITING',
    "current_round" SMALLINT,
    "round_duration_ms" INTEGER NOT NULL,
    "break_duration_ms" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_athletes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "organization" VARCHAR(255) NOT NULL,
    "color" "athlete_color" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_access_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "access_role" "match_access_role" NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "access_code_id" UUID NOT NULL,
    "role" "match_role" NOT NULL,
    "referee_slot" "referee_slot",
    "device_id" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "match_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "round_number" SMALLINT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "round_number" SMALLINT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "winning_color" "athlete_color",
    "score_awarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referee_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scoring_window_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "referee_slot" "referee_slot" NOT NULL,
    "athlete_color" "athlete_color" NOT NULL,
    "session_id" UUID NOT NULL,
    "server_received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_pressed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referee_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "round_number" SMALLINT,
    "type" "score_event_type" NOT NULL,
    "value" INTEGER NOT NULL,
    "scoring_window_id" UUID,
    "penalty_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "round_number" SMALLINT,
    "value" INTEGER NOT NULL DEFAULT -1,
    "created_by_session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID,
    "admin_user_id" UUID,
    "session_id" UUID,
    "event_type" "audit_event_type" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "matches_public_id_key" ON "matches"("public_id");

-- CreateIndex
CREATE INDEX "matches_tournament_id_idx" ON "matches"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_athletes_match_id_color_key" ON "match_athletes"("match_id", "color");

-- CreateIndex
CREATE UNIQUE INDEX "match_access_codes_match_id_access_role_key" ON "match_access_codes"("match_id", "access_role");

-- CreateIndex
CREATE INDEX "match_sessions_match_id_idx" ON "match_sessions"("match_id");

-- CreateIndex
CREATE INDEX "match_sessions_access_code_id_idx" ON "match_sessions"("access_code_id");

-- CreateIndex
CREATE INDEX "rounds_match_id_idx" ON "rounds"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_match_id_round_number_key" ON "rounds"("match_id", "round_number");

-- CreateIndex
CREATE INDEX "scoring_windows_match_id_idx" ON "scoring_windows"("match_id");

-- CreateIndex
CREATE INDEX "scoring_windows_resolved_at_idx" ON "scoring_windows"("resolved_at");

-- CreateIndex
CREATE INDEX "referee_votes_scoring_window_id_idx" ON "referee_votes"("scoring_window_id");

-- CreateIndex
CREATE INDEX "referee_votes_match_id_idx" ON "referee_votes"("match_id");

-- CreateIndex
CREATE INDEX "referee_votes_session_id_idx" ON "referee_votes"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "referee_votes_scoring_window_id_referee_slot_key" ON "referee_votes"("scoring_window_id", "referee_slot");

-- CreateIndex
CREATE INDEX "score_events_match_id_idx" ON "score_events"("match_id");

-- CreateIndex
CREATE INDEX "score_events_athlete_id_idx" ON "score_events"("athlete_id");

-- CreateIndex
CREATE INDEX "score_events_scoring_window_id_idx" ON "score_events"("scoring_window_id");

-- CreateIndex
CREATE INDEX "score_events_penalty_id_idx" ON "score_events"("penalty_id");

-- CreateIndex
CREATE INDEX "penalties_match_id_idx" ON "penalties"("match_id");

-- CreateIndex
CREATE INDEX "penalties_athlete_id_idx" ON "penalties"("athlete_id");

-- CreateIndex
CREATE INDEX "penalties_created_by_session_id_idx" ON "penalties"("created_by_session_id");

-- CreateIndex
CREATE INDEX "audit_logs_match_id_created_at_idx" ON "audit_logs"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_admin_user_id_idx" ON "audit_logs"("admin_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_session_id_idx" ON "audit_logs"("session_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_athletes" ADD CONSTRAINT "match_athletes_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_access_codes" ADD CONSTRAINT "match_access_codes_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_access_code_id_fkey" FOREIGN KEY ("access_code_id") REFERENCES "match_access_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_windows" ADD CONSTRAINT "scoring_windows_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_scoring_window_id_fkey" FOREIGN KEY ("scoring_window_id") REFERENCES "scoring_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_scoring_window_id_fkey" FOREIGN KEY ("scoring_window_id") REFERENCES "scoring_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_penalty_id_fkey" FOREIGN KEY ("penalty_id") REFERENCES "penalties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_created_by_session_id_fkey" FOREIGN KEY ("created_by_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "match_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
