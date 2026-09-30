-- The default fills every existing weight class and preserves current behaviour.
ALTER TABLE "tournament_weight_classes"
  ADD COLUMN "intermission_duration_seconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tournament_weight_classes"
  ADD CONSTRAINT "tournament_weight_classes_intermission_duration_seconds_nonnegative"
  CHECK ("intermission_duration_seconds" >= 0);
