CREATE TYPE "match_result_operation_type" AS ENUM ('ROUND_RESET', 'MATCH_RESET');
CREATE TYPE "match_result_operation_status" AS ENUM ('APPLIED', 'UNDONE');

CREATE TABLE "match_result_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "audit_log_id" UUID NOT NULL,
    "type" "match_result_operation_type" NOT NULL,
    "round_numbers" SMALLINT[] NOT NULL,
    "previous_status" "match_status" NOT NULL,
    "previous_current_round" SMALLINT,
    "previous_started_at" TIMESTAMPTZ(3),
    "previous_finished_at" TIMESTAMPTZ(3),
    "resulting_status" "match_status" NOT NULL,
    "resulting_current_round" SMALLINT,
    "created_by_session_id" UUID NOT NULL,
    "status" "match_result_operation_status" NOT NULL DEFAULT 'APPLIED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMPTZ(3),
    CONSTRAINT "match_result_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_result_operations_audit_log_id_key" ON "match_result_operations"("audit_log_id");
CREATE INDEX "match_result_operations_match_id_status_created_at_idx"
ON "match_result_operations"("match_id", "status", "created_at");

ALTER TABLE "match_result_operations"
ADD CONSTRAINT "match_result_operations_match_id_fkey"
FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
