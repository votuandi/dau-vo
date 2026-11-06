-- Preserve existing matches: two regulation rounds and their original duration.
ALTER TABLE "matches" ADD COLUMN "regulation_round_count" SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE "matches" ADD CONSTRAINT "matches_regulation_round_count_check"
  CHECK ("regulation_round_count" BETWEEN 1 AND 20);
ALTER TABLE "bracket_round_staffing"
  ADD COLUMN "regulation_round_count" SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN "round_duration_ms" INTEGER NOT NULL DEFAULT 120000;
ALTER TABLE "bracket_round_staffing"
  ADD CONSTRAINT "bracket_round_settings_count_check" CHECK ("regulation_round_count" BETWEEN 1 AND 20),
  ADD CONSTRAINT "bracket_round_settings_duration_check" CHECK ("round_duration_ms" BETWEEN 1000 AND 3600000);
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_descriptor_check";
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_descriptor_check" CHECK (
  ("stage" = 'REGULATION' AND "attempt_number" = 0 AND "round_number" BETWEEN 1 AND 20) OR
  ("stage" = 'OVERTIME' AND "attempt_number" >= 1 AND "round_number" = 1)
);
