# Architecture decision records

ADRs capture decisions that materially affect correctness, security, recovery, or deployment. A superseded decision remains in history and links to its replacement.

| ADR | Decision |
| --- | --- |
| [0001](0001-react-vite-spa.md) | React + Vite SPA instead of Next.js |
| [0002](0002-nestjs-authoritative-server.md) | NestJS is authoritative |
| [0003](0003-postgresql-and-redis.md) | PostgreSQL durable truth plus Redis coordination |
| [0004](0004-server-received-time.md) | Server receive/admission time determines scoring |
| [0005](0005-event-based-score-history.md) | Event-based scoring history |
| [0006](0006-browser-timers-are-visual.md) | Browser timers are visual only |
| [0007](0007-single-active-device.md) | One active device per credential |
| [0008](0008-transactional-scoring-idempotency.md) | Database-backed scoring idempotency |
| [0009](0009-socketio-horizontal-scaling.md) | Socket.IO scaling and transport affinity |
| [0010](0010-access-code-handling.md) | Show-once access codes and regeneration |
| [0011](0011-recovery-and-readiness.md) | Fail-closed dependency handling and recovery |

