# CI 工作流

CI 工作流会先验证 workspace；仅测试通过后才构建并推送 Docker 镜像到 Harbor。主分支推送和手动触发还会构建并推送 Helm Chart，不执行部署。

| 应用 | Harbor 镜像 |
| --- | --- | --- |
| Stargate Next | `harbor.36node.com/stargate/stargate-next` |
| Playground | `harbor.36node.com/stargate/playground` |

常规 CI 使用分支、PR 和输入指纹标签；Release 工作流在发布版本后推送版本号与 `latest` 标签。

最终通知会等待 `test-and-build` 与 `build-helm-chart` 完成，并分别列出两个 job 的结果与总体状态。
