# ===========================================
# Database Toolkit Dockerfile
# 仅用于执行 prisma migrate deploy（如 CI/K8s Job）
# 基于 packages/prisma-tools 基础镜像，构建需在仓库根目录执行。
# ===========================================

FROM harbor.36node.com/36node/prisma-tools:latest AS runner

WORKDIR /app

COPY packages/db/prisma ./prisma
COPY packages/db/prisma.config.ts ./prisma.config.ts
COPY packages/db/package.json ./package.json
COPY packages/db/studio-proxy.ts ./studio-proxy.ts

EXPOSE 5555

# 勿对 monorepo 的 package.json 执行 npm install（含 workspace:* 协议）。
# 构建阶段预拉取 tsx，运行时不再解析 workspace 依赖。
RUN npx --yes tsx@4.19.0 --version

# 默认启动 Prisma Studio（经 Basic Auth 反向代理，见 studio-proxy.ts）
CMD ["npx", "tsx@4.19.0", "studio-proxy.ts"]
