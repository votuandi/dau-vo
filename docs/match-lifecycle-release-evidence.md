# Match lifecycle and realtime release evidence

Status: release review, 2026-09-20.

## Requirement traceability

| Requirement                                                      | Implementation                                                                          | Automated/manual evidence                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Single lifecycle/phase authority and explicit result save        | `apps/api/src/realtime/match-lifecycle.service.ts`, `match-display-state.ts`            | lifecycle E2E and display-state specs                                                                 |
| Atomic exact-count assignment, conflicts, idempotency, and locks | `match-official-assignments.service.ts`, partial unique indexes in Prisma migrations    | assignment service tests and database-constraints spec                                                |
| Private assignment routing and reconnect convergence             | `realtime-official-routing.service.ts`, `realtime.gateway.ts`, `official-realtime.ts`   | `realtime.e2e.spec.ts`; snapshot request is the recovery authority                                    |
| Suspend/cancel history integrity and explicit completion         | `match-lifecycle.service.ts`, `bracket-outcome.service.ts`                              | lifecycle E2E and scoring integration specs                                                           |
| Official authorization and assigned-logout guard                 | `official-access.service.ts`, `official-access.controller.ts`, lifecycle identity locks | official access E2E; direct assigned logout returns 409                                               |
| Legacy isolation                                                 | `match-lifecycle.service.ts`, `match-access.service.ts`                                 | login rejects actively assigned matches; command lock rejects legacy sessions after modern assignment |
| Responsive/accessibility Vietnamese operator UI                  | `inspector-console.tsx`, `referee-console.tsx`, `official-realtime.ts`                  | web component tests; release manager performs device/keyboard QA below                                |

## Contracts

- `POST /api/official/matches/:matchId/take` is the sole assignment command. It
  requires an inspector session and exactly the match's referee count. The old
  split `claim`, `referees`, and release routes are no longer exposed.
- Socket commands are `round:start`, `round:pause`, `round:resume`,
  `match:exit`, and `match:complete`; acknowledgements use stable error codes.
- `official:assignment-updated`, `match:assignment-released`, and
  `official:assignment-snapshot` are post-commit notifications. Clients treat
  the snapshot/database state as authoritative after reconnect, duplicate, or
  out-of-order notifications.

## Migration and deployment

Deploy checked-in migrations in timestamp order through
`20260920140000_match_exit`. Verify both a clean database and a representative
legacy snapshot with waiting, running, paused, break, and finished matches:

```powershell
pnpm --filter @martial-arts-scoring/api prisma:migrate:status
pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy
pnpm --filter @martial-arts-scoring/api prisma:verify:match-lifecycle
```

Take a verified PostgreSQL backup first. There is no down migration: roll back
the application only to a schema-compatible build and use a reviewed forward
repair migration for data defects. Keep `LEGACY_MATCH_ACCESS_ENABLED=false`;
if a time-boxed compatibility window is unavoidable, legacy sessions cannot
operate a modern actively assigned match.

## Operator recovery and QA

For a stuck assignment, have the assigned inspector use the supported exit
mode; it releases all officials post-commit. If an official is deactivated,
the assignment/deactivation transaction releases or rejects safely; reactivate
only after resolving the assignment. Do not alter assignment rows manually.

Manual acceptance: run the three-referee happy path; two-inspector stale
selection conflict; suspend after rounds 1 and 2; cancel/reset; reconnect after
a missed assignment event; and assigned logout (409, then success after
release). On phone, tablet, and desktop verify exact selection count, focus
order, live status/error text, non-colour status labels, Vietnamese copy, and
offline/pending/empty states.

## Release gates and recommendation

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`, plus the API realtime/lifecycle E2E suites against PostgreSQL and
Redis. Production go requires all commands and the manual acceptance checklist
to pass. A failed migration verifier, E2E suite, or any unresolved realtime
publication alert is a no-go.
