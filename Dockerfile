# Stage 1: Install all dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy workspace config and package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy config files needed by dev and build stages
COPY tsconfig.base.json ./
COPY packages/server/tsconfig.json packages/server/drizzle.config.ts ./packages/server/
COPY packages/web/tsconfig.json packages/web/vite.config.ts packages/web/index.html ./packages/web/

# Stage 2: Build frontend (inherits deps + configs)
FROM deps AS build-web
COPY packages/web/src ./packages/web/src
RUN pnpm --filter web build

# Stage 3: Build server (inherits deps + configs)
FROM deps AS build-server
COPY packages/server/src ./packages/server/src
RUN pnpm --filter server build

# Stage 4: Production dependencies
FROM node:22-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Stage 5: Production runtime
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy package.json files
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Copy built server code
COPY --from=build-server /app/packages/server/dist ./packages/server/dist

# Copy built frontend
COPY --from=build-web /app/packages/web/dist ./packages/web/dist

EXPOSE 3000

CMD ["pnpm", "--filter", "server", "start"]
