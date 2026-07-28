# Auth 重写计划

## 1. 目标与非目标

### 1.1 目标

1. 将 MVP 继续使用的 Auth 持久化数据从 MongoDB 迁移到 PostgreSQL，并完成全量迁移、对账和整体切换。
2. 数据库迁移期间保持现有人员登录、验证码登录、极光一键登录、第三方登录、Session、JWT、API Key 和实名行为兼容。
3. 保留 Haivivi 的设备 Session、配对 UAT、MQTT ACL Token 等已确认业务协议。
4. 借迁移梳理数据所有权和模块边界，只精简已确认无调用或不属于 Auth 的能力，不以完整领域重构阻塞 PostgreSQL 上线。
5. 引入标准的 Client、scope、issuer、audience、JWKS、密钥轮换和审计模型。
6. 保持现有实名认证 KYC 兼容；完整流程重设计放到 Post-MVP。
7. Refresh Token/API Key 只保存哈希，支持轮换、撤销和重放检测。
8. 新代码开启严格 TypeScript、模块边界和自动化测试。
9. Post-MVP 支持 OIDC Authorization Code + PKCE 和 Client Credentials；MVP 先完成 PostgreSQL 迁移和现有调用方兼容。

### 1.2 非目标

- 不在 `stargate-next` 中承载头像、等级、邀请、积分、业务标签等完整 Profile。
- 不承载 Namespace 业务组织主数据和复杂资源授权。
- 不提供通用短信/邮件网关及消息正文管理。
- 不提供行业/地区字典、用户聚合报表和全库清空接口。
- 不直接复制旧 Auth 的所有 90 个路由；只实现确认仍被使用的兼容面。
- 不为追求理想模块划分而扩大 MVP 范围；模块精简服务于 PostgreSQL 迁移、兼容和后续维护。
- 不自行实现 OAuth/OIDC 密码学细节；标准协议基于成熟、持续维护的库。

## 2. 推荐技术决策

| 项目 | 建议 |
| --- | --- |
| Monorepo | pnpm workspace。 |
| 后端 | NestJS，HTTP adapter 在项目初始化时固定；开启 `strict`、`strictNullChecks`。 |
| Playground | Next.js App Router + Playwright，既测试浏览器重定向，也测试服务端 Client。 |
| 长期数据 | MVP 使用 PostgreSQL 作为唯一目标主库，利用事务、唯一约束和可审计 migration；MongoDB 只作为迁移源和限时回滚数据源。领域层不得暴露 ORM 类型。 |
| 短期状态 | Redis，用于 OTP、登录限流、一次性状态和短期缓存；生产实例必须配置持久化/高可用及合适淘汰策略。 |
| 数据迁移 | 账户 ID 保持原字符串值；使用显式 migration 和对账工具，不在启动时隐式改表。 |
| JWT | 强制 `kid/iss/aud/exp/iat/jti` |
| API 契约 | MVP 以 OpenAPI 和现有 REST 兼容契约为真源；Post-MVP 的 OIDC endpoint 遵循标准协议，不自行定义 DTO。 |
| OTP | 不使用 Challenge Token；按 `client + purpose + channel + normalized identifier` 保存唯一活跃验证码，只允许最后发送的 OTP，有效码只存哈希。 |

### 2.1 MVP 范围

- PostgreSQL schema、Repository、migration、全量数据迁移、对账和整体切换。
- Monorepo、旧 Auth 保持可运行。
- Platform、Account、Credential、Client、Session、Token、Verification、Audit 最小能力。
- 密码、Email/SMS OTP、极光一键登录。
- 现有第三方 OAuth 登录兼容，不在本期建设通用 Federation 平台。
- 已确认使用的 Legacy REST、SDK 和错误码。
- Haivivi 人员及设备 Session、UAT、MQTT ACL Token。
- 改造完成后的首个项目集成目标为 Mekong；Haivivi 在 Mekong 验证通过后再接入。
- KYC 保持现有 provider 行为，补必要的加密、脱敏和审计，不重做业务流程。
- 最小 Playground、consumer e2e、数据迁移和整体上线切换。
- 标准 JWT claims 和简单 JWKS；不实现完整 OIDC Provider。

### 2.2 Post-MVP 范围

