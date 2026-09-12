FROM node:20-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @martial-arts-scoring/shared-types run build \
  && pnpm --filter @martial-arts-scoring/api run build

FROM node:20-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable && apk add --no-cache su-exec

COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/packages/shared-types ./packages/shared-types
RUN mkdir -p /workspace/apps/api/public/uploads && chown -R node:node /workspace/apps/api/public

EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /workspace/apps/api/public/uploads && chown -R node:node /workspace/apps/api/public/uploads && pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy && exec su-exec node node apps/api/dist/main.js"]
