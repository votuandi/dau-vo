ALTER TABLE "media_deletions"
  ADD COLUMN "lease_owner" VARCHAR(100),
  ADD COLUMN "lease_until" TIMESTAMPTZ(3);

CREATE INDEX "media_deletions_lease_until_idx" ON "media_deletions"("lease_until");

CREATE TABLE "media_migrations" (
  "storage_key" VARCHAR(1024) NOT NULL,
  "state" VARCHAR(30) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "media_migrations_pkey" PRIMARY KEY ("storage_key")
);

CREATE INDEX "media_migrations_state_idx" ON "media_migrations"("state");
