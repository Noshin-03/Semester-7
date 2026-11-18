# Order Service - A1
# Multi-stage build: compile TypeScript in the builder, ship only production
# dependencies in the runtime image.

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN node node_modules/typescript/bin/tsc -p tsconfig.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies are copied into the final image.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist/src ./dist/src

# Run as an unprivileged user.
USER node

# RESTAURANT_URL is NOT hard-coded: it is supplied by the environment
# (docker-compose sets it to http://restaurant-service:8081 on the shared
# user-defined network).
ENV PORT=8082 \
    ORDER_PORT=8082 \
    HOST=0.0.0.0 \
    LOG_LEVEL=info \
    RESTAURANT_URL=http://restaurant-service:8081 \
    RESTAURANT_TIMEOUT_MS=2000

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8082)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
