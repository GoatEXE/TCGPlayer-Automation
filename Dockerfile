# Stage 0: Generate a local-only self-signed certificate for optional HTTPS
FROM node:22-alpine AS tls-certs
ARG LOCAL_HTTPS_CERT_SANS="DNS:localhost,IP:127.0.0.1,IP:::1"
WORKDIR /app
RUN apk add --no-cache openssl \
  && mkdir -p /app/certs \
  && openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 825 \
    -keyout /app/certs/local-key.pem \
    -out /app/certs/local-cert.pem \
    -subj "/CN=tcgplayer-local" \
    -addext "subjectAltName=${LOCAL_HTTPS_CERT_SANS}" \
  && chmod 600 /app/certs/local-key.pem \
  && chmod 644 /app/certs/local-cert.pem

# Stage 1: Install all dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache imagemagick tesseract-ocr tesseract-ocr-data-eng \
  && corepack enable && corepack prepare pnpm@10 --activate
ENV TESSERACT_BIN=/usr/bin/tesseract
WORKDIR /app
COPY --from=tls-certs /app/certs ./certs

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
RUN apk add --no-cache imagemagick tesseract-ocr tesseract-ocr-data-eng \
  && corepack enable && corepack prepare pnpm@10 --activate
ENV TESSERACT_BIN=/usr/bin/tesseract
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./
COPY --from=tls-certs /app/certs ./certs

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=prod-deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy package.json files
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Copy built server code + migrations
COPY --from=build-server /app/packages/server/dist ./packages/server/dist
COPY packages/server/drizzle ./packages/server/drizzle

# Copy built frontend
COPY --from=build-web /app/packages/web/dist ./packages/web/dist

EXPOSE 3000

CMD ["pnpm", "--filter", "server", "start"]
