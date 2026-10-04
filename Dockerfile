FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/gnva exec prisma generate
RUN pnpm --filter @workspace/gnva run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/artifacts/gnva/.next/standalone ./
COPY --from=builder --chown=node:node /app/artifacts/gnva/.next/static ./artifacts/gnva/.next/static
COPY --from=builder --chown=node:node /app/artifacts/gnva/public ./artifacts/gnva/public
RUN mkdir -p /app/artifacts/gnva/public/uploads/assujettis && chown -R node:node /app/artifacts/gnva/public/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","artifacts/gnva/server.js"]