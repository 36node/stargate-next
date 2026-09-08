# 发布工作流

Release Please 会独立管理 `apps/stargate-next`、`apps/playground` 和 `packages/db` 的版本。每次发布会构建并推送：

- `harbor.36node.com/stargate/stargate-next:<version>` 与 `:latest`
- `harbor.36node.com/stargate/playground:<version>` 与 `:latest`
- `harbor.36node.com/stargate/db:<version>` 与 `:latest`

发布 job 使用 GitHub 托管的 `ubuntu-latest`、Node.js `24.20.0` 与 pnpm `11.24.0`。Repository Variable `IMAGE_REGISTRY_PROVIDER` 当前仅支持 `harbor`（未设置时默认使用 Harbor），镜像构建使用公开官方基础镜像。
