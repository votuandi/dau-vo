-- Store only non-reversible request fingerprints. Preview tokens are credentials
-- and intentionally never persist beyond the request that verifies them.
ALTER TABLE "tournament_brackets"
  ADD COLUMN "confirmation_fingerprint" CHAR(64) NOT NULL DEFAULT '';

ALTER TABLE "bracket_winner_decision_idempotency"
  ADD COLUMN "request_fingerprint" CHAR(64) NOT NULL DEFAULT '';

-- A key is global to the endpoint: it must never alias a decision for another
-- fixture. The fingerprint then supplies the precise semantic comparison.
ALTER TABLE "bracket_winner_decision_idempotency"
  DROP CONSTRAINT "bracket_winner_decision_idempotency_fixture_id_key_key";
CREATE UNIQUE INDEX "bracket_winner_decision_idempotency_key_key"
  ON "bracket_winner_decision_idempotency"("key");
