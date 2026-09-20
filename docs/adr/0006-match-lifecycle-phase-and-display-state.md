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

Phase includes `AWAITING_RESULT_SAVE`. Ending round 2 moves the match to that
phase while retaining its active assignment and has no bracket side effect.
Only the active assigned inspector's explicit `match:complete` command marks
the match `COMPLETED`, releases officials, and progresses the bracket. A
suspended match resumes only when a complete new crew is atomically taken;
the retained round history determines whether it resumes at `BREAK` or
`AWAITING_RESULT_SAVE`.

Fixture readiness and operational lifecycle are projected into one stable
`MatchDisplayState`: unresolved bracket fixtures are `NOT_READY`, resolved but
unprepared fixtures are `READY`, and prepared fixtures or manual matches derive
`NOT_STARTED`, `IN_PROGRESS`, `SUSPENDED`, or `COMPLETED` from the persisted
match lifecycle. This lets bracket clients render useful state without creating
placeholder `matches` rows and keeps one backend projection authoritative.

## Transitions and authority

The intended lifecycle transitions are:

| From                                   | Command                                      | To                                     | Durable effect                                                                      |
| -------------------------------------- | -------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `NOT_STARTED` / `SUSPENDED`            | atomic `POST /official/matches/:id/take`     | `IN_PROGRESS`                          | complete inspector/referee crew is created; a suspended match keeps retained rounds |
| `IN_PROGRESS`                          | `round:start`, `round:pause`, `round:resume` | `IN_PROGRESS`                          | phase advances only through the lifecycle service                                   |
| `IN_PROGRESS`                          | round 2 ends                                 | `IN_PROGRESS` / `AWAITING_RESULT_SAVE` | no bracket progression and no release                                               |
| `IN_PROGRESS`                          | `match:exit` cancel or suspend               | `NOT_STARTED` or `SUSPENDED`           | intended history is invalidated or retained; crew is released                       |
| `IN_PROGRESS` / `AWAITING_RESULT_SAVE` | `match:complete`                             | `COMPLETED`                            | explicit result save, bracket processing, and release occur atomically              |

Normal exit never downgrades a completed match. Result cancellation and undo
retain their historical audit/result-operation records; unsafe outcome reversal
continues to be blocked when a downstream prepared fixture exists.

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
