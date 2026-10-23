# 202610-01 Tenant API Key 授权跳过登录验证码

状态：**已实现**。现有 Login API、OpenAPI、SDK 与当前生效规范已同步支持本文能力。

## 概述

可信业务后端需要在 Tenant 开启登录 Captcha 时，使用 Tenant API Key 和用户账号密码完成登录，同时保留公开登录的验证码要求。本 Feature 扩展现有 `POST /v1/auth/login`，由调用方通过 `options.skipCaptcha` 显式请求豁免，服务端验证 Tenant API Key 后授权。

API Key 仅授权跳过验证码，不代替用户密码，也不映射为用户 Account 或 Session。登录成功后的身份主体仍来自通过密码验证的 Account。

范围：

- 扩展现有 Login 请求，支持可选的 `options.skipCaptcha`。
- 仅允许数据库管理的有效 Tenant API Key 授权验证码豁免。
- 两种登录方式复用账号密码验证、失败锁定、Session 和 Token 签发流程。
- 同步 OpenAPI 与 SDK 的现有 `login` 参数，不新增接口或 SDK 方法。

设计阶段先交付 PRD 及其索引，再交付代码与验证。首版功能不新增数据库字段、Key scope、租户开关、前端页面或部署配置，不变更旧版 Stargate。

## 模型与兼容范围

本 Feature 基于 [202608-01 多租户](./202608-01-multi-tenants.md) 的 Tenant API Key 与隔离规则，以及 [202609-01 租户登录验证码配置](./202609-01-tenant-captcha-settings.md) 的安全默认行为。

`settings.loginCaptchaRequired` 继续决定未请求豁免的登录是否要求 Captcha。豁免只对当前获准的请求生效，不更新 Tenant 设置，也不影响其他调用方。

两种方式始终认证用户账号密码，使用同一 Tenant 内的 Account、Login Failure Counter、Session 和认证响应模型。没有 `options` 的既有请求保持原有行为。

## 接口契约

继续使用 `POST /v1/auth/login`，OpenAPI operationId 与 SDK 方法名保持 `login`。

请求示例：

```http
POST /v1/auth/login
x-api-key: <tenant-api-key>
Content-Type: application/json
```

```json
{
  "login": "alice",
  "password": "<password>",
  "options": {
    "skipCaptcha": true
  }
}
```

请求字段：

| 字段 | 契约 |
| --- | --- |
| `login` | 必填非空字符串，继续支持 username、phone、email；规范化规则沿用现有登录流程 |
| `password` | 必填非空字符串，使用现有密码验证规则 |
| `captchaId`、`captchaCode` | 沿用既有契约；豁免获准时忽略，不校验或消费 |
| `options` | 可选；提供时必须为 JSON object，不能为 `null`、数组或标量 |
| `options.skipCaptcha` | 可选 boolean；只有显式 `true` 才请求豁免，缺省或 `false` 均不请求 |

`options` 为封闭对象，当前仅允许 `skipCaptcha`。未知选项、非法对象类型或非 boolean 的 `skipCaptcha` 返回 `400 BODY_INVALID`，不接受字符串 `"true"` / `"false"`。`options: {}` 合法。顶层其他字段的校验沿用既有契约。

验证码行为矩阵：

| 请求条件 | 行为 |
| --- | --- |
| 未提供 `options`，或 `skipCaptcha` 缺省／为 `false` | 沿用目标 Tenant 的验证码设置 |
| `skipCaptcha: true`，Tenant Key 有效且租户匹配 | 跳过验证码，继续验证账号密码 |
| `skipCaptcha: true`，Key 缺失、无效、已删除或越权 | 返回 `401 API_KEY_INVALID`，不降级为普通登录 |

仅携带有效 Key 不自动豁免验证码。未请求豁免时，`x-api-key` 不参与公开登录的鉴权与租户选择，即使其无效也不改变该流程。租户已关闭验证码时，显式请求豁免仍须通过 Key 验证。

成功返回 `200`，完整复用现有 `AuthTokens`：`accessToken`、`accessTokenExpiresAt`、`accountId`、`refreshKey`、`refreshExpiresAt`、`sessionId`、`tenantId`。不增加响应字段或 JWT claims。

SDK 保留原有五个位置参数，将 options 追加为第六参数；仅显式请求豁免时发送客户端配置的 API Key：

```ts
const client = new StargateNextClient(endpoint, { apiKey: tenantApiKey });
const tokens = await client.login(
  "alice",
  password,
  undefined,
  undefined,
  undefined,
  { skipCaptcha: true }
);
```

此例省略 Tenant header，由 Key 确定租户。对非默认租户后续调用 Refresh、Logout 时，仍须通过客户端配置或方法参数提供 `tokens.tenantId`。

## 权限与租户选择

