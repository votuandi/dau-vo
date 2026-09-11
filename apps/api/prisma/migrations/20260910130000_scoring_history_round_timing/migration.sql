ALTER TABLE "rounds" ADD COLUMN "duration_ms" INTEGER;

ALTER TABLE "scoring_windows"
ADD COLUMN "round_id" UUID,
ADD COLUMN "round_elapsed_ms" INTEGER;

ALTER TABLE "score_events"
ADD COLUMN "round_id" UUID,
ADD COLUMN "occurred_at" TIMESTAMPTZ(3),
ADD COLUMN "round_elapsed_ms" INTEGER;

ALTER TABLE "scoring_windows"
ADD CONSTRAINT "scoring_windows_round_id_fkey"
FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "score_events"
ADD CONSTRAINT "score_events_round_id_fkey"
FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "scoring_windows_round_id_idx" ON "scoring_windows"("round_id");
CREATE INDEX "score_events_round_id_idx" ON "score_events"("round_id");
