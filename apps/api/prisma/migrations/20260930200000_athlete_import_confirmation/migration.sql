CREATE TABLE "athlete_import_confirmations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "key" VARCHAR(255) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "results" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_import_confirmations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "athlete_import_confirmations_key_key" UNIQUE ("key"),
  CONSTRAINT "athlete_import_confirmations_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "athlete_import_confirmations_tournament_actor_idx"
  ON "athlete_import_confirmations"("tournament_id", "actor_id");
