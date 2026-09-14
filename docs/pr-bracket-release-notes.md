# Bracket PR description

## Migration impact and rollback

This branch adds the bracket aggregate tables, fixture/slot membership checks,
the nullable unique `matches.bracket_fixture_id` link, and supporting indexes.
Migrations are additive. On 2026-09-14, a disposable empty PostgreSQL database
applied all 39 checked-in migrations and `prisma migrate status` reported an
up-to-date schema. Rollback is operational: disable bracket entry points; do
not delete confirmed brackets, linked matches, credential hashes, or audit
history.

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

| Requirement                                     | Current evidence                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bracket behavior and lifecycle compatibility    | Coverage remains in the named unit and PostgreSQL integration suites; rerun the complete API suite before release. |
| Connector projection (including 29/31 athletes) | Coverage remains in `bracket-graph.test.ts`; rerun the complete web suite before release.                          |
| Sensitive response/cache/log handling           | Coverage remains in the API E2E suite; no release assertion is made here pending the final run.                    |

## Test evidence

- 2026-09-14: empty-database deployment passed: 39 migrations applied and
  `prisma migrate status` reported the schema up to date.
- 2026-09-14: legacy-admin and sport-catalog pre-feature PostgreSQL upgrade
  verifiers passed.
- 2026-09-14: `pnpm format:check` and `pnpm lint` passed. `pnpm typecheck`
  passed with engine-free Prisma generation because an existing local process
  held the native Prisma DLL open.
- Final native-client build and PostgreSQL/Redis E2E evidence remains required;
  do not treat this document as merge approval until those gates pass.

## Screenshots and known limitations

Attach desktop and mobile chart screenshots/video from the final authenticated
smoke test before merging. The supported maximum is 64 athletes (63 fixture
cards and at most 62 connectors). Full clean-database upgrade and visual smoke
evidence are still required for release acceptance.
