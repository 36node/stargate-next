# Stargate Next

Stargate Next 是一个基于 pnpm 与 Turborepo 的 Monorepo，用于承载下一代认证服务及其 Playground。

## 应用

- `apps/stargate`：保留为可本地运行的旧 Auth 参考服务，不属于 pnpm workspace 或 CI。
- `apps/stargate-next`：NestJS 服务，也是 PostgreSQL 与 Redis 的唯一消费者。
- `apps/playground`：通过旧 Stargate 进行认证的 Next.js 管理后台壳。

## 包

- `packages/stargate-next-sdk`：由 `apps/stargate-next/openapi.json` 生成的 Stargate Next API 绑定。
- `packages/db`：Stargate Next 认证域的 Prisma Client 与 migration。
- `packages/next-stargate`：旧 Stargate 的 Next.js 会话、JWT 验证和 Cookie 集成。

## 前置条件

需要 Node.js 22.12+、pnpm 10 与 Docker。旧 Stargate 依赖与 Node 26 不兼容，请使用 Node 22：

```bash
nvm use 22
pnpm install
docker compose up -d
```

根目录的 `docker-compose.yaml` 会启动：

- PostgreSQL：供 Stargate Next 使用，端口 `5432`
- Redis：供新旧 Stargate 使用，端口 `6379`
- MongoDB：供旧 Stargate 使用，端口 `27017`

## 启动 Stargate Next

先初始化 PostgreSQL schema，再启动新服务。默认监听 `9527`：

```bash
pnpm db:migrate
pnpm --filter stargate-next dev
```

复制 `apps/stargate-next/env.example` 到根 `.env` 后填入独立密钥。除数据库与 Redis 地址外，Admin/Service API Key、JWT、Captcha HMAC、Refresh HMAC primary 和 Tenant API Key HMAC primary 均为必填且所有 secret 必须两两不同；secondary key 用于无停机轮换，必须同时提供 ID 和 secret。`STARGATE_DEPLOY_TIER` 与 `NODE_ENV` 独立，只有非 production tier 才允许 Captcha 测试模式。

```dotenv
DATABASE_URL=postgresql://postgres:123456@localhost:5432/stargate-next-local?schema=public
REDIS_URL=redis://localhost:6379
PORT=9527
```

`/health/live` 只检查进程存活；`/health/ready` 会检查 PostgreSQL 与 Redis。

Account 与 Session 管理接口要求 `x-api-key`；Captcha、login、refresh 与 logout 不要求服务 API Key。`apps/stargate-next/openapi.json` 是公开 API 的契约来源，`packages/stargate-next-sdk` 仅导出从该契约生成的 client。

## 初始化 Stargate Next 账户

执行迁移后运行：

```bash
pnpm seed
```

该命令会幂等地创建或恢复 `stargate` 账户，默认密码为 `stargate@36node`。

## 黑盒验收

迁移必须在黑盒测试前由开发者或 CI 单独执行。测试不会创建 schema 或调用 migration：

```bash
DATABASE_URL=postgresql://postgres:123456@localhost:5432/stargate-next-blackbox pnpm db:migrate
PORT=9530 STARGATE_ENDPOINT=http://127.0.0.1:9530 \
STARGATE_ADMIN_API_KEY=local-admin-api-key STARGATE_API_KEY=local-service-api-key \
STARGATE_JWT_SECRET=local-jwt-secret CAPTCHA_HMAC_SECRET=local-captcha-hmac-secret \
REFRESH_KEY_HMAC_PRIMARY_KEY_ID=primary-2026 \
REFRESH_KEY_HMAC_PRIMARY_SECRET=local-refresh-primary-secret \
TENANT_API_KEY_HMAC_PRIMARY_KEY_ID=tenant-primary-2026 \
TENANT_API_KEY_HMAC_PRIMARY_SECRET=local-tenant-key-primary-secret \
STARGATE_DEPLOY_TIER=development \
CAPTCHA_TEST_MODE=true CAPTCHA_TEST_CODE=ABCD \
REDIS_KEY_PREFIX=stargate-next:blackbox: \
pnpm --filter stargate-next dev

STARGATE_ENDPOINT=http://127.0.0.1:9530 \
STARGATE_API_KEY=local-service-api-key \
pnpm --filter stargate-next test:api
```

