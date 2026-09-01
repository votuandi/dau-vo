# Restart and Redis recovery runbook

## Safety principles

- PostgreSQL is the source of truth.
- Do not manually edit aggregate scores without a durable, audited adjustment event.
- Do not delete an unresolved window to make startup succeed.
- Redis state may be rebuilt; PostgreSQL data must be preserved and backed up first.
- Keep clients in a clearly reconnecting/locked state until authoritative readiness returns.

## API restart

On startup, each API replica remains unready while it:

1. Connects to PostgreSQL and verifies the expected schema.
2. Connects to Redis.
3. Finds non-finished matches and persisted round deadlines.
4. Applies overdue round transitions with transactional claims.
5. Finds unresolved scoring windows whose deadlines passed.
6. Resolves each window idempotently, including windows overlapping round end.
7. Rebuilds active-window and session-ownership cache keys.
8. Starts realtime/scheduled processing and marks readiness true.

Multiple replicas may discover the same work; only the replica winning the database claim produces an effect.

## API crash during a window

After restart, inspect the window, accepted votes, resolution state, score-event reference, and audit history. Expected outcomes:

- A transaction that did not commit has no partial point/aggregate/audit effect.
- A committed resolution has one point at most, even if its broadcast was lost.
- An overdue unresolved window is resolved from its durable eligible votes.
- Clients reconnect and replace local state from the authoritative snapshot.

Before returning a competition display to normal, reconcile each cached score with score events and confirm the last round/window history in the admin view.

## Redis unavailable at runtime

Expected application behavior:

1. API readiness becomes 503; liveness remains 200.
2. Coordination-sensitive commands fail closed with a retryable error rather than using divergent in-memory state.
3. Existing displays may show the last snapshot with a reconnecting indicator.
4. Official PostgreSQL history remains unchanged.

Check Redis process/container, memory, disk, network, authentication, and logs. Do not switch to an unrelated empty Redis instance without following the rebuild procedure.

## Rebuild Redis from PostgreSQL

1. Stop or drain API mutation traffic while Redis is unavailable.
2. Preserve PostgreSQL and take an incident backup if practical.
3. Restore/start Redis and verify `PING`.
4. Restart or invoke the controlled API recovery process.
5. Rebuild active session ownership from active PostgreSQL sessions and their ownership generations.
6. Rebuild active-window/match references from unresolved PostgreSQL rows.
7. Leave presence empty; authenticated socket reconnects rebuild connection counts naturally.
8. Start Pub/Sub/Socket.IO adapters and wait for API readiness.
9. Reconnect clients and verify snapshots.

If Redis contains stale keys that disagree with PostgreSQL, PostgreSQL wins and the stale keys are overwritten. Never reactivate a database-revoked session solely because Redis says it owns a credential.

## Verification

For every affected active match verify:

- state, current round, `startedAt`, and `endsAt`;
- no multiple active session owners per credential;
- no multiple unresolved/open windows;
- at most one vote per referee slot/window;
- at most one referee score event/window;
- one score event per penalty;
- cached score equals the sum of durable events;
- last overlapping window is resolved before final-result sealing;
- admin audit explains every transition and score.

Then exercise one authorized snapshot/reconnect and a controlled no-score or test-match window. Do not use a live competition match for destructive validation.

## One replica lost in a multi-instance deployment

Remove the failed replica from service discovery. Clients attached to it reconnect through the edge, authenticate again, rejoin their authorized room, and receive a snapshot. Confirm the surviving replica remains ready and that the Redis adapter is publishing across remaining instances.

When the failed replica returns, it runs normal idempotent startup recovery before readiness. Investigate repeated crash loops instead of allowing an unbounded restart storm.

## Incident record

Capture timestamps, affected match IDs, image/schema versions, dependency state, logs with request/window IDs, recovery actions, invariant-query results, and final audit reconciliation. Never include codes, tokens, cookies, passwords, or secret URLs.

