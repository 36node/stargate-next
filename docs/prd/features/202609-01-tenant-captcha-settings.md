# 202609-01 租户登录验证码配置

## 概述

本 Feature 在现有 Tenant 管理能力上增加 `settings.loginCaptchaRequired`，用于按租户控制账号密码登录是否必须提交 Captcha。该设置只影响登录前的 Captcha 校验，不改变账号密码校验、登录失败锁定、Tenant 状态校验或多租户隔离规则。

范围：

- Tenant 创建与更新接口支持读写 `settings.loginCaptchaRequired`。
- 登录接口中的 `captchaId` 与 `captchaCode` 调整为契约层可选字段，并在运行时根据目标 Tenant 的设置决定是否必填。
- 未配置时继续要求 Captcha，保证既有 Tenant 和既有登录流程保持安全兼容。
- Tenant 设置持久化到 PostgreSQL；单独更新设置不写认证审计，Tenant 创建、启停与 API Key 生命周期仍沿用既有审计规则。
- OpenAPI 与生成的 SDK 同步 Tenant 设置和可选的登录 Captcha 参数。

本期不新增公开的 Tenant 设置发现接口、终端用户自助配置入口或前端配置界面，也不关闭 Captcha 创建与独立验证接口。

## 模型与兼容范围

Tenant 增加非空 JSONB 字段 `settings`，数据库默认值为 `{}`。当前公开设置模型为：

```ts
type TenantSettings = {
  loginCaptchaRequired?: boolean;
};
```

`loginCaptchaRequired` 使用安全默认：只有显式配置为 `false` 才关闭登录 Captcha，其余情况均要求 Captcha。

| 持久化 / 响应中的 `settings` | 登录是否要求 Captcha | 说明 |
| --- | --- | --- |
| `{}` 或未包含该字段 | 是 | 既有 Tenant 和新建 Tenant 的默认行为 |
| `{ "loginCaptchaRequired": true }` | 是 | 显式启用 |
| `{ "loginCaptchaRequired": false }` | 否 | 显式关闭 |

Tenant API 返回保存后的设置形态，不把缺省值物化为 `true`。因此调用方读取设置时应使用 `settings.loginCaptchaRequired !== false` 判断有效行为，而不能仅判断字段是否存在。

数据库迁移为全部既有 Tenant 写入默认 `{}`，所以升级前要求 Captcha 的登录行为不会因迁移而改变。数据库约束保证 `settings` 必须是 JSON object；应用层进一步限制当前只允许 `loginCaptchaRequired`。

## Tenant 管理契约

仅持有现有 Admin 凭证的调用方可通过 Tenant 控制面管理该设置：

- `POST /v1/tenants`：创建 Tenant 时可提交可选的 `settings`。
- `PATCH /v1/tenants/{tenantId}`：可单独更新 `settings`，也可与 `name`、`status` 一起提交。
- `POST`、`PATCH`、`GET /v1/tenants/{tenantId}` 与 `GET /v1/tenants` 的 Tenant 表示均包含 `settings`。

示例：

```json
{
  "settings": {
    "loginCaptchaRequired": false
  }
}
```

设置校验规则：

- `settings` 必须是 JSON object，不能是 `null`、数组或标量。
- 当前仅允许 `loginCaptchaRequired`；出现未知字段时拒绝整个请求。
- `loginCaptchaRequired` 如存在，必须是 boolean，不接受字符串形式的 `"true"` 或 `"false"`。
- 创建请求中的非法设置返回 `BODY_INVALID`；更新请求中的非法设置返回 `PATCH_INVALID`。
- `PATCH` 对 `settings` 执行整对象替换而非字段合并。提交 `{}` 会清除显式值，并恢复默认要求 Captcha；提交 `{ "loginCaptchaRequired": true }` 可显式恢复。

Tenant 设置更新不记录独立的认证审计事件。`PATCH` 同时包含 `settings` 与 `status` 时，仍只按既有规则记录 `tenant.enabled` 或 `tenant.disabled`；name、settings 与 status 的组合更新继续在同一数据库事务中完成。

## 登录行为

公开登录接口仍通过 `x-tenant-id` 选择目标 Tenant（缺省为 `default`），并在解析出有效且为 `active` 的 Tenant 后读取其设置。租户选择与隔离规则沿用 [202608-01 多租户](./202608-01-multi-tenants.md)。

### 要求 Captcha

当 `settings.loginCaptchaRequired !== false` 时：

