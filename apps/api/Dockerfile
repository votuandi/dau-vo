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
RUN corepack enable

COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/packages/shared-types ./packages/shared-types

EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy && node apps/api/dist/main.js"]
