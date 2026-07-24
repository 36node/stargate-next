# CI 工作流

CI 工作流会验证 workspace、构建两个镜像，并通过 Cyclops 应用 Webhook 部署。

| 应用 | Harbor 镜像 | 部署覆盖变量 |
| --- | --- | --- |
| Stargate Next | `harbor.36node.com/36node/stargate-next` | `stargate_next_tag` |
| Playground | `harbor.36node.com/36node/stargate-next-playground` | `stargate_next_playground_tag` |

PR 部署使用 `stargate-next-pr-<number>`；`main` 部署到
`stargate-next-uat`。外部 `auth` playbook 必须支持两个服务和相应覆盖变量。

只有 Stargate Next 接收 PostgreSQL 与 Redis 配置。Playground 不需要这两个服务；其运行时部署必须提供 `STARGATE_ENDPOINT`、`STARGATE_API_KEY` 和匹配的 JWT 验证密钥。健康检查端点始终只执行存活探测。
