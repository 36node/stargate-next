# Load test 工作流

独立于 PR CI 的 k6 压测流水线，避免把功能门禁拖慢或因性能抖动误伤 PR。

## 触发

仅手动 `workflow_dispatch`，可选 profile：`smoke` / `ci` / `ramp`。

## Profiles

| Profile | 用途 | 大致规模 |
| --- | --- | --- |
| `smoke` | 冒烟 | 2 VU / 30s / 5 users |
| `ci` | 流水线常态 | 爬到 100 VU / ~5m / 120 users |
| `ramp` | 本地同级加压 | 爬到 800 VU / ~10m / 1000 users |

## 产物

每次运行会：

1. 在 Actions run 页面的 **Summary** 展示关键指标表格（VUs、p95、checks、thresholds）
2. 上传 `apps/stargate-next/load-test/results/` 下的 JSON / HTML / Markdown 为 artifact（保留 14 天）
