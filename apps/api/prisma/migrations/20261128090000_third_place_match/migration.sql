-- "Thực hiện trận tranh hạng 3": the two semi-final losers play for third place.
CREATE TYPE "bracket_slot_source_outcome" AS ENUM ('WINNER', 'LOSER');

ALTER TABLE "bracket_slots"
  ADD COLUMN "source_outcome" "bracket_slot_source_outcome" NOT NULL DEFAULT 'WINNER';

ALTER TABLE "tournament_weight_classes"
  ADD COLUMN "third_place_match_enabled" BOOLEAN NOT NULL DEFAULT false;
