# Security model

## Trust boundaries

The browser, device ID, public match ID, client clock, Socket.IO payload, and locally stored metadata are untrusted. Only a validated admin or match session conveys identity. The backend derives match, role, referee slot, and permissions from that session.

PostgreSQL is the authoritative record for active ownership and official match state. Redis is reconstructable coordination state. Nginx is the public ingress and must receive trusted proxy configuration only from controlled infrastructure.

## Authentication

### Administrators

- Hash passwords with Argon2 using reviewed cost parameters.
- Use an HTTP-only session cookie where practical.
- Set `Secure` in HTTPS deployments and an explicit `SameSite` policy.
- Enforce expiry, logout, server-side invalidation, and authorization guards.
- Protect cookie-authenticated mutations against CSRF.

### Match actors

- Verify match ID and role-specific access code on the backend.
- Do not accept a role/referee slot from the login or command payload.
- Hash access codes at rest. The selected normal flow is show once after creation and regenerate; retrieval does not require plaintext storage.
- Exchange the code for a separately revocable, expiring session token.
- Never store or reuse the raw code in browser storage after login.
- Treat `deviceId` as ownership context, not as a credential.

If a deployment later requires code retrieval, use authenticated encryption with a dedicated, rotated key and retain a separate verifier. This change requires a new ADR and migration; plaintext columns are prohibited.

## Session ownership and takeover

Every sensitive REST/Socket.IO command verifies token validity, expiry, active database session, role, match scope, and current ownership generation. Socket handshake authentication alone is insufficient.

Takeover uses an expiring, single-use challenge bound to the owner generation observed during login conflict. The transaction locks ownership, verifies the generation, revokes the old session, and activates one replacement. After commit, it refreshes Redis and targets `session:revoked` to all sockets belonging to the old session.

If Redis publication fails, the old session still cannot mutate state because PostgreSQL ownership has changed.

## Authorization

- Admin routes require backend admin guards.
- Referees may submit only RED/BLUE vote intent for their authenticated match.
- Inspectors may start valid rounds and add penalties only for their authenticated match.
- Scoreboards are display-only.
- Admin monitoring joins a match only after admin authorization.
- A requested room/match ID is checked against the authenticated principal; arbitrary room joins are rejected.
- Private revocation, credential, session, and audit events are never broadcast to the public match room.

## Input and transport controls

- Validate every DTO and Socket.IO payload with an allowlist; reject unknown/oversized fields.
- Set bounded body and Socket.IO payload sizes.
- Enforce explicit production origins for REST and Socket.IO.
- Use HTTPS/WSS in production and secure cookies.
- Use Helmet and an application-tested content security policy.
- React escapes user-supplied strings; do not render unsanitized HTML.
- Prisma parameterization is the default; reviewed raw SQL is limited to constraints/locking that require it.

## Brute-force and abuse protection

Match access codes are intentionally human-usable and require throttling. Combine short-window source limits with match-public-ID and account/credential buckets, progressive delays, and temporary cooldowns. Return a generic invalid-credentials response.

Do not rely only on IP addresses: venue devices often share one NAT address. Administrators need a documented, audited process to clear an accidental venue-wide cooldown.

Socket commands are independently rate-limited. Database uniqueness remains the final duplicate-vote defense. Disconnecting and reconnecting must not reset every abuse counter.

## Idempotency

Client-generated random command IDs cover vote, round-start, penalty, takeover, logout, and retryable mutations. The backend binds an ID to actor, command type, match, normalized payload, and stored outcome. Reusing it with different content is rejected.

Idempotency records live long enough to cover reconnect/retry behavior. They do not bypass current authorization checks: a revoked session cannot replay a previously unseen command.

## Secrets and logging

Use independent random values for admin sessions, match sessions, access-code encryption, PostgreSQL, and Redis authentication. Supply them through the deployment secret store and rotate them using a rehearsed runbook.

Never log or place in audit metadata:

- passwords or raw match codes;
- session/JWT tokens or cookie values;
- database/Redis URLs containing credentials;
- encryption keys;
- entire unfiltered request headers or payloads.

Pino redaction covers common header, cookie, password, code, and token paths. Nginx logs metadata rather than request bodies. Development credentials in screenshots and Playwright traces are still sensitive artifacts and need bounded CI retention.

## Data and operations

- Back up PostgreSQL, encrypt backups, restrict restore access, and test restoration.
- Define audit retention and administrator access policy.
- Restrict PostgreSQL and Redis to private networks; the Compose loopback bindings are for local development only.
- Run containers as non-root where practical, use read-only filesystems, scan images, and patch base images deliberately.
- Apply migrations once per release with a least-privileged migration identity where infrastructure supports it.
- Synchronize and monitor server clocks because official ordering uses server time.

## Security acceptance tests

- Cross-role and cross-match REST/Socket.IO authorization matrix.
- Old-session command after takeover, logout, expiry, and code regeneration.
- Simultaneous takeover and replayed/stale takeover challenge.
- CORS, CSRF, cookie flag, origin, and WebSocket handshake tests.
- Generic login errors, cooldown behavior, and venue NAT behavior.
- Payload fuzzing, invalid colors, unknown fields, oversized payloads, and injection strings.
- Log/audit secret redaction.
- Malicious room join with a canary event proving no data leakage.

