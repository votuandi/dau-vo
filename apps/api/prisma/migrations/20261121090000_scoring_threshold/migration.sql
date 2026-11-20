-- Win rule for an even number of scorers (judges + supervisor "TT"). NULL means the
-- organiser has not chosen one yet: the admin UI requires a choice before saving such a
-- round, and a match without one keeps the original rule (more than half of all scorers).
-- Additive only: existing rounds and matches get NULL and keep their behaviour.
CREATE TYPE "scoring_threshold" AS ENUM ('MORE_THAN_HALF', 'AT_LEAST_HALF');

ALTER TABLE "bracket_round_staffing" ADD COLUMN "scoring_threshold" "scoring_threshold";
ALTER TABLE "matches" ADD COLUMN "scoring_threshold" "scoring_threshold";
