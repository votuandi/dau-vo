ALTER TYPE "match_status" ADD VALUE 'ROUND_1_PAUSED' AFTER 'ROUND_1_RUNNING';
ALTER TYPE "match_status" ADD VALUE 'ROUND_2_PAUSED' AFTER 'ROUND_2_RUNNING';

ALTER TYPE "audit_event_type" ADD VALUE 'ROUND_PAUSED' AFTER 'ROUND_STARTED';
ALTER TYPE "audit_event_type" ADD VALUE 'ROUND_RESUMED' AFTER 'ROUND_PAUSED';

ALTER TABLE "rounds"
ADD COLUMN "paused_at" TIMESTAMPTZ(3),
ADD COLUMN "remaining_duration_ms" INTEGER;

ALTER TABLE "rounds"
ADD CONSTRAINT "rounds_remaining_duration_ms_check"
CHECK ("remaining_duration_ms" IS NULL OR "remaining_duration_ms" >= 0);
