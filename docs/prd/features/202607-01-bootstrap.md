# 202607-01 初始化与基础框架

## 概述

Phase A 先建立可独立运行、可通过 Playground 验证的认证服务底座。目标是让调用方能以公开 HTTP 契约和生成 SDK 使用认证能力，而不依赖旧 Auth 的业务用户、组织或权限接口。

范围：

- `GET /health/live` 与 `GET /health/ready`，其中 readiness 同时依赖 PostgreSQL 与 Redis。
- OpenAPI 作为公开接口的唯一契约来源，并生成 `stargate-next-sdk`。
- Captcha 创建与验证：图片响应、短期存储、一次性消费、错误次数限制和按客户端 IP 的创建限流。
- 最小认证审计写入：记录认证、账户、密码和会话操作；不提供审计查询接口。
- Playground 通过 Next 的公开契约完成 Captcha、登录和账户管理验证。

账户管理与会话认证仅在本阶段建立闭环，细化设计见 [202607-02 账户管理](./202607-02-account-management.md) 与 [202607-03 会话与认证](./202607-03-auth-session.md)。

不包含 Profile、Organization、Role、Permission、业务授权、真实 Mekong 集成与迁移。

## 模型与兼容范围

认证服务仅拥有 Account、密码凭证、Captcha、Session、Access Token 与认证审计。JWT 只表达账户和会话身份，不承载业务授权。

旧 Auth 不作为长期兼容目标；调用方迁移到公开 API 与生成 SDK。整体切换时旧 Session 可失效，且不进行新旧 Session 的长期双写。

## 验收

### 服务可用并暴露稳定契约

**Given**

- 服务已配置 PostgreSQL、Redis、认证签名密钥和服务 API Key。

**When**

- 调用 live、ready 端点，并由生成 SDK 调用公开认证接口。

**Then**

- live 表示进程可响应；ready 仅在 PostgreSQL 与 Redis 均可用时成功。
- OpenAPI 所列操作可由 SDK 调用，服务端响应与 SDK 类型保持一致。
- API、SDK、日志和审计均不返回密码、Captcha 明文、Access Token、Refresh Key 或凭证 hash。

**验证**

- 黑盒测试：`apps/stargate-next/test/**.black-box.spec.ts`。
- 契约类型测试：`apps/stargate-next/test/contracts.spec.ts`。

### Playground 最小闭环

**Given**

- Playground 配置为使用 Stargate Next 后端，且服务处于 ready 状态。

**When**

- 操作者创建 Captcha，使用有效账户登录，并进入账户管理界面。

**Then**

- Playground 只经由公开认证契约完成请求。
- 操作者可观察到登录结果、会话身份信息和账户查询结果。
