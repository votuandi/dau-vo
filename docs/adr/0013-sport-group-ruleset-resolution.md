# ADR 0013: Resolve executable rulesets by immutable Sport Group code

## Status

Accepted.

## Context and decision

`SportGroup.code` is a unique, immutable system-data identifier for an
executable application strategy. The API resolves it through
[`SportRulesRegistry`](../../apps/api/src/sport-rules/sport-rules.registry.ts),
whose current supported entry is the immutable code `ONE_ON_ONE_COMBAT`.

We do not store executable rules as arbitrary database JSON. The rules affect
authorization roles, athlete shape, lifecycle, scoring, penalties, Socket.IO
payloads, and scoreboard behavior. Those contracts need typed implementation,
code review, tests, and deploy-time compatibility rather than an unvalidated
runtime document.

The first ruleset is `ONE_ON_ONE_COMBAT` because the implemented wire protocol
is the one-on-one format: RED and BLUE athletes, three referee slots, one
inspector, two rounds, majority threshold two, +1 referee points, and -1
inspector penalties. Its definition is
[`oneOnOneCombatRules`](../../apps/api/src/sport-rules/sport-rules.definition.ts).

Many Sports can reference one Sport Group. Thus `Võ Gậy` and any future Sport
in `Đối kháng 1-1` share exactly the same resolved strategy; adding that Sport
does not duplicate scoring code.

Resolution is fail-closed. An unsupported group code throws
`SPORT_GROUP_RULES_NOT_IMPLEMENTED`; there is no fallback to
`ONE_ON_ONE_COMBAT`. New group system data must therefore not be deployed ahead
of its registry implementation.

## Consequences and current boundary

This design prevents a catalog edit from changing a used Sport's executable
behavior: used Sports cannot move groups. It also permits safe catalog growth
inside an already supported group.

The strategy boundary is not yet a general rules engine. The current REST and
Socket.IO wire protocol remains specifically shaped around the one-on-one
participants, roles, two-round lifecycle, scoring-window voting, penalties, and
scoreboard state. A future group may require protocol/versioning work in addition
to a registry entry; it must not claim compatibility merely by matching a code.
