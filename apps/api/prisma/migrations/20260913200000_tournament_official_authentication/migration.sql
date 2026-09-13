-- PostgreSQL enforces the single live owner invariant in addition to the
-- service's row-lock/CAS protocol. Historical revoked rows remain retained.
CREATE UNIQUE INDEX "tournament_official_sessions_one_active_official_key"
ON "tournament_official_sessions" ("official_id") WHERE "active" = true;
