# 发布工作流

Release Please 会独立管理 `apps/stargate-next` 和 `apps/playground` 的版本。每次发布会构建并推送：

- `harbor.36node.com/stargate/stargate-next:<version>` 与 `:latest`
- `harbor.36node.com/stargate/playground:<version>` 与 `:latest`
