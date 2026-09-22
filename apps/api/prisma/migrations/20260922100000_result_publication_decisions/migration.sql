-- Forward-only correction for the deployed fault/appeal/overtime migration.
-- A manual winner is a private decision, never a MatchOutcome before publication.
CREATE TABLE "match_result_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "winner_athlete_id" UUID NOT NULL,
  "winner_color" "athlete_color" NOT NULL,
  "source_appeal_id" UUID NOT NULL,
  "source_overtime_round_id" UUID NOT NULL,
  "selected_inspector_assignment_id" UUID,
  "selected_inspector_session_id" UUID,
  "selected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidated_at" TIMESTAMPTZ(3),
  "invalidated_by_audit_id" UUID,
  CONSTRAINT "match_result_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_result_decisions_match_appeal_key" UNIQUE ("match_id", "source_appeal_id"),
  CONSTRAINT "match_result_decisions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_result_decisions_winner_athlete_id_fkey" FOREIGN KEY ("winner_athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_result_decisions_source_appeal_id_fkey" FOREIGN KEY ("source_appeal_id") REFERENCES "match_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_result_decisions_source_overtime_round_id_fkey" FOREIGN KEY ("source_overtime_round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "match_result_decisions_match_invalidated_idx" ON "match_result_decisions"("match_id", "invalidated_at");

CREATE TABLE "match_result_publications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "fingerprint" VARCHAR(128) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_result_publications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_result_publications_match_key_key" UNIQUE ("match_id", "idempotency_key"),
  CONSTRAINT "match_result_publications_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
