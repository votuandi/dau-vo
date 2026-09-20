# ADR 0006: Match lifecycle, scoring phase, and display state

Status: Accepted (2026-09-20)

## Decision

An operational match now persists `lifecycle` independently from its detailed
round/scoring phase. Lifecycle has four authoritative values: `NOT_STARTED`,
`IN_PROGRESS`, `SUSPENDED`, and `COMPLETED`. The existing PostgreSQL `status`
column remains in place and remains the authoritative phase column. It is
exposed as `phase` in new contracts because a physical rename would add rollout
risk to the established scoring and result-operation history. `status` is a
deprecated compatibility alias and is scheduled for removal in the final
contract-hardening prompt.

Phase includes `AWAITING_RESULT_SAVE`, but this foundation does not transition
to it yet. Round 2 therefore keeps its current automatic `FINISHED` behavior.
A later prompt will move the end-of-round-2 transition to
`AWAITING_RESULT_SAVE` and add the explicit, authorized save command.

Fixture readiness and operational lifecycle are projected into one stable
`MatchDisplayState`: unresolved bracket fixtures are `NOT_READY`, resolved but
unprepared fixtures are `READY`, and prepared fixtures or manual matches derive
`NOT_STARTED`, `IN_PROGRESS`, `SUSPENDED`, or `COMPLETED` from the persisted
match lifecycle. This lets bracket clients render useful state without creating
placeholder `matches` rows and keeps one backend projection authoritative.

## Transitions and authority

The intended lifecycle transitions are:

- `NOT_STARTED -> IN_PROGRESS` when round 1 starts.
- `IN_PROGRESS -> SUSPENDED` when the later operational-exit flow suspends a match.
- `SUSPENDED -> IN_PROGRESS` when an authorized later resume flow succeeds.
- `IN_PROGRESS -> COMPLETED` only with completed phase and `finishedAt`.
- Result cancellation may move `COMPLETED -> IN_PROGRESS` (round 2 only) or
  `COMPLETED -> NOT_STARTED` (whole-match reset), preserving and invalidating
  historical scoring rows under the existing audit operation.
- Undo restores lifecycle deterministically from the restored phase.

PostgreSQL is authoritative. Realtime snapshots expose both `lifecycle` and
`phase`; reconnecting clients reconcile from those snapshots. Events are still
published only after their database transaction commits.

## Invariants and migration

The additive migration maps `WAITING` to `NOT_STARTED`, `FINISHED` to
`COMPLETED`, and every running, paused, or between-round phase to `IN_PROGRESS`.
It does not rewrite score, round, result-operation, assignment, fixture, or
audit rows. `finishedAt` remains the completion timestamp; it is not duplicated.
`suspendedAt` is added because a suspension needs its own audit boundary.

Database checks enforce new writes so that completed lifecycle requires both a
finished phase and `finishedAt`, not-started lifecycle requires an untouched
round-1 state, and `suspendedAt` exists exactly for suspended lifecycle. They are
installed `NOT VALID` so anomalous historical rows cannot make an additive
deployment fail; the migration verifier covers representative valid legacy
rows. Validation of historical constraints can be scheduled after a production
audit.

The future suspension transition must release active official assignments in
the same transaction, using the existing match-first deterministic lock order,
before setting `SUSPENDED`. A cross-table assignment rule cannot be represented
by a PostgreSQL row check without a trigger, so that invariant belongs in the
single domain transition service and the existing partial unique assignment
indexes remain the concurrency backstop.
