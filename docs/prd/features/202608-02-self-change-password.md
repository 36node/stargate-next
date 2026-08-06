# 202608-02 用户自改密码

## 概述

本 Feature 在现有管理员重置密码之外，增加**已登录用户自行修改密码**的能力。自改密码与管理员重置是两类操作：鉴权、请求体与安全约束不同，不混用同一接口。

范围：

- 新增用户侧改密接口：调用方持有有效 Access Token，并提交当前密码与新密码。
- 账号身份从 Access Token 解析（`sub` / `tid`），不由调用方在路径或 body 中指定他人 `accountId`。
- 校验当前密码通过后写入新密码；失败时不泄露账户是否存在以外的额外信息（已认证场景下账户已由 Token 确定）。
- 对错误的 `currentPassword` 按 Account（Tenant 内）累计失败次数，达阈后短期拒绝后续自改尝试。
- 明确与 [202607-02](./202607-02-account-management.md) 管理员改密（`POST /v1/accounts/{accountId}/password`）的边界。

本期不实现未登录找回/重置（邮箱或手机验证码）、密码强度策略升级，也不把自改密码并入 Account `PATCH`。

## 模型与兼容范围

| 操作 | 接口 | 鉴权 | 请求体 | 会话影响 |
| --- | --- | --- | --- | --- |
| 管理员重置 | `POST /v1/accounts/{accountId}/password` | Tenant / Admin / 兼容 API Key | `{ password }` | 撤销该 Account 的全部 Session（既有行为，见 202607-02） |
| 用户自改 | `POST /v1/auth/password` | Bearer Access Token | `{ currentPassword, newPassword }` | 撤销该 Account **除当前 Session 以外**的全部 Session；当前 `sid` 对应 Session 保留，以便调用方继续使用本会话 |

自改密码：

- 仅允许修改 Token 中 `sub` 对应的 Account；禁止代改他人密码。
- 必须校验 `currentPassword`；错误时返回稳定错误码，不更新密码、不撤销 Session，并计入该 Account 的自改失败次数。
- 错误旧密码累计达到阈值后，在锁定期内拒绝自改（稳定错误码，例如 `PASSWORD_CHANGE_LOCKED`）；锁定期间密码与 Session 均不变。阈值与锁定期使用独立配置，不与登录失败锁定共用配置；计数键必须带 `tenantId` 与 `accountId`。
- 自改成功或锁定期结束后清除该 Account 的自改失败计数。
- `newPassword` 必填且非空（校验规则与创建账户 / 管理员改密一致）；不得与 `currentPassword` 相同。
- Account 须为未删除且可认证（`active`）；否则拒绝改密。
- 多租户下，改密仅作用于 Token `tid` 对应 Tenant 内的该 Account（与 [202608-01](./202608-01-multi-tenants.md) 一致）。
- 已签发的 Access Token 仍不因改密做逐请求撤销，可用至自身过期（与 202607-02 / 202607-03 一致）；被撤销 Session 的 Refresh Key 不可再刷新。
- 审计事件与管理员改密区分语义（例如 `password.self_change`），actor 为该 Account。
- 管理员重置接口不按用户旧密码失败次数锁定。

## 验收

### 已登录用户成功修改密码

**Given**

- 一个 `active` 且未删除的 Account，密码为已知的当前密码。
- 该 Account 已登录，持有未过期 Access Token，且同一账户另有至少一个其他可刷新 Session。

**When**

- 使用该 Access Token 调用 `POST /v1/auth/password`，提交正确的 `currentPassword` 与合法的 `newPassword`。

**Then**

- 返回成功（无响应体，`204`）。
- 旧密码不可再用于登录；新密码可用于登录。
- 当前 Token 中 `sid` 对应的 Session 仍可 Refresh；其他 Session 的 Refresh Key 失效。
- 审计记录为用户自改密码成功。

**验证**

- `POST /v1/auth/password`、`POST /v1/auth/login`、`POST /v1/auth/refresh`。
- API 黑盒测试覆盖自改成功、他端 Session 失效、当前 Session 可续期。

### 当前密码错误或请求不合法

**Given**

- 一个已登录的 Account，持有有效 Access Token。

**When**

- 提交错误的 `currentPassword`，或缺省 / 空的 `currentPassword` 或 `newPassword`，或 `newPassword` 与 `currentPassword` 相同。

**Then**

- 请求失败，密码与 Session 均不变。
- 当前密码错误使用稳定错误码（如 `CURRENT_PASSWORD_INVALID`）；字段缺失或非法使用稳定错误码（如 `PASSWORD_INVALID`）。

**验证**

- API 黑盒测试覆盖错误旧密码、非法 body，以及失败后仍可用旧密码登录。

### 错误旧密码达阈后短期拒绝

**Given**

- 一个已登录的 Account，持有有效 Access Token 与正确的当前密码。
- 该 Account 的自改失败计数尚未锁定。

**When**

- 连续提交错误的 `currentPassword` 直至达到失败阈值；随后在锁定期内再次调用自改（含正确旧密码）；锁定期结束后再以正确旧密码与合法新密码调用。

**Then**

- 达阈后至锁定期结束前，自改请求被拒绝，返回稳定错误码（如 `PASSWORD_CHANGE_LOCKED`）。
- 锁定期间密码与全部 Session 均不变；既有 Refresh Key 仍按原规则可用。
- 锁定期结束后，正确的自改可以成功；成功后失败计数被清除。

**验证**

- API 黑盒测试覆盖失败累计、锁定中拒绝、锁定期后恢复，以及锁定期间旧密码仍可登录（除非另行触发登录锁定）。

### 未认证或不可认证主体不可自改

**Given**

- 调用方未携带有效 Access Token；或 Token 对应 Account 已禁用 / 已软删除。

**When**

- 调用 `POST /v1/auth/password`。

**Then**

- 未认证返回认证失败；不可认证 Account 拒绝改密且不更新凭证。
- 不得通过 API Key 调用本接口完成「用户自改」语义（管理员重置仍走 `POST /v1/accounts/{accountId}/password`）。

**验证**

- API 黑盒测试覆盖无 Token、无效 Token、禁用账户。
- 确认管理员重置接口行为不被本 Feature 改变。

### Playground 可用登录态自测

**Given**

- Playground 已对接 Stargate Next 登录，并将 Access Token 写入会话 Cookie。

**When**

- 已登录用户在 Playground 提交当前密码与新密码。

**Then**

- Playground 服务端从会话取出 Access Token，以 Bearer 调用 `POST /v1/auth/password`。
- 不要求用户粘贴 Token；账号管理页既有的 API Key 管理员重置入口保持独立。

**验证**

- Playground 端到端或手动验收：登录 → 自改密码 → 旧密码登录失败、新密码登录成功。
