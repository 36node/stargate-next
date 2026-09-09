# 发布工作流

Release Please 会独立管理 `apps/stargate-next`、`apps/playground`、`packages/db` 和 `packages/stargate-next-sdk` 的版本。应用与 DB 发布会构建并推送：

- `harbor.36node.com/stargate/stargate-next:<version>` 与 `:latest`
- `harbor.36node.com/stargate/playground:<version>` 与 `:latest`
- `harbor.36node.com/stargate/db:<version>` 与 `:latest`

SDK release 会将公开 ESM 包 `@36node/stargate-next-sdk` 发布到 npmjs。SDK 首个版本为 `1.2.0`，后续版本由 Conventional Commits 和 Release Please 管理。

### PR Alpha 发布

每个目标分支 PR 在创建、重新打开或推送新 commit 时，`SDK Alpha Build` 都会运行，并在类型检查、测试和包校验通过后生成版本，不检测 SDK 或 OpenAPI 文件是否发生变化：

```text
0.0.0-alpha.<PR号>.g<短SHA>
```

无权限的 PR workflow 只上传 npm tarball；默认分支上的 `release.yml` 通过 `workflow_run` 下载并校验产物，只为同仓库、非 Dependabot 的成功 PR 发布。发布阶段不会 checkout 或执行 PR 代码。

所有 PR alpha 共用 `alpha` dist-tag，最后完成发布的 PR 会更新该 tag：

```sh
pnpm add @36node/stargate-next-sdk@alpha
pnpm add @36node/stargate-next-sdk@0.0.0-alpha.58.gabc1234
```

相同 PR commit 的 workflow rerun 会检测已有版本并跳过发布。历史 alpha 版本和 `alpha` tag 不在 PR 关闭时清理。

### npmjs 认证

新包首次 stable 或 alpha 发布前，在 GitHub Repository Secret 中配置临时 `NPM_TOKEN`。Token 必须能够在 `@36node` scope 创建并公开发布包。首次发布成功后：

1. 在 npmjs 的 `@36node/stargate-next-sdk` 包设置中添加 GitHub Actions Trusted Publisher。
2. Repository 填写 `36node/stargate-next`，workflow 文件填写 `release.yml`，environment 留空。
3. 删除 GitHub Repository Secret `NPM_TOKEN`。

此后 workflow 会通过 GitHub OIDC 发布，不再使用长期 npm token。发布 job 保留 `id-token: write` 权限；由于 GitHub 源仓库是 private，包配置显式关闭 npm provenance，避免 npmjs 的 Sigstore 校验返回 `E422`。

发布 job 使用 GitHub 托管的 `ubuntu-latest`、Node.js `24.20.0` 与 pnpm `11.24.0`。Repository Variable `IMAGE_REGISTRY_PROVIDER` 当前仅支持 `harbor`（未设置时默认使用 Harbor），镜像构建使用公开官方基础镜像。
