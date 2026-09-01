# ADR 0005: Store score history as immutable events

- Status: Accepted
- Date: 2026-08-28

## Context

An aggregate score alone cannot explain which referees voted, which window produced a point, or why a penalty changed the result. Competition disputes require reconstruction and attribution.

## Decision

Persist one `ScoreEvent` for each referee point, penalty, or explicit administrative adjustment. Link referee points to scoring windows and penalties to penalty records. The official score is conceptually the per-athlete sum of event values.

Optional cached aggregates are updated in the same transaction and reconciled against history.

## Consequences

- Every score change has actor/time/cause evidence and audit metadata.
- Duplicate retries are blocked by unique source-event references.
- Read performance may use cached scores without sacrificing an authoritative ledger.
- Corrections are new audited adjustment events; historical events are not silently rewritten.

