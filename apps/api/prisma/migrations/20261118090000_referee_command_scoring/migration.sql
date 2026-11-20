-- Referee-command scoring. Additive only: every existing bracket round and
-- match keeps the original free 1.5 s judge window through the column default.
CREATE TYPE "scoring_method" AS ENUM ('JUDGE_FREE_WINDOW', 'REFEREE_COMMAND');

ALTER TABLE "bracket_round_staffing"
  ADD COLUMN "scoring_method" "scoring_method" NOT NULL DEFAULT 'JUDGE_FREE_WINDOW';
ALTER TABLE "matches"
  ADD COLUMN "scoring_method" "scoring_method" NOT NULL DEFAULT 'JUDGE_FREE_WINDOW';

-- A referee-command window stays open until the supervisor resumes the round,
-- so its end is unknown while it is open. Every existing row already has an
-- end, and a resolved window must always record one.
ALTER TABLE "scoring_windows" ALTER COLUMN "ends_at" DROP NOT NULL;
ALTER TABLE "scoring_windows"
  ADD CONSTRAINT "scoring_windows_resolved_has_end_check"
  CHECK ("resolved_at" IS NULL OR "ends_at" IS NOT NULL);