- OIDC Discovery、Authorization Code + PKCE、Hosted Login。
- 标准 Client Credentials Grant、userinfo、introspection、revocation、标准 logout。
- OIDC conformance/互操作测试。
- 通用 Federation 配置、账号 linking policy 和 provider 管理。
- KYC 完整流程、数据模型及独立合规域重设计。
- Namespace/Group/复杂授权的独立服务化。
- 完整 Audit outbox、SIEM/消息队列集成。
- Client 管理 UI、高级密钥/KMS 自动轮换。

### 2.3 MVP 优先级

1. **P0：PostgreSQL 落地**：schema、约束、Repository、migration、全量数据迁移和对账。
2. **P0：行为兼容与整体上线**：已确认调用方、Token/Session、设备协议和旧 SDK 通过回归。
3. **P1：必要安全基线**：密码哈希、credential/refresh 哈希、JWT 验签边界和审计。
4. **P2：模块梳理与精简**：只做支持数据 ownership、测试隔离和后续维护所需的拆分。

发生进度冲突时，以 PostgreSQL 数据正确性和现有行为兼容为准；不为了完成理想模块结构延迟 MVP 上线。

## 3. Monorepo 结构

```text
.
├── apps/
│   ├── auth/                       # 旧 Auth，不运行、不发布、仅作为参考
│   ├── stargate-next/              # 新 Auth
│   │   ├── src/
│   │   │   ├── bootstrap/
│   │   │   ├── platform/
│   │   │   ├── modules/
│   │   │   ├── protocols/
│   │   │   └── main.ts
│   │   ├── migrations/
│   │   └── test/
│   └── playground/                 # 测试用业务客户端、登录 UI、Token/Session 调试
├── packages/
│   ├── stargate-contracts/         # 错误码、公共类型、OpenAPI 快照；不放业务实现
│   ├── stargate-next-sdk/          # 从 stargate-next OpenAPI 自动生成
│   ├── config/                     # monorepo 配置加载和校验
│   ├── eslint-config/
│   └── typescript-config/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

约束：

- `apps/stargate-next` 不 import `apps/auth` 的源码。
- 旧实现只作为行为参考和回归基线；可复用的仅是经过重新定义的契约和测试用例。
- 不为了“复用”过早把领域模块移动到 `packages`。只有两个以上应用真正共同使用的稳定代码才抽包。
- `apps/playground` 必须通过生成的 `packages/stargate-next-sdk` 调用 `stargate-next`，不手写与实现耦合的 HTTP 请求。

## 4. `stargate-next` 模块划分

### 4.1 PlatformModule

功能：

- 配置校验、数据库、Redis、日志、Trace、指标、健康检查。
- 全局异常和错误码映射、请求 ID、审计上下文。
- 时钟、随机数、哈希、加密、KMS/Secret Provider 等基础端口。

要求：

- 生产配置缺少数据库、签名密钥、issuer、API client credential 时启动失败。
- `/live` 只检查进程，`/ready` 检查数据库、Redis 和签名能力。
- 不提供业务逻辑。

### 4.2 ClientModule

功能：

- 管理 Application/Client、redirect URI、allowed grant、audience、scope。
- 管理 confidential client credential，凭据只显示一次并哈希保存。
- 替换当前单一全局 `x-api-key`；兼容期可通过 LegacyClientAdapter 映射旧 key。

主要数据：

- `clients`
- `client_redirect_uris`
- `client_credentials`
- `client_allowed_scopes`

### 4.3 AccountModule

功能：

- 维护稳定 `sub`、账户状态、账户类型和登录标识。
- Username、Email、Phone 的标准化、唯一性、verified 状态。
- 创建、禁用、恢复、删除账户；账户删除不隐式删除业务 Profile。
- 提供严格区分 self-service 与 admin 的查询/修改接口。

Auth 拥有字段：

- `id/sub`
- 写入前规范化并直接唯一的 `username/email/phone`
- 当前密码的 algorithm、hash、salt、changedAt
- `active/status/type`
- 安全时间戳

不拥有：

- avatar、birthday、intro、level、inviter、业务 labels、积分和业务地区。

### 4.4 CredentialModule

功能：

- 密码创建、验证、修改、重置和凭证版本。
- MVP 沿用 salted MD5；Argon2id 参数治理和渐进升级进入 Post-MVP。
- 旧 MD5 verifier 与登录成功 rehash。
- 改密后按策略撤销旧 Session。

主要数据：

- 当前密码字段直接存于 `accounts`
- `credential_history`（确有策略需求后再启用）

### 4.5 VerificationModule

功能：

- Email/SMS OTP 的创建、发送请求、校验、消费、重发和频率限制。
- Purpose 至少包含 `LOGIN`、`REGISTER`、`RESET_PASSWORD`、`UPDATE_EMAIL`、`UPDATE_PHONE`、`ACTIVATE_ACCOUNT`。
- 不使用 Challenge Token；服务端按复合维度定位唯一活跃 verification。
- 重发使旧 OTP 失效；验证成功原子消费。

主要数据/状态：

- Redis key：`verification:{clientId}:{purpose}:{channel}:{identifierHash}`
- code hash、expireAt、attempts、resendCount、status、发送 metadata。

API 原则：

- 生产接口不返回明文 code。
- 不再暴露 list/get/update/delete 原始 CRUD。
- 本地测试通过 provider mock/固定注入获得验证码，不通过生产响应泄露。
- Haivivi 当前对 Captcha list/delete/code 的依赖由 LegacyCompatModule 暂时适配，并设置下线条件。

### 4.6 AuthenticationModule

功能：

- 统一编排所有登录方式，不持久化 provider-specific 数据。
- 密码登录。
- Email/SMS passwordless。
- 极光手机号一键登录。
- 第三方 OAuth/OIDC 登录。
- 账户状态、Client policy、风险控制和自动注册策略统一执行。
- 认证成功后调用 SessionModule，不直接签 JWT。

原则：

- 登录方式与 MFA factor 分开建模。
- 所有方式统一处理 active/client/audience。
- 自动注册必须由 Client policy 显式允许。

### 4.7 FederationModule

功能：

- MVP 只兼容现有外部 OAuth provider、state/nonce/PKCE、回调和账号绑定。
- 保存 `provider + providerSubject → accountId` 映射。
- 外部 access/refresh token 如必须持久化，使用 envelope encryption，并记录轮换和用途。
- 绑定/解绑要求重新认证，禁止移除最后一种可登录凭证。

Post-MVP：

- 通用 Federation 配置平台、provider 管理、复杂 mapper 和 linking policy。

主要数据：

- `external_identities`
- `external_tokens`（仅确有业务需要时）

### 4.8 SessionModule

功能：

- 人员 Session、Refresh Token family、轮换、撤销和重放检测。
- 按 user/client/device 查询和批量下线。
- Refresh Token 只存哈希。
- 明确 `subjectType = ACCOUNT | DEVICE | SERVICE`，不再通过 `source` 隐式推断语义。

主要数据：

- `sessions`
- `refresh_tokens`

### 4.9 TokenModule

功能：

- MVP Access Token 签发；OIDC ID Token 放到 Post-MVP。
- issuer/audience/scope/role/ACL claim 规则。
- `kid` 和签名密钥轮换。
- MVP 提供 JWKS 和内部撤销能力；introspection、userinfo 和标准 revocation endpoint 放到 Post-MVP。
- 受限 Token policy：pairing UAT、MQTT observer、push、admin impersonation。

原则：

- `purpose` 必填，禁止继续使用一个无语义的通用 `signToken`。
- pairing/MQTT 与 admin impersonation 使用不同 policy、audience、TTL 和审计规则。
- 管理员代签必须记录 actor、subject、reason。

### 4.10 AuthorizationModule

功能：

- Client scope、账户粗粒度 role、Token claim 计算。
- 兼容现有 `users.roles` 字符串，例如 Haivivi `sys:root`、`biz:user`。
- 不实现完整业务权限目录。
- 不读取 Namespace/Group collection 计算复杂业务权限。

边界：

- Haivivi Admin 的 `RoleToPermissions` 仍由 Haivivi 管理。
- Namespace/group 权限在迁移期通过 LegacyClaimsProvider 读取快照；长期转 Organization/Authorization 服务。

### 4.11 DeviceCredentialModule

功能：

- 显式承接 Haivivi 设备 Session 和 Token，而不是伪装成人员账号。
- 保持 EID key、device ID subject、TTL、ACL、refresh、解绑撤销语义。
- 配对 UAT、设备 MQTT Token、App observer Token。
- 为 legacy palgear/aiot 和 v2 device-auth 提供兼容 use case。

原则：

- Device 不要求在 Account 表中存在。
- Device Repository 通过 port 调用 Haivivi，或只接收已验证的 device principal；Auth 不拥有设备业务主数据。
- 设备协议完成迁移前，不修改现有 Token claims 和 ACL 语义。

### 4.12 IdentityVerificationModule

功能：

- MVP 保持阿里云/火山引擎实名 provider adapter 和旧接口兼容。
- 核验请求、最小化结果、访问审计、幂等和 provider 超时治理。

边界：

- KYC owner 未确认前作为可替换模块存在。
- 身份证号加密/脱敏，禁止进入 JWT、日志和通用 Account 响应。
- Auth 最多保存核验状态和外部 reference；完整合规数据优先迁到 KYC 域。
- KYC 流程和完整数据模型重设计放到 Post-MVP。

### 4.13 NotificationPort

功能：

- 仅定义身份生命周期通知：OTP、激活、重置密码、安全告警。
- 请求使用 purpose + template data，不接受任意 sign/template/from/subject/content。
- 实现可连接独立 Notification 服务；开发环境使用 console/mailbox provider。

不实现：

- 通用短信/邮件发送 API。
- 消息正文 CRUD 和业务消息审计库。

### 4.14 AuditModule

功能：

- 记录 login success/failure、lock、OTP、注册、改密、绑定、refresh reuse、revoke、impersonation、管理操作。
- 区分 actor、subject、client、requestId、IP、userAgent、result、reason。
- 安全事件不可由普通业务 API 修改或删除。
- MVP 先实现可查询的结构化审计记录；outbox、SIEM 和消息队列集成放到 Post-MVP。

### 4.15 OidcProtocolModule（Post-MVP）

功能：

- Discovery、JWKS。
- Authorization Code + PKCE。
- Client Credentials。
- Token、revocation、introspection、userinfo、标准 logout。
- Hosted Login 的认证事务接口。

限制：

- 不支持 Implicit Grant。
- 不新增 Resource Owner Password Grant；旧密码登录仅存在于 Legacy REST。
- 标准协议必须通过 OIDC conformance/互操作测试，不以 Playground 手工成功作为唯一验收。

### 4.16 LegacyCompatModule

功能：

- 实现调用方确认仍在使用的旧路由、DTO、错误码和响应形状。
- 映射 v0/v1/v2、旧 SDK、Haivivi `/auth/v1` 兼容行为。
- 为 Captcha raw API、Session raw API、`@signToken` 提供有期限的适配。
- 每个兼容 endpoint 输出调用 client、次数和 deprecation 指标。

原则：

- 兼容 Controller 不拥有领域逻辑。
- 不实现 `/cleanup`。
- 每个 legacy 能力必须有 owner、测试和下线条件。

## 5. 数据模型与所有权

建议的核心表/集合：

| 数据 | Owner | 说明 |
| --- | --- | --- |
| accounts | AccountModule/CredentialModule | 稳定主体、状态、写入前规范化并直接唯一的 username/email/phone，以及当前 salted MD5 hash、algorithm、changedAt。 |
| external_identities | FederationModule | provider subject 与 account 映射。 |
| clients/client_credentials | ClientModule | 应用和服务身份。 |
| sessions/refresh_tokens | SessionModule | subjectType、client、family、hash、revoke。 |
| role_assignments | AuthorizationModule | 仅粗粒度角色字符串。 |
| audit_events | AuditModule | MVP 安全审计。Post-MVP 再增加 outbox 和可靠事件投递。 |
| signing_key_metadata | TokenModule | 只保存 metadata；私钥由 KMS/Secret Provider 管理。 |
| verification state | VerificationModule/Redis | 短期 OTP 和次数限制。 |

迁移期可增加 `legacy_metadata`，但必须：

- 只读或由兼容层写入。
- 不作为新业务功能的数据源。
- 每个字段有删除条件。

## 6. Playground 规划

`apps/playground` 同时扮演测试用业务客户端和人工调试台，至少包含：

1. Client/环境选择。
2. 密码登录。
3. Email/SMS OTP 发送和登录。
4. 一键登录 mock。
5. 现有第三方 OAuth provider mock 与回调。
6. Token 解码：header、claims、audience、scope、TTL。
7. Refresh、轮换、reuse、logout、批量撤销。
8. Account 创建、禁用、改密、删除。
9. Device Session、UAT、MQTT ACL Token。
10. Admin impersonation 与审计查看。
11. 错误场景：错误 OTP、过期、重放、禁用账号、错误 audience、无 scope。

Post-MVP 再增加 OIDC Authorization Code + PKCE、Hosted Login 和标准依赖认证方场景。

测试约束：

- Playground 不保存 client secret 到浏览器。
- 只允许连接明确标记的开发/测试环境。
- PostgreSQL 仅供 `stargate-next` 的账户、凭证、Session、审计和其他认证域数据使用；Playground 不创建或写入 PostgreSQL schema。
- Playground 的短期模拟和验收数据只使用进程内内存或 Redis，必须支持 TTL 或显式 reset，不作为长期事实来源或迁移目标。
- Playwright 覆盖关键浏览器流程。
- 测试验证码通过 test-only mailbox/provider 获取，不从生产 API 响应读取。

## 7. 工作流与实现顺序

> 本节中的 Phase 是能力验收里程碑，不代表所有任务必须完全串行。实际执行采用“共享契约先冻结、领域工作流并行、按 Wave 集成”的方式。

### 7.1 六条工作流

#### Workstream A：平台与数据

负责：

- PostgreSQL schema、约束、索引、Repository 规范和 migration。
- MongoDB 数据预检、全量迁移、对账、回滚脚本和切换 runbook。
- Monorepo、CI、配置、Redis、日志和健康检查。
- 最小 Audit、部署和本地开发环境。

主要交付：PostgreSQL 数据骨架、迁移工具、PlatformModule、CI 门禁。建议 2 人；schema 和 migration 必须由单一 Owner 审核。

#### Workstream B：Account 与 Credential

负责：

- Account、identifier、账户状态。
- salted MD5 兼容、改密和重置；Argon2id 后移。
- Account/Profile 字段边界和账户数据迁移。

主要交付：AccountModule、CredentialModule。建议 1 人，Account schema 由该工作流单一 Owner 审核。

#### Workstream C：Client、Token 与 Session

负责：

- Client、credential、scope、audience。
- JWT/JWKS、密钥轮换、Refresh rotation/reuse detection。

主要交付：ClientModule、SessionModule、TokenModule。建议 1～2 人；JWT claims 和 Refresh 状态机必须保持单一 Owner。

#### Workstream D：Verification 与外部认证

负责：

- Email/SMS OTP、NotificationPort。
- 极光一键登录、现有 OAuth 登录兼容。
- KYC provider 兼容和认证流程编排。

主要交付：VerificationModule、AuthenticationModule、FederationModule、IdentityVerificationModule。建议 1 人。

#### Workstream E：Legacy 与设备兼容

负责：

- 旧 Auth 和 Mekong tests，先完成 Mekong 集成。
- Mekong 验证通过后再补 Adventurer、Haivivi tests。
- Haivivi Device Session、UAT、MQTT ACL Token。

主要交付：LegacyCompatModule、DeviceCredentialModule、迁移兼容矩阵。建议 1 人。

#### Workstream F：Playground 与质量

负责：

- Playground 页面和生成 SDK 集成。
- Mock provider、Playwright、OpenAPI breaking check。
- Consumer e2e、安全和并发测试。

主要交付：`apps/playground`、`auth-testkit`、端到端回归集。建议 1 人。

人员较少时的合并方式：

- 4 人：A；B+D；C；E+F。
- 6～8 人：按六条工作流配置，A/C 各可增加一人。

### 7.2 Wave 并行安排

#### Wave 0：共享契约

- Account ID、identifier 和账户状态模型。
- Client、scope、audience 和 redirect URI。
- JWT claims、签名算法和 key rotation 规则。
- Session/Refresh 状态机。
- OTP purpose、唯一活跃验证码和失效规则。
- 领域错误码、Repository/Provider Port。
- 首批 Legacy 路由、DTO、响应 fixture。
- Mongo collection → PostgreSQL table/column 映射、数据保留范围和约束冲突处理规则。

#### Wave 1：基础能力并行

- A：PostgreSQL schema/migration、Mongo 迁移预检、Monorepo、CI、Redis、Audit。
- B：Account/Credential 、API自动化测试。
- C：Client、JWT/JWKS、Session 状态机、单测。
- D：OTP 状态机、provider port、fake provider。
- E：旧 Auth/Mekong 契约测试；并行准备 Haivivi 设备协议 fixture。
- F：基于 mock SDK 搭建 Playground 和 Playwright 框架。

各工作流通过 Port/Fake 开发，不等待真实基础设施或其他模块全部完成。

#### Wave 2：核心纵向切片并行

- B：账户创建、密码验证、旧 hash 升级、改密。
- C：Client 鉴权、Token 签发、refresh、logout。
- D：OTP 创建/验证/消费和测试通知 provider。
- E：user/password/session 首批兼容 Controller。
- F：密码登录、Token 查看、refresh/logout e2e。
- A：Mongo 核心 collection 数据预检、PostgreSQL migration 和对账工具。

集成门禁：完成 `Playground → 密码登录 → Session → JWT → Refresh → Logout` 第一条贯通链路。

#### Wave 3：扩展流程并行

- D：Email/SMS、极光、OAuth、KYC。
- E：设备 Session、UAT、MQTT ACL 和 Legacy `signToken`。
- C：JWT/JWKS、Refresh 和 Client policy 加固。
- F：为每个流程同步增加 Playground 和 consumer e2e。
- A/B：全量 PostgreSQL 迁移、数据对账、停机窗口和整体切换脚本。

Client、Token、claims 的变更由 Workstream C 统一审核；完整 OIDC 不进入本期 Wave。

#### Wave 4：集成、加固和整体上线

- 先完成 Mekong 的 SDK/API 集成、consumer e2e 和测试环境验收。
- Mekong 通过后，再完成 Adventurer 集成。
- 最后完成 Haivivi Admin、Haivivi API 人员认证和 Device Auth 联合验收。
- 安全、性能、数据迁移和故障演练。
- 在预发布环境完整演练一次停写、迁移、对账、路由切换和回滚。

说明：Mekong 优先指开发和验收顺序，不是生产灰度。所有确认调用方和协议仍需同时通过验收后整体上线，不安排按 Client 或 endpoint 灰度。

### 7.3 能力验收里程碑

以下 Phase 保留为范围和验收标准，可跨 Wave 重叠执行。

#### Phase 0：契约冻结与 Monorepo 搭建

工作：

1. 将现有应用原样移动到 `apps/auth`，保证 build/test/docker 行为不变。
2. 建立 pnpm workspace、共享 TypeScript/ESLint 配置。
3. 创建 `apps/stargate-next`、`apps/playground` 空壳。
4. 保存旧 OpenAPI、错误码、JWT claims 和关键响应 fixture。
5. 先整理 Mekong 关键调用和 e2e fixture，再补 Adventurer、Haivivi legacy 兼容矩阵。

验收：

- `apps/auth` 的单测/e2e 与迁移目录前一致。
- 根目录可以独立 build/test 三个 app。
- 兼容矩阵中的每个能力都有调用方和测试 owner。

#### Phase 1：平台、安全基线和数据骨架

实现顺序：

1. PlatformModule。
2. PostgreSQL schema、唯一/外键/检查约束与 Repository 规范。
3. MongoDB → PostgreSQL migration、预检和对账框架。
4. AuditModule。
5. TokenModule 的密钥/JWKS 基础。
6. ClientModule。

验收：

- 空库可重复执行 migration；存量脱敏数据可迁移、对账和回滚。
- 迁移范围内的 Mongo document 均能追踪到 PostgreSQL 记录，ID 和业务唯一性不变。
- 配置 fail-fast、健康检查、结构化日志、审计事件可用。
- RS256 `kid` 和 JWKS 可轮换测试。
- 不再使用全局默认 API Key；测试 client 使用独立 credential/scope。

#### Phase 2：Account、Credential 与人员 Session

实现顺序：

1. AccountModule。
2. CredentialModule。
3. SessionModule。
4. AuthenticationModule 的密码登录。
5. Playground 密码登录、refresh、logout。

验收：

- 新账户暂时使用 salted MD5。
- 旧 MD5 账户可登录并自动升级 hash。
- Refresh rotation/reuse detection、改密撤销、禁用账号立即阻止 refresh。
- Access Token 包含标准 `iss/aud/sub/client_id/scope`。

#### Phase 3：验证码与登录方式

实现顺序：

1. VerificationModule。
2. NotificationPort 及测试 provider。
3. Email/SMS passwordless。
4. 极光一键登录。
5. FederationModule。
6. IdentityVerificationModule。

验收：

- 同一 client/purpose/identifier 仅最后 OTP 有效。
- OTP 只存 hash，具备过期、原子消费、尝试和发送限流。
- 所有登录方式执行相同账户状态和 Client policy。
- Playground 覆盖成功、错误、过期、重发、并发与 provider 失败。

#### Phase 4：Legacy 人员接口兼容

工作：

1. 实现已确认使用的 login/register/user/password/captcha/session 路由。
2. 保持 SDK 需要的 DTO、错误码和响应字段。
3. 生成 `packages/stargate-next-sdk`。
4. 对旧 Auth 和 stargate-next 运行同一套 characterization tests。

验收：

- Haivivi Admin 登录、系统账号、激活和改密通过。
- Haivivi API 的 `/auth/v1/me` 主流程通过。
- 未实现接口返回明确 deprecation/unsupported，不静默改变语义。

#### Phase 5：设备凭证与受限 Token

实现顺序：

1. DeviceCredentialModule。
2. pairing UAT。
3. Device/App MQTT ACL Token。
4. Legacy `signToken` policy adapter。
5. 设备 Session 数据迁移/兼容工具。

验收：

- Haivivi legacy palgear/aiot、palapp 和 v2 device-auth 全部通过。
- EID key、device subject、ACL、TTL、refresh、解绑撤销保持兼容。
- 设备 Token 与管理员 impersonation 无法互换 audience/purpose。

#### Phase 6：权限兼容与外围收口

工作：

1. 固化 role/scope claim，提供 LegacyClaimsProvider。
2. 将 Namespace/Group 依赖隔离到 LegacyClaimsProvider，MVP 不迁移其数据和业务规则。
3. 身份短信/邮件切换到 purpose 化 Notification。
4. 确认 KYC owner。
5. stargate-next 不实现字典、报表、消息记录和未使用原始 CRUD；旧接口等调用量归零后再删除。

验收：

- Haivivi Admin 本地 RoleToPermissions 和 API `sys:root` 不受影响。
- Token 体积和 claim 来源可追踪。
- Auth 数据模型不再新增业务 Profile/Organization 字段。
- Namespace/Group 完整拆分不作为 MVP 上线门禁。

#### Phase 7：迁移与整体切换

不按 Client 或 endpoint 分批，使用明确维护窗口一次性切换：

1. 上线前完成账户、标识、Session 和设备数据预检，保持原 ID 和协议语义。
2. 在预发布环境使用生产规模脱敏数据完成 MongoDB → PostgreSQL 全量迁移、约束冲突处理、对账和回滚演练。
3. 进入维护窗口，停止旧 Auth 写入和 Token/Session 签发。
4. 执行最终 MongoDB → PostgreSQL 数据迁移，并对账 username/email/phone/identity、Session 和设备引用。
5. 部署 stargate-next，同时切换 Mekong、Adventurer、Haivivi Admin/API/Device 和旧 SDK 的路由与配置。
6. 执行人员登录、OTP、refresh/logout、设备 UAT/MQTT、KYC 和第三方登录 smoke test。
7. 验收失败则在维护窗口内整体回滚应用、路由和数据；禁止新旧服务混合承接流量。
8. 验收通过后开放流量，旧 Auth 保持停止状态，仅作为限时回滚备份。
9. 超过回滚窗口且运行稳定后归档 `apps/auth`。

禁止：

- 新旧 Auth 同时签发 Token/Session 或按 Client 分流。
- 整体切换后让 login、refresh、logout 落到不同版本。
- 未确认算法时复制 HS256 secret。
- 对 OTP、短信、邮件或 Session 进行双写。
- 迁移期间改变 userId、设备 subject 或 JWT ACL 语义。

### 7.4 协作与合并规则

必须设置单一 Owner、不得由多组并行修改：

- Account schema 和 identifier 标准化。
- JWT claims、issuer/audience 和签名策略。
- Refresh Token 状态机。
- OTP purpose、查找维度和失效规则。
- 领域错误码与 Legacy 响应格式。
- migration 和签名密钥管理。

并行开发规则：

- 每条工作流按模块目录负责 domain、repository、application service 和测试，避免按 Controller/Service/Repository 横向拆给不同人员。
- 共享接口先进入 `stargate-contracts` 或模块公开 port，再由其他工作流基于 Fake 开发。
- 使用短分支和 feature flag，持续合并主干，不维护长期“平台分支”“登录分支”。
- 每个 PR 只跨一个主要模块；跨模块契约变更必须由双方 Owner 共同审核。
- Wave 结束执行集成门禁；未通过时停止扩大新功能范围，优先修复契约和兼容问题。
- 进度按“可独立验收的纵向能力”汇报，不以创建大量未集成任务作为并行度指标。

## 8. 测试与质量门禁

### 8.1 测试层次

- Domain unit：状态机、策略、过期、权限和错误码。
- Repository integration：唯一约束、事务、并发消费。
- Provider contract：SMS、Email、极光、OAuth、KYC。
- Security：OTP brute force、refresh replay、JWT alg/aud/iss、越权 Client、账号枚举。
- Browser e2e：Playground + Playwright。

### 8.2 必须覆盖的并发场景

- 同一手机号并发注册。
- OTP 重发与旧码同时验证。
- OTP 被两个请求同时消费。
- Refresh Token 并发轮换和重放。
- 改密与 refresh 并发。
- 账户禁用与登录并发。
- 同一 EID 创建/更新设备 Session。
- signing key 轮换期间新旧 Token 验签。

### 8.3 CI 门禁

- format、lint、strict typecheck。
- unit/integration/e2e。
- OpenAPI breaking-change 检查。
- migration up/down 和空库/存量库测试。
- secret scan、dependency audit、容器漏洞扫描。
- stargate-next 不得 import legacy app 源码的边界检查。

## 9. Post-MVP 路线

以下能力不进入本期交付和整体上线门禁。MVP 的模块边界需要为其预留扩展点，但不得提前实现完整功能。

### 9.1 OIDC 标准协议

实现顺序：

1. Discovery 与 OIDC metadata。
2. Authorization transaction 与 Hosted Login。
3. Authorization Code + PKCE。
4. 标准 Client Credentials Grant。
5. userinfo、introspection、revocation 和标准 logout。
6. Playground 作为标准依赖认证方完成端到端测试。
7. 通过选定的 OIDC conformance/互操作测试。

约束：

- 不支持 Implicit Grant。
- 不新增 Resource Owner Password Grant。
- OIDC 完成前，新应用仍只能使用明确登记的兼容 REST 契约，不能把私有接口宣传为标准 OIDC。

### 9.2 领域与平台增强

1. 将现有 OAuth 兼容模块升级为通用 Federation 配置和 provider 管理平台。
2. 完成 KYC owner、流程、数据留存和独立合规域重设计。
3. 将 Namespace/Group/复杂资源授权迁到独立 Organization/Authorization 服务，并删除 LegacyClaimsProvider。
4. 为 Audit 增加 outbox、可靠投递、SIEM 和消息队列集成。
5. 增加 Client 管理 UI、细粒度管理员权限和 KMS 自动轮换。

进入 Post-MVP 的前提：

- Mekong、Adventurer、Haivivi Admin/人员认证/设备认证已完成整体上线并稳定运行。
- 旧 Auth 已停止新增调用方，核心兼容接口有调用量基线。
- MVP 安全、并发、迁移和回滚门禁全部通过。
- Post-MVP 能力有明确调用方、owner 和验收标准。

## 10. 首批交付物

建议第一个可评审里程碑只包含：

1. Monorepo 目录调整，旧 Auth 行为不变。
2. `stargate-next` Platform、Client、Account、Credential、Session、Token、Audit 骨架。
3. PostgreSQL/Redis 本地开发环境，以及 MongoDB 迁移源 fixture。
4. 密码登录、refresh、logout、JWKS。
5. Playground 密码登录和 Token 查看。
6. Post-MVP 增加旧 MD5 → Argon2id 渐进迁移测试。
7. OpenAPI、SDK 生成和最小 CI。

OTP、极光、现有 OAuth/KYC 兼容和设备 Token 在骨架验证后按 Phase 3～5 进入；完整 OIDC 仅在 MVP 整体上线并稳定运行后进入 Post-MVP。

## 11. 编码前决策清单

- [ ] Mongo collection → PostgreSQL table/column 映射与数据保留范围。
- [ ] PostgreSQL 主键、唯一约束、外键、事务边界和 ID 兼容策略。
- [ ] 全量迁移时长、维护窗口、对账阈值和整体回滚条件。
- [ ] 初始 issuer、audience、域名和 API prefix。
- [ ] 首批 Client 与各自 scope、redirect URI、JWT 算法。
- [ ] Account 与 Profile 字段 owner，尤其 phone/email/name/identityVerified。
- [ ] Haivivi 设备 Token claims、ACL、TTL 和 EMQX 验签配置。
- [ ] KYC owner 与身份证数据留存要求。
- [ ] Notification 服务是否已有可用接口。
