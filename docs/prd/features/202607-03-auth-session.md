# 202607-03 会话与认证

## 概述

本 Feature 定义从 Captcha 到登录、刷新、退出和会话撤销的认证闭环。认证只建立 `{ accountId, sessionId }` 身份主体；业务授权不写入 JWT。

范围：

- Captcha 创建、验证、一次性消费、过期、错误次数限制与创建限流。
- 使用 username、phone 或 email 加密码登录，建立可刷新的 Session。
- 签发最小 Access Token；Refresh 保持原 Session ID 和 Refresh Key。
- Logout、单 Session 撤销与账户级撤销。
- Login 失败计数和短期锁定。

## 模型与兼容范围

Access Token 只含 `sub`、`sid`、`type`、`iat`、`exp`；不含组织、角色、权限或群组。Refresh Key 仅在 Session 创建时向调用方返回，服务端仅保存其 HMAC hash。

Session 被撤销、过期，或关联 Account 被禁用、删除后，不得继续 Refresh。Logout、撤销、禁用与删除不逐请求校验既有 Access Token；Token 可用至自身过期。

本期不实现 Refresh rotation、reuse detection、OIDC Provider、OAuth/Federation 或设备凭证。

## 验收

### Captcha 建立登录前置条件

**Given**

- 认证服务可用，调用方尚未取得有效登录会话。

**When**

- 调用 `POST /v1/captchas` 创建挑战，并向登录接口提交正确或错误的验证码。

**Then**

- 创建响应提供可展示的验证码图片与 Captcha ID，不返回验证码明文。
- 正确验证码只可成功消费一次；重复使用返回 `CAPTCHA_INVALID`。
- 错误验证计入限制；超过同一客户端 IP 的创建频率时返回 `CAPTCHA_RATE_LIMITED`。
- 测试模式的固定验证码仍遵守每个 Captcha ID 的 TTL、一次性消费和限流规则。

**验证**

- `POST /v1/captchas`、`POST /v1/auth/login`。
- API 黑盒测试覆盖图片响应、一次性消费和创建限流。

### 登录、刷新与退出

**Given**

- 一个 active 且未删除的 Account 使用正确密码，且持有未消费的有效 Captcha。

**When**

- 调用 `POST /v1/auth/login`，随后调用 `POST /v1/auth/refresh` 与 `POST /v1/auth/logout`。

**Then**

- 登录创建 Session，并返回 Access Token、Refresh Key、Account ID 和 Session ID。
- Access Token 的 claims 仅为 `sub`、`sid`、`type`、`iat`、`exp`。
- Refresh 返回原 Session ID，不轮换 Refresh Key，也不延长 Session。
- Logout 删除当前 Session；随后以原 Refresh Key 刷新返回认证失败。
- 账户不存在、不可认证或密码错误时，对外返回统一登录失败语义，避免账户枚举。

**验证**

- `POST /v1/auth/login`、`POST /v1/auth/refresh`、`POST /v1/auth/logout`。
- API 黑盒测试覆盖 Captcha→login→JWT→refresh→logout。
- SDK 黑盒测试覆盖创建账户后登录、刷新、列出与撤销 Session。

### 管理员撤销会话

**Given**

- 一个 Account 拥有一个或多个有效 Session。

**When**

- 服务调用方查询该账户的 Session，随后撤销指定 Session 或账户级 Session。

**Then**

- 查询结果不暴露 Refresh Key 或其 hash。
- 被撤销 Session 的 Refresh Key 无法继续刷新。
- 对不存在的 Session 执行撤销仍可安全重试。

**验证**

- `GET /v1/accounts/{accountId}/sessions`、`DELETE /v1/accounts/{accountId}/sessions`。
- SDK 黑盒测试覆盖查询、撤销与 Refresh 失败。

### 禁用账户后阻止继续认证

**Given**

- 一个状态为 `active` 的 Account 已完成登录并拥有可用 Session。
- 该 Account 已持有尚未过期的 Access Token 与 Refresh Key。

**When**

- 业务管理员将该 Account 设置为 `disabled`。

**Then**

- 服务撤销该 Account 的全部 Session。
- 使用原 Refresh Key 刷新 Access Token 失败。
- 使用该 Account 的密码再次登录失败，且不暴露账户状态或存在性。
- 已签发 Access Token 不做逐请求 Session 校验，只能使用至自身过期；业务应用不得将其视为仍可刷新会话的依据。

**验证**

- API 黑盒测试应验证禁用后的 Refresh 与重新登录。
- Playground 端到端测试应验证 Refresh 失败后清除本地会话并返回登录页。
