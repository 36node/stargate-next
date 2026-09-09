# 发布工作流

Release Please 会独立管理 `apps/stargate-next`、`apps/playground`、`packages/db` 和 `packages/stargate-next-sdk` 的版本。应用与 DB 发布会构建并推送：

- `harbor.36node.com/stargate/stargate-next:<version>` 与 `:latest`
- `harbor.36node.com/stargate/playground:<version>` 与 `:latest`
- `harbor.36node.com/stargate/db:<version>` 与 `:latest`

SDK release 会将公开 ESM 包 `@36node/stargate-next-sdk` 发布到 npmjs。SDK 首个版本为 `1.2.0`，后续版本由 Conventional Commits 和 Release Please 管理。

### npmjs 认证

新包首次发布前，在 GitHub Repository Secret 中配置临时 `NPM_TOKEN`。Token 必须能够在 `@36node` scope 创建并公开发布包。首次发布成功后：

1. 在 npmjs 的 `@36node/stargate-next-sdk` 包设置中添加 GitHub Actions Trusted Publisher。
2. Repository 填写 `36node/stargate-next`，workflow 文件填写 `release.yml`，environment 留空。
3. 删除 GitHub Repository Secret `NPM_TOKEN`。

此后 workflow 会通过 GitHub OIDC 发布，不再使用长期 npm token。发布 job 具有 `id-token: write` 权限，并为 npm 包生成 provenance。

发布 job 使用 GitHub 托管的 `ubuntu-latest`、Node.js `24.20.0` 与 pnpm `11.24.0`。Repository Variable `IMAGE_REGISTRY_PROVIDER` 当前仅支持 `harbor`（未设置时默认使用 Harbor），镜像构建使用公开官方基础镜像。
