-- A penalty may exceed the referee subtotal. Final match scores are bounded
-- at zero, consistently with the service calculation and the UI preview.
ALTER TABLE "match_appeal_adjustments"
  DROP CONSTRAINT IF EXISTS "match_appeal_adjustments_final_score_check";

ALTER TABLE "match_appeal_adjustments"
  ADD CONSTRAINT "match_appeal_adjustments_final_score_check"
  CHECK (
    "final_score" = GREATEST(
      0,
      "base_referee_score" + "bonus_points" - "penalty_points"
    )
  );
