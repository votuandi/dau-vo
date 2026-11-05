-- ADMIN_MANUAL has no appeal/overtime source or publishing supervisor.
-- The administrator is recorded in the outcome snapshot and MATCH_ACTION audit.
-- Retain the original source and supervisor requirements for scored outcomes.
ALTER TABLE "match_outcomes"
  DROP CONSTRAINT "match_outcomes_method_source_check",
  DROP CONSTRAINT "match_outcomes_supervisor_actor_provenance_check",
  ADD CONSTRAINT "match_outcomes_method_source_check" CHECK (
    ("method" = 'REGULATION_SCORE' AND "source_appeal_id" IS NOT NULL AND "source_overtime_round_id" IS NULL) OR
    ("method" = 'OVERTIME_SCORE' AND "source_appeal_id" IS NOT NULL AND "source_overtime_round_id" IS NOT NULL) OR
    ("method" = 'MANUAL_AFTER_OVERTIME_TIE' AND "source_overtime_round_id" IS NOT NULL) OR
    ("method" = 'ADMIN_MANUAL' AND "source_appeal_id" IS NULL AND "source_overtime_round_id" IS NULL)
  ),
  ADD CONSTRAINT "match_outcomes_supervisor_actor_provenance_check" CHECK (
    ("method" = 'ADMIN_MANUAL' AND "published_supervisor_assignment_id" IS NULL AND "published_supervisor_session_id" IS NULL) OR
    ("method" <> 'ADMIN_MANUAL' AND (("published_supervisor_assignment_id" IS NULL) <> ("published_supervisor_session_id" IS NULL)))
  );
