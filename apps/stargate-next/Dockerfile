FROM harbor.36node.com/common/node:24-alpine3.23 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9527

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --chown=nestjs:nodejs deploy/package.json ./package.json
COPY --chown=nestjs:nodejs deploy/node_modules ./node_modules
COPY --chown=nestjs:nodejs dist ./dist

USER nestjs

EXPOSE 9527

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9527/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "dist/main.js"]