仅数据库管理的 Tenant API Key 可以授权豁免。Admin API Key、全局 Service API Key 和 Bearer Access Token 均不可替代；显式请求豁免但没有有效 Tenant Key 时统一返回 `API_KEY_INVALID`。

| 登录方式 | 未提供 `x-tenant-id` | 提供 `x-tenant-id` |
| --- | --- | --- |
| 未请求豁免 | 使用公开登录的 `default` 默认值 | 按公开登录规则解析目标 Tenant |
| 请求豁免 | 使用 Tenant Key 所属 Tenant | 必须与 Key 所属 Tenant 匹配，否则返回 `API_KEY_INVALID` |

豁免路径沿用现有数据面的 Tenant header 格式校验与租户状态错误语义：格式非法返回 `TENANT_INVALID`，目标 Tenant 不存在返回 `TENANT_INVALID`，停用返回 `TENANT_DISABLED`。格式合法但与 Key 不匹配时先拒绝越权，不查询或泄露另一 Tenant 是否存在。

已删除的 Tenant Key 不得继续授权登录。Key 删除只阻止后续豁免调用，不额外撤销此前通过该 Key 授权登录所建立的用户 Session；既有 Session 沿用用户、租户状态及撤销规则。

## 登录与失败锁定

处理顺序：

1. 校验 `options` 结构及类型，确定是否请求豁免；非法选项直接返回 `BODY_INVALID`。
2. 请求豁免时，先验证 Tenant Key、租户归属与租户状态，再验证账号字段和密码。Key 验证失败时不继续处理 Captcha、账户查询或用户密码验证。
3. 未请求豁免时，沿用公开登录的租户选择、字段校验和 Tenant 验证码设置。
4. 两种方式汇入同一套账号规范化、登录锁检查、密码与账户状态验证流程；仅在授权条件成立时省略 Captcha 校验。获准豁免的请求即使携带非法 Captcha 字段，也忽略这些字段。
5. 成功后创建普通用户 Session，签发与现有登录一致的 Token 和 Refresh Key，并清除共享登录失败计数。

错误语义：

- 账号字段缺失或非法沿用 `LOGIN_IDENTIFIER_INVALID`、`PASSWORD_INVALID`。
- Account 不存在、已禁用、已删除、密码不可认证或密码错误，统一返回 `LOGIN_INVALID`，不暴露具体账户状态，不创建 Session。
- 锁定期间继续返回 `LOGIN_LOCKED`；持有正确密码和有效 Tenant Key 也不得绕过锁定。
- 未请求豁免时，Captcha 字段与挑战的错误语义保持原样。

失败计数继续以 Tenant 和规范化 login 为维度，复用现有阈值、锁定时间及 Redis 状态，不按入口或 Key ID 拆分。两种登录方式交替失败仍累计至同一锁定；更换同租户 Key 不得绕过锁定。无效 Key、非法请求体和字段校验失败不累计用户密码失败次数。

JWT claims、有效期、Refresh、Logout、Session 查询与撤销均沿用既有契约。Captcha 豁免不影响账户、租户状态或多租户隔离规则。

## 审计

沿用 `login` 事件，不新增事件类型。获准豁免后，登录成功及账号密码验证失败的审计均记录：

- `actorType: tenant_key`，`actorId` 为授权此次请求的 Tenant Key ID。
- `tenantId` 为 Key 所属 Tenant；`accountId` 为目标账户 ID，无法定位账户时保持为空。
- `metadata.method: tenant_api_key`，用于区分登录来源；成功时关联新建 Session。
- 成功与失败结果，以及既有 Request ID、IP、User-Agent 上下文。

未请求豁免的登录保持原有审计语义。Key 验证失败、请求体错误和锁定拒绝不新增独立登录审计要求，沿用既有处理边界。

审计和日志不得记录 API Key、密码、Token、Refresh Key、Captcha code 或其秘密摘要。

## 验收

### 开启验证码时通过 Tenant Key 登录

**Given**

- 一个 active Tenant 开启了登录验证码，并有 active、未删除且可密码认证的 Account。
- 调用方持有该 Tenant 的有效 Tenant API Key。

**When**

- 分别以该账户的 username、phone、email 提交正确密码及 `options.skipCaptcha: true`，不提供 Captcha。
- 分别省略 Tenant header 和显式提供匹配的 Tenant header。

**Then**

- 均返回 `200` 和既有结构的 `AuthTokens`，`tenantId` 与 Key 所属 Tenant 一致。
- 创建的 Session 属于通过密码认证的 Account，Tenant 验证码设置保持不变。

### 拒绝无效凭证和跨租户豁免

**Given**

- Tenant A、B 均存在，调用方尝试显式请求验证码豁免。

**When**

- 分别不携带 Key、携带错误或已删除的 Key，或仅使用 Admin Key、Service Key、Bearer Token。
- 使用 A 的 Key 并显式选择 B，包括 B 不存在的情况。
- 使用合法 Key，但其所属 Tenant 已停用。

