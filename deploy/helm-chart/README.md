# Stargate Next Helm Chart

部署 Stargate Next API 与 Playground。Chart 不会创建 PostgreSQL 或 Redis，也不会执行数据库 migration。

## 前置条件

- 已提供可访问的 PostgreSQL 与 Redis。
- 在安装或升级前，由发布流程使用目标 `DATABASE_URL` 执行 `pnpm db:migrate`。
- 已生成并安全保存 Admin/Service API Key、JWT、Captcha HMAC、Refresh HMAC 与 Tenant API Key HMAC 密钥；所有 secret 必须两两不同。

## 安装

创建仅包含已声明配置项的 values 文件：

```yaml
stargateNext:
  secrets:
    databaseUrl: postgresql://user:password@postgres.example/stargate?schema=public
    redisUrl: redis://redis.example:6379
    stargateAdminApiKey: replace-with-a-random-admin-api-key
    stargateApiKey: replace-with-a-random-api-key
    stargateJwtSecret: replace-with-a-random-jwt-secret
    captchaHmacSecret: replace-with-a-random-captcha-secret
    refreshKeyHmacPrimaryKeyId: primary-2026
    refreshKeyHmacPrimarySecret: replace-with-a-random-refresh-secret
    tenantApiKeyHmacPrimaryKeyId: tenant-primary-2026
    tenantApiKeyHmacPrimarySecret: replace-with-a-random-tenant-key-secret
  config:
    redisKeyPrefix: "stargate-next:production:"
ingress:
  enabled: true
  className: nginx
  playground:
    host: playground.example.com
  stargateNext:
    enabled: true
    host: stargate.example.com
  tls:
    enabled: true
    secretName: stargate-example-com-tls
```

安装或升级：

```shell
helm upgrade --install stargate-next deploy/helm-chart --namespace stargate --create-namespace --values values.production.yaml
```

## 配置边界

该 Chart 不接受任意 `env` 或 `secretEnv` map。模板将已声明的普通配置逐项写入 ConfigMap、密钥逐项写入 Secret，再通过 `envFrom` 批量导入容器；只有 [`values.yaml`](values.yaml) 中的固定字段可以配置。

Stargate Next 会接收以下配置：

- 密钥和连接：`DATABASE_URL`、`REDIS_URL`、`STARGATE_ADMIN_API_KEY`、`STARGATE_API_KEY`、`STARGATE_JWT_SECRET`、`CAPTCHA_HMAC_SECRET`、Refresh HMAC 与 Tenant API Key HMAC 的 primary/secondary key。
- 运行参数：日志级别、Redis key 前缀、access/refresh token TTL、Captcha 限制与登录限制。Chart 不提供固定验证码配置，PR、UAT 与生产部署均使用真实验证码。

首次部署本版本前，必须先把 Admin Key 与 Tenant API Key HMAC primary pair 注入目标站点，并确认所有 secret 两两不同；否则 Stargate Next 会按设计启动失败。Tenant API Key 轮换时，先把旧 primary 作为 secondary 配入并部署，再切换 primary，等待已签发 Key 完成迁移后删除 secondary。Admin Key 不会注入 Playground；Playground 只持有只能访问 `default` Tenant 的 Service Key。

Playground 自动复用 Stargate Next 的 API Key 与 JWT Secret，并默认通过集群内 Stargate Next Service 访问后端。可用 `playground.config.stargateEndpoint` 覆盖该内部地址；设置 `playground.config.stargateJwtPublicKey` 时，Playground 优先使用 RS256 公钥验证 JWT。

## CI 所需 GitHub Secrets

Preview/UAT 的部署与 seed 依赖以下仓库 Secret：

- `STARGATE_API_KEY`：必须与 Cyclops 注入 Stargate Next Pod 的 `STARGATE_API_KEY` 同值。
- `STARGATE_ADMIN_API_KEY`：必须与 Cyclops 注入 Stargate Next Pod 的 `STARGATE_ADMIN_API_KEY` 同值。
- seed 使用仓库约定的 Preview 测试账号密码，没有对应的 Pod 环境变量。

CI 必须先验证 Secret 非空再执行部署后操作，日志中不得输出 Secret 值、密码、Token 或完整登录响应。固定验证码只在 CI 启动的隔离黑盒测试进程中通过进程环境变量设置，不进入 Helm Chart 或部署环境。

## 网络与健康检查

- Stargate Next Service：`9527`，存活检查 `/health/live`，就绪检查 `/health/ready`（检查 PostgreSQL 与 Redis）。
- Playground Service：`3000`，存活和就绪检查均为 `/health`。
- `ingress.enabled` 控制统一 Ingress；分别使用 `ingress.stargateNext.enabled` 和 `ingress.playground.enabled` 公开两个服务。TLS 只在 `ingress.tls.enabled: true` 时渲染，且必须配置 `ingress.tls.secretName`。
