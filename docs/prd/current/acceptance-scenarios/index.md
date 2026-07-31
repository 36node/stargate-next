# 关键场景与验收

本目录定义跨服务、用户可见且不能仅由[产品与领域模型](../product-domain-model/)完整表达的当前验收场景。

## 编写约定

- 使用 Given / When / Then 描述前置条件、用户或系统行为与可观察结果。
- 每个场景链接到相关产品模型或领域概念，以及对应的 OpenAPI 操作和黑盒或端到端测试。
- 不重复维护领域不变量、状态模型或通用流程；这些内容仍由产品与领域模型定义。

## 场景示例

### 禁用账户后阻止继续认证

此场景源自 [202607-03 会话与认证](../../features/202607-03-auth-session.md) 的历史记录，并在本目录维护其当前版本。

**关联规范**

- [产品模型：管理账户](../product-domain-model/product-model.md)
- [领域概念：关键业务不变量](../product-domain-model/domain-concepts.md)

**Given**

- 一个状态为 `active` 的 Account 已完成登录并拥有可用 Session。
- 该 Account 已持有尚未过期的 Access Token 与 Refresh Key。

**When**

- 业务管理员将该 Account 设置为 `disabled`。

**Then**

- Stargate Next 撤销该 Account 的全部 Session。
- 使用原 Refresh Key 刷新 Access Token 失败。
- 使用该 Account 的密码再次登录失败，且不暴露账户状态或存在性。
- 已签发的 Access Token 不做逐请求 Session 校验，只能使用至自身过期；业务应用不得将其视为仍可刷新会话的依据。

**验证**

- 黑盒测试：禁用账户后调用 Refresh 返回认证失败。
- 黑盒测试：禁用账户后使用正确密码登录仍返回认证失败。
- 端到端测试：`playground` 在刷新失败后清除本地会话并回到登录页。
