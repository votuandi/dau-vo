-- Forward-only durable scheduling for the media-deletion outbox. Existing
-- rows are immediately eligible, preserving the pre-migration behavior.
ALTER TABLE "media_deletions"
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Serves the bounded eligible-page scan in deterministic scheduler order.
CREATE INDEX "media_deletions_eligibility_order_idx"
  ON "media_deletions"("next_attempt_at", "created_at", "id");
