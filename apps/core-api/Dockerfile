# syntax=docker/dockerfile:1.7
FROM node:26.12.1-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN npm install --global pnpm@12.15.0
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/core-api/package.json apps/core-api/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/core-api apps/core-api
RUN pnpm --filter @mc/shared build \
 && pnpm --filter @mc/core-api build \
 && pnpm --filter @mc/core-api deploy --prod /out \
 && rm -rf /out/src /out/tsconfig*.json /out/vitest.config*.ts /out/nest-cli.json \
           /out/README.md /out/pnpm-lock.yaml /out/pnpm-workspace.yaml \
           /out/tsconfig.build.tsbuildinfo

FROM node:26.12.1-alpine AS runner
RUN apk add --no-cache gosu
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node apps/core-api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/main.js"]
