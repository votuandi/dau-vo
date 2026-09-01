# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN --mount=type=cache,id=dau-vo-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json ./
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @dau-vo/api prisma:generate
RUN pnpm --filter @dau-vo/shared-types build \
    && pnpm --filter @dau-vo/api build
RUN pnpm --filter @dau-vo/api deploy --prod /opt/dau-vo-api

# The migration target intentionally retains the Prisma CLI. It runs once per
# release and is never used as an API replica.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@dau-vo/api", "prisma:deploy"]

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /opt/dau-vo-api/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

