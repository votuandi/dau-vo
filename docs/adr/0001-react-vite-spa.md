# ADR 0001: Use React and Vite as a client-side SPA

- Status: Accepted
- Date: 2026-08-28

## Context

The product is an authenticated operational application with REST/Socket.IO state. It has no SEO, SSR, SSG, React Server Component, or server-side frontend routing requirement. Referee latency and predictable static deployment matter more than framework-rendering features.

## Decision

Use React, Vite, TypeScript, and React Router. Build immutable static assets and serve them behind Nginx with `try_files ... /index.html` fallback.

## Consequences

- The frontend can run from the same origin as `/api` and `/socket.io` in cloud or venue deployments.
- There is no Node frontend runtime or hydration boundary.
- Backend authorization remains mandatory; route guards are only user experience.
- Runtime frontend endpoint changes require either same-origin defaults or a new build-time configuration.

