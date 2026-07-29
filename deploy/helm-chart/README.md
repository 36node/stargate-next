# Stargate Next Helm Chart

部署 Stargate Next API 与 Playground。Chart 不会创建 PostgreSQL 或 Redis，也不会执行数据库 migration。

## 前置条件

- 已提供可访问的 PostgreSQL 与 Redis。
- 在安装或升级前，由发布流程使用目标 `DATABASE_URL` 执行 `pnpm db:migrate`。
- 已生成并安全保存 Stargate API Key、JWT、Captcha HMAC 与 Refresh HMAC 密钥。

## 安装

创建仅包含已声明配置项的 values 文件：

```yaml
stargateNext:
  secrets:
    databaseUrl: postgresql://user:password@postgres.example/stargate?schema=public
    redisUrl: redis://redis.example:6379
    stargateApiKey: replace-with-a-random-api-key
    stargateJwtSecret: replace-with-a-random-jwt-secret
    captchaHmacSecret: replace-with-a-random-captcha-secret
    refreshKeyHmacPrimaryKeyId: primary-2026
    refreshKeyHmacPrimarySecret: replace-with-a-random-refresh-secret
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

- 密钥和连接：`DATABASE_URL`、`REDIS_URL`、`STARGATE_API_KEY`、`STARGATE_JWT_SECRET`、`CAPTCHA_HMAC_SECRET`、Refresh HMAC primary/secondary key。
- 运行参数：日志级别、Redis key 前缀、access/refresh token TTL、Captcha 限制、登录限制，以及仅限非生产环境的 Captcha 测试代码。

`stargateNext.config.nodeEnv` 默认为 `production`。只有显式设置为非生产环境时，才可将 `captchaTestMode` 设为 `true`。

Playground 自动复用 Stargate Next 的 API Key 与 JWT Secret，并默认通过集群内 Stargate Next Service 访问后端。可用 `playground.config.stargateEndpoint` 覆盖该内部地址；设置 `playground.config.stargateJwtPublicKey` 时，Playground 优先使用 RS256 公钥验证 JWT。

## 网络与健康检查

- Stargate Next Service：`9527`，存活检查 `/health/live`，就绪检查 `/health/ready`（检查 PostgreSQL 与 Redis）。
- Playground Service：`3000`，存活和就绪检查均为 `/health`。
- `ingress.enabled` 控制统一 Ingress；分别使用 `ingress.stargateNext.enabled` 和 `ingress.playground.enabled` 公开两个服务。TLS 只在 `ingress.tls.enabled: true` 时渲染，且必须配置 `ingress.tls.secretName`。