**Then**

- 不具备有效 Tenant Key 或租户越权时返回 `API_KEY_INVALID`，不降级、不创建 Session。
- Tenant 停用时返回 `TENANT_DISABLED`；其他 Tenant 数据不被查询或泄露。
- 无效 Key 不计入目标 login 的失败次数，账号字段错误不优先于 Key 验证失败。

### 未请求豁免时保留公开登录行为

**Given**

- Tenant A 要求 Captcha，Tenant B 显式关闭 Captcha。

**When**

- 分别不提供 options、提供 `{}`、提供 `{ "skipCaptcha": false }`，并携带或不携带 API Key 登录。

**Then**

- A 继续要求合法 Captcha；仅携带有效 Key 也不能省略 Captcha。
- B 继续允许正确账号密码直接登录。
- Key 的存在及有效性不影响租户选择；省略 Tenant header 仍选择 `default`。
- B 若显式请求豁免但 Key 无效，仍返回 `API_KEY_INVALID`。

### 选项校验和 Captcha 消费边界

**Given**

- 目标 Tenant 中已有一个未消费的有效 Captcha。

**When**

- 分别提交 `null`、数组、标量 options，或未知选项、非 boolean 的 `skipCaptcha`。
- 通过合法 Tenant Key 请求豁免，同时提交上述 Captcha 或非法 Captcha 字段。

**Then**

- 非法 options 返回 `BODY_INVALID`，不创建 Session，也不累计密码失败次数。
- 获准豁免后忽略 Captcha 字段，正确账号密码可以登录；原挑战仍可按既有规则被消费一次，不因豁免而被校验或修改。

### 两种登录方式共享失败锁定

**Given**

- Tenant A、B 各有相同登录标识的账户，A 下有多把有效 Tenant Key。

**When**

- 在 A 中以同一规范化 login 交替使用普通登录和 Key 豁免登录提交错误密码；普通登录提供有效 Captcha。
- 达到现有失败阈值后，更换 A 的 Key 并提交正确密码。
- 在 B 中以正确凭证登录；待 A 锁定期结束后，再对 A 登录。

**Then**

- A 的失败次数共同累计，达到阈值后按现有时机进入锁定，锁定期间正确密码及更换 Key 均返回 `LOGIN_LOCKED`。
- B 不受 A 的锁定影响。
- A 锁定期结束后恢复正常登录；成功后共享失败计数被清除。

### 账户状态与会话闭环

**Given**

- 调用方具备合法 Tenant Key，目标 Tenant 为 active。

**When**

- 使用错误密码，或尝试登录不存在、disabled、已删除或不可密码认证的 Account。
- 使用正确账号密码完成豁免登录，再执行 Refresh、Logout 和会话撤销。
- 删除授权该次登录的 Tenant Key 后，尝试继续 Refresh 和重新请求豁免登录。

**Then**

- 账户与密码认证失败统一返回 `LOGIN_INVALID`，不产生 Session。
- 成功响应、JWT claims、Refresh 与会话终止行为均符合既有契约。
- 删除 Key 不额外撤销已建立的 Session，其 Refresh 仍受既有规则约束；新的豁免请求被拒绝。

### SDK 契约与审计来源

**Given**

- 服务、OpenAPI 和生成 SDK 已实现本 Feature。

**When**

- 使用既有无 options 的请求，以及新增的 options 参数分别通过 HTTP 和 SDK 调用 `login`。
- 通过合法 Tenant Key 分别完成一次成功登录和一次错误密码登录。

**Then**

- 旧请求兼容；OpenAPI、SDK 类型和实际请求行为一致，不新增登录路径或方法。
- 豁免登录的成功及密码失败事件均可通过 `tenant_key`、Key ID 和 `metadata.method` 追溯来源。
- 审计关联正确 Tenant、目标 Account 和成功登录的 Session，且不包含秘密。

## 实现验证与规范同步

实现阶段使用服务集成测试覆盖 Tenant Key 权限、跨租户隔离、共享失败锁定、Captcha 消费边界及审计；使用 API／SDK 黑盒测试覆盖请求选项、错误契约和登录至 Refresh、Logout、撤销的认证闭环。

实现交付已同步以下内容：

- 当前产品模型中的登录流程：增加可信后端显式请求、Tenant Key 授权的验证码豁免路径。
- 当前领域概念中的 Tenant Settings、Authentication Service 与 Captcha 不变量：将 Tenant 验证码要求明确限定为未获准豁免的请求，同时保留 Key 与用户身份的边界。
- 当前关键场景与验收：增加上述行为，并明确普通登录仍按 Tenant 设置校验 Captcha。
- OpenAPI、服务输入契约与生成 SDK：扩展现有 Login 的 options，说明 `x-api-key` 仅在请求豁免时必需，保留原有公开登录调用方式。