1. 登录请求必须包含非空的 `captchaCode`；缺失或非法时返回 `CAPTCHA_CODE_INVALID`。
2. 登录请求必须包含非空的 `captchaId`；在已提供合法 `captchaCode` 后仍缺失或非法时返回 `CAPTCHA_ID_INVALID`。
3. Captcha 必须属于同一 Tenant、未过期且校验成功；否则返回 `CAPTCHA_INVALID`，并沿用既有规则计入登录失败次数。
4. Captcha 通过后继续执行账号状态、密码和登录失败锁定校验，行为与 [202607-03 会话与认证](./202607-03-auth-session.md) 一致。

### 不要求 Captcha

当 `settings.loginCaptchaRequired === false` 时：

- 登录请求可省略 `captchaId` 与 `captchaCode`。
- 服务跳过 Captcha 校验，直接进入账号密码与登录失败锁定流程。
- 关闭设置不会放宽 Tenant 状态、账号状态、密码或租户隔离校验，也不会影响 Refresh、Logout 和 Session 管理。
- `POST /v1/captchas` 与 `POST /v1/captchas/verify` 仍可调用；该设置只决定登录是否消费 Captcha。

由于是否必填取决于运行时选定的 Tenant，OpenAPI 的 Login 请求以及 SDK 的 `login` 方法将 `captchaId`、`captchaCode` 声明为可选；服务端仍按上述 Tenant 设置实施条件校验。

## 验收

### 默认与显式启用时要求 Captcha

**Given**

- 一个 `active` Tenant，其 `settings` 为 `{}`、未包含 `loginCaptchaRequired`，或显式设置为 `true`。
- Tenant 内存在可登录的 `active` Account。

**When**

- 分别以缺少 Captcha 字段、错误或过期 Captcha、正确 Captcha 调用 `POST /v1/auth/login`。

**Then**

- 缺少 `captchaCode` 时返回 `CAPTCHA_CODE_INVALID`；提供 code 但缺少 `captchaId` 时返回 `CAPTCHA_ID_INVALID`。
- 错误或过期 Captcha 返回 `CAPTCHA_INVALID`，且不签发 Token。
- 正确 Captcha 与正确账号密码组合可正常登录。

**验证**

- 核对默认 Tenant 与迁移前既有 Tenant 的登录行为保持不变。
- 核对显式设置为 `true` 与缺省设置的行为一致。

### 单一 Tenant 关闭 Captcha

**Given**

- 两个相互隔离的 `active` Tenant，均存在可登录 Account。
- Admin 将其中一个 Tenant 更新为 `{ "loginCaptchaRequired": false }`，另一个 Tenant 保持默认设置。

**When**

- 两个 Tenant 均省略 `captchaId` 与 `captchaCode` 发起登录。

**Then**

- 关闭 Captcha 的 Tenant 在账号密码正确时登录成功。
- 保持默认设置的 Tenant 仍返回 `CAPTCHA_CODE_INVALID`。
- 两个 Tenant 的 Account、登录失败计数和认证结果互不影响。

**验证**

- 服务集成测试覆盖关闭前要求 Captcha、更新设置后无需 Captcha以及跨 Tenant 隔离。

### 创建、恢复默认与非法设置

**Given**

- 调用方持有有效 Admin 凭证。

**When**

- 创建 Tenant 时显式配置 `loginCaptchaRequired: false`。
- 对已关闭 Captcha 的 Tenant 提交 `settings: {}` 或显式提交 `loginCaptchaRequired: true`。
- 分别提交非对象 settings、非 boolean 值和未知设置字段。

**Then**

- 新建 Tenant 可从创建时起省略 Captcha 登录。
- `{}` 与显式 `true` 均恢复要求 Captcha。
- 非法创建请求返回 `BODY_INVALID`，非法更新请求返回 `PATCH_INVALID`，且不修改原设置。

**验证**

- Tenant 创建、读取、列表和更新响应均返回保存后的 `settings`。
- SDK 的 Tenant 类型包含 `settings`，登录方法允许省略 Captcha 参数。

### 持久化与审计边界

**Given**

- 一个已存在的 Tenant，Admin 对其更新登录 Captcha 设置。

**When**

- 单独更新 settings，或在同一请求中同时更新 settings 与 status。

**Then**

- 成功时 JSONB 设置被持久化，单独更新 settings 不产生认证审计事件。
- 同时改变 status 时只产生对应的 `tenant.enabled` 或 `tenant.disabled` 事件，不产生额外的设置事件。
- 迁移后的既有 Tenant 以 `{}` 表示缺省设置，并继续要求 Captcha。

**验证**

- 核对数据库迁移的非空默认值和 object 约束。
- 按 request ID 核对纯 settings 更新没有审计记录，混合 status 更新只有状态事件。
