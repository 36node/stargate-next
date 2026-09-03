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

### 未指定 Tenant 时兼容默认租户

**Given**

- 数据库已由 migration/seed 建立 active 的 `default` Tenant。
- 既有调用方仍使用 `STARGATE_API_KEY`，且不发送 `x-tenant-id`。

**When**

- 调用方创建 Account，完成 Captcha、Login、Refresh、Session 查询与 Logout。

**Then**

- 所有持久化与 Redis 状态均属于 `default`。
- Account 与认证响应显式返回 `tenantId=default`，Access Token 显式包含 `tid=default`。
- 既有路径、请求体和默认错误语义保持兼容。

**验证**

- 既有 API 与 SDK 黑盒测试在不传 Tenant header 时通过。
- Access Token 契约测试断言六个 claims。

### 两个 Tenant 可拥有同名 Account 且互不可见

**Given**

- `default` 与 `test` Tenant 均为 active。
- Admin 已在两个 Tenant 内分别创建相同 username 的 Account。

**When**

- 调用方分别以两个 Tenant 查询、登录或修改该 username 对应的 Account。
- 调用方把一侧的 Account ID 带到另一 Tenant 查询。

**Then**

- 两侧返回不同 `accountId`，且各自凭证只能登录所属 Tenant。
- 跨 Tenant 的单 ID 查询返回 `ACCOUNT_NOT_FOUND`，列表和 batch 不泄露另一侧数据。
- Captcha、登录锁、Session 和创建幂等状态也不跨 Tenant 命中。

**验证**

- PostgreSQL/Redis 多租户集成测试。
- Tenant API 黑盒跨租户 ID 探测测试。

### API Key 不得扩大 Tenant 权限

**Given**

- 平台分别配置 Admin API Key、仅绑定 `default` 的 Service API Key，并为 `test` 创建 Tenant API Key。

**When**

- Service API Key 尝试携带 `x-tenant-id: test`。
- `test` Tenant API Key 尝试携带 `x-tenant-id: default`，或操作另一个 Tenant 的 Key/Account。

**Then**

- 请求统一返回 `API_KEY_INVALID` 或当前 Tenant 内的 not-found 语义，不暴露目标 Tenant 或资源是否存在。
- Admin 只有在数据面明确解析到单一 Tenant 后才可代操作；Tenant 控制面不依赖 Tenant header。

**验证**

- Service 凭证矩阵集成测试。
- API/SDK Tenant header 黑盒测试。

### Token 与 Refresh 不得跨 Tenant 使用

**Given**

- Account A 已在 Tenant A 登录并获得 Access Token、Refresh Key 与 Session。

**When**

- 调用方在 Tenant B 提交 A 的 Refresh Key，或用与 Token `tid` 不一致的 Playground Tenant cookie 加载会话。

**Then**

- Refresh 返回 `REFRESH_INVALID`，且不得消费或撤销 Tenant A 的原 Session。
- Token 本身仍按签名、六 claims 与时间校验；资源方获得的 Principal 包含 Tenant A 的 `tenantId`。
- Playground 的 cookie mismatch 是终态拒绝，不得通过 Refresh 恢复；只清 Token/Refresh cookie，保留 Tenant 选择。

**验证**

- Refresh 跨 Tenant 集成测试。
- Playground Tenant session 状态机测试。

### Playground 可人工对比 default 与 test 身份

**Given**

- Preview/UAT 显式配置非 production deploy tier、固定测试 Captcha，并已幂等建立 active 的 `test` Tenant。
- `default` 与 `test` 各有可登录的同名测试 Account。

**When**

- 测试人员在登录页分别选择 `default` 与 `test` 登录。

**Then**

- 切换 Tenant 会刷新 Captcha 并清空已输入验证码。
- 两次登录后的首页显示不同 `tid` 与 `accountId`。
- Playground 的账户管理页明确只管理 `default`；跨 Tenant 控制面验证通过 Admin API/SDK 完成，不把 Admin Key 注入前端容器。

**验证**

- Playground 单元测试与 Preview/UAT 双租户 smoke。

### 已登录用户成功修改自己的密码

此场景源自 [202608-02 用户自改密码](../../features/202608-02-self-change-password.md) 的历史记录，并在本目录维护其当前版本。

**关联规范**

- [产品模型：用户自行修改密码](../product-domain-model/product-model.md)
- [领域概念：Self Password Change Service and Throttling Policy](../product-domain-model/domain-concepts.md)

**Given**

- 一个 `active` 且未删除的 Account，密码为已知的当前密码。
- 该 Account 已登录，持有未过期 Access Token，且同一 Account 另有至少一个可刷新的 Session。

**When**

- 使用该 Access Token 调用 `POST /v1/auth/password`，提交正确的 `currentPassword` 与合法的 `newPassword`。

