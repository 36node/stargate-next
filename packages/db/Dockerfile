FROM node:24-alpine3.23 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH

RUN apk add --no-cache openssl

COPY packages/db/docker-runtime/package.json packages/db/docker-runtime/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node packages/db/prisma ./prisma
COPY --chown=node:node packages/db/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node packages/db/studio-proxy.ts ./studio-proxy.ts

USER node

EXPOSE 5555

CMD ["tsx", "studio-proxy.ts"]
