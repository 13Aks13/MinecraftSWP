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
COPY apps/web-app/package.json apps/web-app/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web-app apps/web-app
RUN pnpm --filter @mc/shared build && pnpm --filter @mc/web-api build

FROM nginx:1.29-alpine AS runner
COPY apps/web-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
