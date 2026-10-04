FROM node:20-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @martial-arts-scoring/shared-types run build \
  && pnpm --filter @martial-arts-scoring/web run build

FROM nginx:1.27-alpine

COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
# Public files can inherit restrictive checkout/build modes. Nginx workers
# need readable files and searchable directories regardless of the build umask.
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} + \
  && find /usr/share/nginx/html -type f -exec chmod 644 {} +
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
