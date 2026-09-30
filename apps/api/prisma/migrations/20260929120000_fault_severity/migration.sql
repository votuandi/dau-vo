-- Faults existed before severity was introduced. Classify every historical
-- record as MINOR so each persisted event remains visible exactly once.
CREATE TYPE "fault_severity" AS ENUM ('MINOR', 'MAJOR');
ALTER TABLE "faults"
  ADD COLUMN "severity" "fault_severity" NOT NULL DEFAULT 'MINOR';
CREATE INDEX "faults_match_id_athlete_id_severity_invalidated_at_idx"
  ON "faults"("match_id", "athlete_id", "severity", "invalidated_at");
