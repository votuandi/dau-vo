# Testing strategy

Scoring correctness is the release gate. Visual success cannot compensate for a duplicate, missing, unauditable, or client-influenced official result.

## Test layers

### Unit

Run pure domain logic with an injected clock:

- all 27 combinations of absent/RED/BLUE across three referee slots;
- one point maximum and color/permutation invariance;
- one vote per slot and exact retry behavior;
- scoring boundaries at `0`, `1`, `998`, `999`, `1000`, and `1001 ms`;
- round-end overlap and exact round deadline;
- every valid and invalid match-state transition;
- score-event folding, penalty deduction, and cached-score reconciliation;
- authorization/session predicates, public-ID collision retries, validation, and redaction;
- web timer rendering, reconnect state, ack feedback, and Vietnamese error mapping.

Fake timers test wake-up behavior, not official timestamp eligibility.

### Integration

Use real PostgreSQL and Redis. SQLite, an in-memory repository, or a mocked Redis client cannot validate constraints, transaction locking, Pub/Sub, or recovery.

Exercise REST and real `socket.io-client` connections for authentication, room authorization, snapshots, vote persistence, resolution, penalties, takeover, presence, reconnect, rate limits, and audit history. A success acknowledgement is asserted only after the relevant transaction is visible from another database connection.

Give tests unique matches. Socket integration tests span connection pools and must not rely on a wrapping transaction for cleanup.

### Concurrency

Run two independently booted API instances against the same PostgreSQL and Redis. Coordinate starts with barriers or test-only failpoints, not wall-clock sleeps. Repeat key races hundreds of times:

- simultaneous first votes create one window;
- three votes persist once by slot;
- duplicate packet/command creates one vote;
- two resolvers create one score event;
- a 999 ms vote races deadline resolution;
- two round-start commands create one transition;
- duplicate penalty creates one deduction;
- two takeover contenders yield one owner and one conflict;
- an old-owner command races the takeover commit;
- two recovery scans process overdue work once.

After each run, query for duplicate window/slot votes, multiple referee events per window, multiple active owners/open windows, penalty/event mismatches, and cached-score drift.

### Browser E2E

Playwright uses isolated contexts for admin, three referees, inspector, and scoreboard. The primary scenario creates and completes a match through the UI, verifies synchronized server timestamps, awards one majority point, applies a penalty, crosses both round boundaries, and inspects complete history.

Additional scenarios cover refresh, reconnect, offline submission feedback, stale-command suppression, takeover, old-device rejection, consecutive windows, split vote/no score, mobile controls, client-clock forgery, and cross-match isolation.

Use short configurable round/break durations in CI but keep the scoring window at 1000 ms. Wait on acknowledgements, UI state, snapshots, or persisted history—not arbitrary sleeps.

## Restart and dependency tests

In an isolated Compose project:

- hard-kill the API during each match state and an unresolved window;
- inject crashes before transaction, during transaction, after commit/before broadcast, and after broadcast;
- kill one of two API replicas and observe reconnect to the survivor;
- start two recovery workers concurrently;
- restart Redis empty while preserving PostgreSQL;
- interrupt Redis at runtime and verify readiness/fail-closed behavior;
- restore Redis and verify ownership/cache rebuild plus snapshot recovery.

Expected invariants are unchanged official history, no duplicate resolution, stable round timestamps, and rebuilt—not fabricated—ephemeral state.

## Load and soak

Use a TypeScript harness using the project's `socket.io-client`. A generic WebSocket driver does not implement Socket.IO framing.

Baseline scenario:

1. Two API replicas behind the production Nginx path.
2. Ramp to 100 matches with three referees, one inspector, and one scoreboard each: 500 sockets.
3. Sustain realistic vote windows, split decisions, penalties, and snapshot requests for 15 minutes.
4. Trigger a reconnect storm and remove one API replica.
5. Run a one- to two-hour nightly soak.

Record connection/snapshot, vote-ack, and deadline-to-resolution latency; event-loop lag; memory; PostgreSQL locks; Redis latency; reconnect duration; and event isolation.

Initial hardware-specific targets:

- zero incorrect/duplicate scores or cross-match events;
- p95 vote acknowledgement below 250 ms and p99 below 500 ms;
- p95 resolution publication within 250 ms after deadline and p99 within 500 ms;
- no unbounded memory growth;
- every reconnect converges through a snapshot.

Any correctness failure fails the load run regardless of percentile performance.

## Commands and CI jobs

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:integration
pnpm test:e2e
```

CI should separate static/unit, fresh-migration smoke, integration/concurrency, Docker smoke, and Playwright jobs. Restart/Redis-loss and load/soak suites run nightly and before a competition release.

For Docker smoke testing:

```bash
docker compose config --quiet
docker compose build
docker compose up -d --wait
docker compose ps
```

CI must always collect sanitized service logs and Playwright traces on failure, then remove only its uniquely named Compose project and test volumes.

## Release evidence

Retain:

- JUnit/unit/integration reports;
- migration-from-empty result;
- concurrency iteration counts and invariant queries;
- Playwright trace/screenshots for failures;
- image digests and vulnerability scan result;
- hardware/load profile and percentiles;
- restart/Redis recovery drill result;
- exact commit, schema migration, and configuration used.

