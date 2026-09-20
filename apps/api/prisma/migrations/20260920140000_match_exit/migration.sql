ALTER TYPE "match_official_assignment_release_reason" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_CANCELLED';
ALTER TYPE "match_official_assignment_release_reason" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_SUSPENDED_KEEP_ROUND_1';
ALTER TYPE "match_official_assignment_release_reason" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_SUSPENDED_KEEP_ROUNDS_1_AND_2';
ALTER TYPE "match_result_operation_type" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_CANCEL_RESULTS';
ALTER TYPE "match_result_operation_type" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_SUSPEND_KEEP_ROUND_1';
ALTER TYPE "match_result_operation_type" ADD VALUE IF NOT EXISTS 'MATCH_EXIT_SUSPEND_KEEP_ROUNDS_1_AND_2';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'MATCH_EXITED';
ALTER TABLE "match_result_operations" ADD COLUMN IF NOT EXISTS "previous_lifecycle" "match_lifecycle" NOT NULL DEFAULT 'IN_PROGRESS';
ALTER TABLE "match_result_operations" ADD COLUMN IF NOT EXISTS "resulting_lifecycle" "match_lifecycle" NOT NULL DEFAULT 'IN_PROGRESS';
