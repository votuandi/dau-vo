-- Match-session tokens are looked up by their keyed hash. The unique index is
-- also the final collision guard for cryptographically generated raw tokens.
CREATE UNIQUE INDEX "match_sessions_token_hash_key"
ON "match_sessions"("token_hash");

-- PostgreSQL is the ownership authority: historical/revoked rows are retained,
-- while at most one unrevoked active session may own an access credential.
CREATE UNIQUE INDEX "match_sessions_one_active_credential_key"
ON "match_sessions"("access_code_id")
WHERE "active" = TRUE AND "revoked_at" IS NULL;
