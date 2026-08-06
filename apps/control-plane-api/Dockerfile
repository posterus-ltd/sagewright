# Build stage: compile TypeScript → JS bundles
FROM node:22-bookworm AS builder
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source
COPY . .

# Compile-time UI switch: 'false' builds the web bundle without the
# permanent-delete action (audit-retention deployments). The API enforces the
# same policy at runtime via the ALLOW_SESSION_DELETION env var.
ARG ALLOW_SESSION_DELETION=true
ENV VITE_ALLOW_SESSION_DELETION=$ALLOW_SESSION_DELETION

# Build both apps
# Outputs:
#   apps/control-plane-api/dist/main.js
#   apps/control-plane-api/dist/db/migrate.js
#   dist/control-plane-web/ (index.html, assets/)
RUN npx nx build control-plane-api && npx nx build control-plane-web

# Runtime stage: lean image without build tools
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# git is required at runtime: the control-plane owns the shared repo volume and
# performs all clone/pull/worktree operations on it.
RUN apt-get update && apt-get install -y git ca-certificates && rm -rf /var/lib/apt/lists/*

# Install only production npm deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built artifacts from builder
COPY --from=builder /app/apps/control-plane-api/dist ./apps/control-plane-api/dist
COPY --from=builder /app/dist/control-plane-web ./dist/control-plane-web
# Drizzle migrations must be present at runtime for the migrate runner
COPY --from=builder /app/apps/control-plane-api/drizzle ./apps/control-plane-api/drizzle

EXPOSE 3001

# Run migrations then start the API server
CMD ["sh", "-c", "node apps/control-plane-api/dist/db/migrate.js && node apps/control-plane-api/dist/main.js"]
