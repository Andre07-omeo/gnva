# ============ Étape 1 : Build ============
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY artifacts/gnva/package.json ./artifacts/gnva/
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY artifacts/gnva ./artifacts/gnva

WORKDIR /app/artifacts/gnva
RUN pnpm prisma generate
RUN pnpm run build

# ============ Étape 2 : Exécution ============
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat openssl
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/artifacts/gnva/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/gnva/.next/static ./.next/standalone/artifacts/gnva/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/gnva/public ./.next/standalone/artifacts/gnva/public
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/gnva/prisma ./.next/standalone/artifacts/gnva/prisma

RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

CMD ["node", "artifacts/gnva/server.js"]