使用相同环境变量执行 `pnpm --filter stargate-next test:sdk` 验证生成 SDK。`seed:legacy-fixture` 仅应在 migration 后、测试服务启动前执行。

### 代理浏览器验收授权

对本仓库的本地、PR Preview 与 UAT 环境执行代理辅助的浏览器验收时，默认授权代理识别并填写页面提供的 CAPTCHA，并使用仓库约定的测试账号完成登录、退出及只读功能验证，无需重复询问。该授权不适用于生产环境，不授权绕过 CAPTCHA 或浏览器安全拦截，也不授权修改真实用户数据；如果执行平台的安全策略要求逐次确认，以平台策略为准。

## 启动旧 Stargate

旧服务位于 `apps/stargate`，有独立的 lockfile 和依赖。默认监听 `9527`，与 Stargate Next 保持兼容；两者不能同时使用默认端口：

```bash
pnpm dev:stargate
```

该命令要求已通过前置步骤启动 Redis 与 MongoDB；它会在必要时为 `apps/stargate` 安装独立依赖，然后使用以下默认环境变量启动旧服务：

```dotenv
MONGO_URL=mongodb://localhost:27017/auth-dev
REDIS_URL=redis://localhost:6379
API_KEY=playground-dev-api-key
JWT_SECRET_KEY=playground-dev-jwt-secret
PORT=9527
```

可以在命令前覆盖这些变量，例如 `PORT=9528 pnpm dev:stargate`。

脚本安装依赖时会使用 `--ignore-workspace`：`apps/stargate` 被根 workspace 排除，如果不带该参数，pnpm 仍会向上识别根 `pnpm-workspace.yaml`，导致依赖没有安装到旧服务自己的 `node_modules`，从而出现 `nest: command not found`。

生产环境必须为 `API_KEY` 与 `JWT_SECRET_KEY` 使用独立的随机密钥，不能使用上述示例值。

## 启动 Playground 并对接旧 Stargate

Playground 默认监听 `3000`。其环境变量必须与旧 Stargate 的 API Key、JWT 签名配置完全匹配：

```bash
STARGATE_ENDPOINT=http://localhost:9527 \
STARGATE_API_KEY=playground-dev-api-key \
STARGATE_JWT_SECRET=playground-dev-jwt-secret \
pnpm --filter playground dev
```

配置映射如下：

| 旧 Stargate | Playground | 要求 |
| --- | --- | --- |
| `API_KEY` | `STARGATE_API_KEY` | 值必须相同；Playground 用它请求旧服务的 `/auth/@login`。 |
| `JWT_SECRET_KEY` | `STARGATE_JWT_SECRET` | 使用 HS256 时值必须相同，用于验证登录后返回的 JWT。 |
| 旧服务地址与 `PORT` | `STARGATE_ENDPOINT` | 指向旧 Stargate 的完整地址，例如 `http://localhost:9527`。 |
| `JWT_SECRET_KEY` | `STARGATE_JWT_PUBLIC_KEY` | 仅旧服务改为 RS256 后使用其对应公钥；此时不设置 `STARGATE_JWT_SECRET`。 |

`STARGATE_API_KEY` 仅在 Playground 服务端使用，不会发送到浏览器。Playground 的开发端口由 `apps/playground/package.json` 中的 `next dev -p 3000` 指定。Playground 不需要 PostgreSQL、Redis 或 MongoDB；`/health` 也不会访问任何外部资源。

## 同时开发

在基础设施启动且环境变量已配置后，可使用：

```bash
pnpm dev
```

它会启动 Playground（`3000`）和 Stargate Next（`9527`）。如需同时运行旧 Stargate，请为其中一个服务显式设置不同的 `PORT`。

使用 `pnpm build`、`pnpm typecheck` 和 `pnpm test` 验证 workspace。

架构与迁移计划见
[`docs/rewrite-with-mekong.md`](docs/rewrite-with-mekong.md) 和
[`docs/rewrite.md`](docs/rewrite.md)。
