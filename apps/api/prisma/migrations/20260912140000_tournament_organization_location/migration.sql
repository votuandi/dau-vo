-- Optional organization location is intentionally distinct from tournament location
-- and organization details.
ALTER TABLE "tournament_organizations"
  ADD COLUMN "location" VARCHAR(255);
