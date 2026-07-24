# 发布工作流

Release Please 会独立管理 `apps/stargate-next` 和 `apps/playground` 的版本。每次发布会构建并推送：

- `harbor.36node.com/36node/stargate-next:<version>` 与 `:latest`
- `harbor.36node.com/36node/stargate-next-playground:<version>` 与 `:latest`
