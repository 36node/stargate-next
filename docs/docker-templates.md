# Docker 模板约定

仓库中的 Node 应用按 Nest、Next standalone 和 DB toolkit 三类维护 Dockerfile。权威模板就是 CI 与 Docker Bake 实际构建的文件，不额外维护只供参考的模板副本。

## 适用范围与权威来源

| 类型            | 权威模板                         | Bake target     | context               |
| --------------- | -------------------------------- | --------------- | --------------------- |
| Nest            | `apps/stargate-next/Dockerfile`  | `stargate-next` | `apps/stargate-next`  |
| Next standalone | `apps/playground/Dockerfile`     | `playground`    | `apps/playground`     |
| DB toolkit      | `packages/db/Dockerfile`         | `db`            | `.`（仓库根）         |

## 固定契约

### Nest (`stargate-next`)

- GitHub Actions runner 先安装依赖，再构建 workspace 包与 Nest `dist`。
- runner 使用 `pnpm deploy --legacy --prod --os=linux --cpu=x64 --libc=musl` 生成 app-local `deploy`；Dockerfile 不安装依赖、不执行构建。
- 孤立 production install 使用 `--config.ignore-scripts=true`，避免 `@repo/db` postinstall 因缺少 Prisma CLI 失败。
- Dockerfile 只复制 `deploy/package.json`、`deploy/node_modules` 和 `dist`。
- 生产镜像以 UID 1001 的 `nestjs` 用户运行，入口为 `node dist/src/main.js`。
- runner 需将 `.prisma` 生成物复制进 deploy 虚拟 store。

### Next standalone (`playground`)

- CI 先以 `BUILD_STANDALONE=true` 生成 `.next/standalone` 和 `.next/static`。
- Dockerfile 只装配 runner，不在镜像内安装依赖或执行 `next build`。
- 使用 app-local context，并将 standalone、static、public 复制到对应应用路径。
- 容器使用 UID 1001 的 `nextjs` 用户和 GID 1001 的 `nodejs` 组运行。
- 启动命令为 `CMD ["node", "apps/playground/server.js"]`。

### DB toolkit

- 不属于 Nest / Next 的 runner-deploy 模板。使用 `harbor.36node.com/36node/prisma-tools:latest` 提供 Prisma CLI。
- Bake context 为仓库根；Dockerfile 只复制 `packages/db` 的 prisma schema、`prisma.config.ts`、`package.json` 和 `studio-proxy.ts`。
- 不在镜像内对 monorepo `package.json` 执行 install（含 `workspace:*`）。构建阶段预拉取 `tsx`，默认入口为 `npx tsx@4.19.0 studio-proxy.ts`。
- Helm migration Job 使用 `npx prisma migrate deploy`（Prisma CLI 在 toolkit 镜像中，不依赖 `sh` 或本地 `node_modules/.bin`）。

Nest / Next 产物准备入口：

```sh
bash scripts/prepare-docker-context.sh <stargate-next|playground> pnpm
```

## 统一基础镜像

Nest 与 Next 应用统一使用：

```text
harbor.36node.com/common/node:24-alpine3.23
```

DB toolkit 使用已登记变体 `prisma-tools`。

## 已登记变体

| 变体              | 位置                            | 原因                                               |
| ----------------- | ------------------------------- | -------------------------------------------------- |
| Nest HEALTHCHECK  | `apps/stargate-next/Dockerfile` | 生产 readiness 探针 `/health/ready`                |
| Nest Prisma copy  | `scripts/prepare-docker-context.sh` | deploy 后补全 `.prisma` 客户端生成物           |
| DB prisma-tools   | `packages/db/Dockerfile`        | Prisma CLI 来自 toolkit 基础镜像，不走 pnpm deploy |

## 新增同类应用

1. 复制对应类型的权威模板，只替换应用名称、路径和 pnpm filter。
2. 在 `docker-bake.hcl` 增加对应 context 的 target。
3. 在 `scripts/docker-image-fingerprint.sh` 增加 target 专属 COPY 输入数组；数组顺序和内容必须与 Dockerfile 的外部 `COPY` source 完全一致。
4. 将应用加入 CI，并加入 `scripts/stargate-ci-local.sh` 的 Docker 应用列表。
5. 增加对应的 Helm 模板，核对镜像默认入口与 `command`、`args` 的组合语义。

为使 COPY 清单可以被 fail-closed 校验，应用 Dockerfile 使用单行 shell-form `COPY`；不使用 JSON-form 或反斜杠续行。

## Review checklist

- 同类 Dockerfile 是否只保留允许差异和已登记变体；
- Nest / Next 的基础镜像 tag 是否仍然统一；
- Nest / Next 的 install、build 和 `pnpm deploy` 是否都在 runner 上完成；
- DB toolkit 是否仍使用 `prisma-tools`，且未把 monorepo install 放进镜像；
- 每个 target 的 fingerprint COPY 输入数组是否与 Dockerfile 完全一致；
- Helm 的 `command`、`args` 与镜像 `ENTRYPOINT`、`CMD` 组合语义是否仍然成立。

## 权威验证入口

```sh
bash scripts/prepare-docker-context.sh <stargate-next|playground> pnpm
docker buildx bake <target>
bash scripts/stargate-ci-local.sh <target>
```

检查 Bake 配置：

```sh
docker buildx bake --file docker-bake.hcl --print <target>
```

计算镜像输入指纹：

```sh
FINGERPRINT_TARGET=<target> bash scripts/docker-image-fingerprint.sh
```

只检查所有 target 的维护清单是否仍与 Dockerfile `COPY` 一致，不访问 registry：

```sh
FINGERPRINT_VERIFY_COPY_INPUTS_ONLY=1 FINGERPRINT_TARGET=all \
  bash scripts/docker-image-fingerprint.sh
```

CI 的镜像构建与复用行为见 [`.github/workflows/ci.md`](../.github/workflows/ci.md)。
