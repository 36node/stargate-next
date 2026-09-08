# CI 工作流

CI 工作流会先验证 workspace 格式与边界，再运行测试与构建。所有 PR 都会使用公开基础镜像构建并 smoke Docker 镜像；只有 main 与非 Dependabot 的同仓 PR 会向 Harbor 推送镜像和 Helm Chart，并触发部署。

| 应用 | Harbor 镜像 |
| --- | --- |
| Stargate Next | `harbor.36node.com/stargate/stargate-next` |
| Playground | `harbor.36node.com/stargate/playground` |
| DB | `harbor.36node.com/stargate/db` |

## Job 概览

| Job | 职责 |
| --- | --- |
| `check` | `pnpm check`（Biome/Ultracite）、registry provider 测试、legacy `apps/stargate` workspace 隔离守卫、Docker COPY 清单一致性校验 |
| `test-and-build` | 数据库迁移、测试、黑盒测试、构建、Docker runtime 产物准备、镜像构建与 Alpine smoke |
| `build-helm-chart` | 打包并推送 Helm Chart（依赖 `check` 成功） |
| `deploy` | 部署到 PR 或 UAT 环境（依赖 `check`、`test-and-build`、`build-helm-chart` 均成功） |

`check` 与 `test-and-build` 并行运行；格式或 workspace 边界检查失败时，`deploy` 不会执行。

所有 job 使用 GitHub 托管的 `ubuntu-latest`。Node 相关 job 通过 `pnpm/action-setup` 安装 pnpm `11.24.0`，再通过 `actions/setup-node` 安装 Node.js `24.20.0` 并启用 pnpm cache。

Repository Variable `IMAGE_REGISTRY_PROVIDER` 当前只接受 `harbor`，未设置时默认也是 `harbor`。`scripts/resolve-image-registry.sh` 为 CI 与 Release 统一提供 registry、project、镜像与 Chart 地址；其他值会 fail closed。

## legacy `apps/stargate`

`apps/stargate` 是独立旧 Auth 参考服务，**不在 pnpm workspace 内**（见 `pnpm-workspace.yaml` 的 `!apps/stargate`）。CI 的 `check` Job 会校验其未出现在 workspace 包列表与根 `pnpm-lock.yaml` 中。本地启动 legacy 服务使用 `pnpm dev:stargate`。

## Docker 构建

runner 在 `pnpm build:ci` 之后调用 `scripts/prepare-docker-context.sh`，为 Nest 和 Next standalone 生成 app-local runtime artifacts。Docker Bake 对这两个 target 使用 app-local context，Dockerfile 只复制产物。DB toolkit 使用官方 Node Alpine、独立 runtime lock 和仓库根 context，不经过 `pnpm deploy`。

`scripts/docker-image-fingerprint.sh` 使用 v2 指纹：每个 target 维护与 Dockerfile 外部 `COPY` source 顺序一致的清单，并纳入 Dockerfile 内容与基础镜像 manifest。Harbor 中以 `input-<sha>` 标签复用未变更镜像。

镜像构建或复用后，CI 会执行 `scripts/verify-docker-runtime.sh` smoke。fork PR 与 Dependabot 只构建本地镜像；Harbor 登录、推送、Chart 发布与 Cyclops 部署会被跳过。同仓 PR 保留自动 Preview。模板约定见 [docs/docker-templates.md](../docs/docker-templates.md)。

## 本地 CI

```bash
bash scripts/stargate-ci-local.sh
bash scripts/stargate-ci-local.sh stargate-next
bash scripts/stargate-ci-local.sh --skip-migration-tests
```

脚本覆盖 `pnpm check`、`pnpm typecheck`、`pnpm test`、`@repo/db test:migration`，并在通过后对本机 Docker 执行 `prepare-docker-context.sh`、Bake、Alpine smoke 与临时镜像清理。需要 Docker 与 Buildx，不执行部署或 Harbor 推送。

常规 CI 使用分支、PR 和输入指纹标签；Release 工作流在发布版本后推送版本号与 `latest` 标签。

最终通知会等待 `test-and-build` 与 `build-helm-chart` 完成，并分别列出两个 job 的结果与总体状态。
