-- The NOT NULL default backfills existing roster rows as false and remains the
-- database-level default for every subsequently created athlete.
ALTER TABLE "tournament_athletes"
  ADD COLUMN "is_seed" BOOLEAN NOT NULL DEFAULT false;
