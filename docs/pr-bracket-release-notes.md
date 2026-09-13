# Bracket PR description

## Migration impact and rollback

This branch adds the bracket aggregate tables, fixture/slot membership checks,
the nullable unique `matches.bracket_fixture_id` link, and supporting indexes.
Migrations are additive. `prisma migrate status` reports 33 applied migrations
and an up-to-date schema in the review environment. Rollback is operational:
disable bracket entry points; do not delete confirmed brackets, linked matches,
credential hashes, or audit history.

## API and security changes

The admin API adds draw setup, preview, confirmation, current-bracket lookup,
cancellation, fixture preparation, and manual-tie-decision endpoints. Setup,
preview, confirmation, cancellation, preparation, and winner-decision responses
are `Cache-Control: no-store`. Setup and preview tokens are five-minute,
HMAC-authenticated POST-body bearer values; neither is persisted, included in a
GET response, audit payload, browser storage, or logger output. HTTP logging
redacts both tokens. Raw match codes are returned only at match preparation and
persist only as hashes.

## Requirement traceability

| Requirement | Implementation | Automated evidence | Result |
| --- | --- | --- | --- |
| Complete bounded eligibility roster; no paginated-bye source | `bracket-draw-setup.service.ts`, `bracket-preview.service.ts` | `bracket-draw-setup.service.spec.ts`, `bracket.e2e.spec.ts` | Pass |
| 2–64 draw formulae, random and designated byes, no double bye | `bracket-summary.ts`, `single-elimination-bracket.generator.ts` | `bracket-summary.spec.ts`, `single-elimination-bracket.generator.spec.ts` | Pass |
| Preview/redraw/cancel are non-persistent; confirm validates stale/tampered token | preview, setup-token, confirmation services | token/service specs; `bracket.e2e.spec.ts` | Pass |
| Current/completed lifecycle and cancelled roster unlock | confirmation/cancellation services; `athlete.service.ts` | `bracket.e2e.spec.ts` | Pass |
| Fixture preparation, progression, tie decision, reset and undo safety | `admin-management.service.ts`, `bracket-outcome.service.ts`, `match-lifecycle.service.ts` | outcome specs and bracket E2E | Pass |
| Connector projection and 64-athlete topology | `bracket-graph.ts`, `bracket-chart.tsx` | `bracket-graph.test.ts` (3, 5, 29, 31, 32, 64) | Pass |
| Sensitive response/cache/log handling | controllers and `app.module.ts` | bracket E2E asserts `no-store`; source review | Pass |

## Test evidence

- API bracket suite: 9 suites / 81 tests passed.
- Web bracket suite: 20 files / 78 tests passed.
- Migration status: schema up to date, 33 migrations applied.
- Full pipeline is pending rerun after the native Prisma engine lock that
  blocked generated-client replacement during frozen install.

## Screenshots and known limitations

Attach desktop and mobile chart screenshots/video from the final authenticated
smoke test before merging. The supported maximum is 64 athletes (63 fixture
cards and at most 62 connectors). Full clean-database upgrade and visual smoke
evidence are still required for release acceptance.
