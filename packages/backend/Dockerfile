FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/backend/package.json ./packages/backend/
COPY database/package.json ./database/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm install && pnpm --filter @dsa/shared build && pnpm --filter @dsa/integrations build && pnpm --filter @dsa/backend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/packages/backend/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/database ./database
EXPOSE 3000
CMD ["node", "dist/server.js"]
