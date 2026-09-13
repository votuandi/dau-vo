ALTER TABLE "tournament_brackets" ADD COLUMN "champion_entrant_id" UUID;
ALTER TABLE "tournament_brackets" ADD CONSTRAINT "tournament_brackets_champion_entrant_id_fkey"
  FOREIGN KEY ("champion_entrant_id") REFERENCES "bracket_entrants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bracket_winner_decision_idempotency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fixture_id" UUID NOT NULL,
  "key" VARCHAR(255) NOT NULL,
  "entrant_id" UUID NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracket_winner_decision_idempotency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bracket_winner_decision_idempotency_fixture_id_key_key" UNIQUE ("fixture_id", "key"),
  CONSTRAINT "bracket_winner_decision_idempotency_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "bracket_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
