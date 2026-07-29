# ===========================================
# Database Toolkit Dockerfile
# 仅用于执行 prisma migrate deploy（如 CI/K8s Job）
# 运行依赖由 CI 预先整理到 .docker/db，构建需在仓库根目录执行。
# ===========================================

FROM harbor.36node.com/common/node:22-alpine3.23 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

COPY .docker/db ./

# 默认启动 Prisma Studio（经 Basic Auth 反向代理）
EXPOSE 5555

CMD ["node", "dist/studio-proxy.mjs"]