**Then**

- 返回 `204`，且无响应体。
- 旧密码不可再用于登录，新密码可用于登录。
- Token `sid` 对应的当前 Session 仍可 Refresh，其他 Session 的 Refresh Key 失效。
- 记录 `password.self_change` 审计事件，actor 为该 Account。

**验证**

- API 黑盒测试：调用 `POST /v1/auth/password` 后验证旧密码登录失败、新密码登录成功。
- API 黑盒测试：验证当前 Session 可继续 Refresh，其他 Session 无法 Refresh。

### 当前密码错误或自改密码请求不合法

**关联规范**

- [产品模型：用户自行修改密码](../product-domain-model/product-model.md)
- [领域概念：PasswordCredential](../product-domain-model/domain-concepts.md)

**Given**

- 一个已登录的 Account，持有有效 Access Token。

**When**

- 提交错误的 `currentPassword`，或缺少、提交空的 `currentPassword` / `newPassword`，或 `newPassword` 与 `currentPassword` 相同。

**Then**

- 请求失败，PasswordCredential 与全部 Session 均不变。
- 当前密码错误返回 `CURRENT_PASSWORD_INVALID`；字段缺失、为空、非法或新旧密码相同返回 `PASSWORD_INVALID`。
- 错误的当前密码计入该 Tenant 内该 Account 的 Password Change Failure Counter；请求体校验错误不计入当前密码失败次数。

**验证**

- API 黑盒测试覆盖错误当前密码、非法 body 和新旧密码相同。
- 失败后验证旧密码仍可登录，既有 Refresh Key 仍按原规则可用。

### 错误当前密码达到阈值后短期拒绝自改

**关联规范**

- [产品模型：用户自行修改密码](../product-domain-model/product-model.md)
- [领域概念：Self Password Change Service and Throttling Policy](../product-domain-model/domain-concepts.md)

**Given**

- 一个已登录的 Account，持有有效 Access Token 与正确的当前密码。
- 该 Tenant 内该 Account 的 Password Change Failure Counter 尚未进入锁定状态。

**When**

- 连续提交错误的 `currentPassword` 直至达到失败阈值。
- 在锁定期内再次调用自改密码，包括提交正确当前密码的请求。
- 锁定期结束后，以正确当前密码与合法新密码再次调用。

**Then**

- 达到阈值后至锁定期结束前返回 `PASSWORD_CHANGE_LOCKED`。
- 锁定期间 PasswordCredential 与全部 Session 均不变，既有 Refresh Key 仍按原规则可用。
- 锁定期结束后允许重新尝试；正确自改可以成功，并清除失败计数。
- 自改失败计数与 Login Failure Counter 使用独立配置和计数键，锁定期间旧密码仍可登录，除非另行触发 Login Lock。

**验证**

- API 黑盒测试覆盖失败累计、锁定中拒绝、锁定期结束后恢复以及成功后清除计数。
- API 黑盒测试验证多 Tenant、不同 Account 之间的自改失败次数互不影响。

### 未认证或不可认证主体不可自行修改密码

**关联规范**

- [产品模型：对外身份契约](../product-domain-model/product-model.md)
- [领域概念：Access Token Validation Policy](../product-domain-model/domain-concepts.md)

**Given**

- 调用方未携带有效 Access Token，或 Token 对应 Account 已禁用或已软删除。

**When**

- 调用 `POST /v1/auth/password`。

**Then**

- 未认证请求返回 `ACCESS_TOKEN_INVALID`；不可认证 Account 被拒绝改密且不更新 PasswordCredential。
- 不得通过 Admin、Service 或 Tenant API Key 调用该接口完成用户自改语义。
- 管理员密码重置仍使用 `POST /v1/accounts/{accountId}/password`，行为不受用户自改失败计数影响。

**验证**

- API 黑盒测试覆盖无 Token、无效 Token、disabled Account 和已软删除 Account。
- 回归管理员重置接口的鉴权、请求体和撤销全部 Session 行为。

### Playground 使用登录态自行修改密码

**关联规范**

- [产品模型：用户自行修改密码](../product-domain-model/product-model.md)
- [上下文映射：Playground → Auth 与 Mekong](../product-domain-model/context-map.md)

**Given**

- Playground 已对接 Stargate Next 登录，并将 Access Token 写入会话 Cookie。

**When**

- 已登录用户在 Playground 提交当前密码与新密码。

**Then**

- Playground 服务端从会话 Cookie 取出 Access Token，以 Bearer 调用 `POST /v1/auth/password`。
- 不要求用户粘贴 Token；账户管理页既有的 API Key 管理员重置入口保持独立。

**验证**

- Playground 端到端或手动验收：登录 → 自改密码 → 旧密码登录失败 → 新密码登录成功。
