-- An administrator may finalize or correct a match independently of scored appeals.
ALTER TYPE "match_outcome_method" ADD VALUE IF NOT EXISTS 'ADMIN_MANUAL';

CREATE TABLE "match_winner_decision_idempotency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_id" UUID NOT NULL,
  "key" VARCHAR(255) NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_winner_decision_idempotency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_winner_decision_idempotency_key_key" UNIQUE ("key"),
  CONSTRAINT "match_winner_decision_idempotency_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
