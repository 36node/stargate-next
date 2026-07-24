FROM harbor.36node.com/common/node:22-alpine3.23 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY apps/stargate-next/dist ./dist
COPY apps/stargate-next/node_modules ./apps/stargate-next/node_modules
COPY node_modules ./node_modules
COPY packages/db ./packages/db
COPY packages/redis ./packages/redis

RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
