-- Score state is coordinated through PostgreSQL, not process memory. These
-- partial unique indexes are final safeguards in addition to Match-row locks.

-- A match may have only one unresolved scoring window at a time, including
-- when two NestJS instances receive the first vote concurrently.
CREATE UNIQUE INDEX "scoring_windows_one_unresolved_match_key"
ON "scoring_windows"("match_id")
WHERE "resolved_at" IS NULL;

-- A scoring window can award at most one official referee point. NULLs remain
-- allowed for unrelated score events, while any non-null window reference is
-- protected by this database-level final guard.
CREATE UNIQUE INDEX "score_events_one_scoring_window_key"
ON "score_events"("scoring_window_id")
WHERE "scoring_window_id" IS NOT NULL;

CREATE INDEX "scoring_windows_match_id_resolved_at_idx"
ON "scoring_windows"("match_id", "resolved_at");
