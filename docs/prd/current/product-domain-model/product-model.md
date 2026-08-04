# 产品模型

## 1. 产品定位

Stargate Next 是面向内部业务应用的统一身份认证服务。它只负责回答“用户是谁、是否可以登录、当前会话是否有效”，不负责回答“用户属于哪个组织、拥有什么业务角色和权限”。

本期产品以 Mekong 为首个集成对象，通过拆分旧 Auth 的身份数据与业务数据，完成以下目标：

- 以 PostgreSQL 承载账户、密码凭证、Session 和最小认证审计。
- 为业务应用提供稳定、精简的认证 API 与生成式 SDK。
- 让业务授权脱离 JWT，由 Mekong 根据 `accountId` 实时加载 Profile、组织和权限。
- 先通过 Playground 模拟 Mekong 完成独立验收，再接入真实 Mekong。
- 在维护窗口内完成整体替换，接受旧 Session 全部失效。

## 2. 产品问题

旧 Auth 同时承载身份、用户资料、组织和权限，导致：

- Auth 与 Mekong 的数据所有权不清晰。
- JWT 携带组织、角色和权限，授权变更不能自然即时生效。
- 业务应用依赖旧 Auth 的 User、Namespace、Role、Permission 接口。
- MongoDB 数据难以按清晰边界迁移到 PostgreSQL。
- 调用方依赖手写或旧版客户端，接口契约容易漂移。

Stargate Next 通过“身份认证与业务授权分离”解决这些问题。

## 3. 产品原则

1. **身份与业务分离**：Stargate Next 拥有认证事实，Mekong 拥有业务用户与授权事实。
2. **稳定标识关联**：两侧只通过稳定的 `accountId` 关联，不共享 ORM 模型或写路径。
3. **JWT 最小化**：JWT 只表达租户、账户与会话身份，不携带业务授权快照。
4. **授权实时生效**：组织、角色和直接权限变更后，无需重新登录或重新签发 JWT。
5. **契约优先**：OpenAPI 是公开接口的唯一契约来源，Playground 和 Mekong 通过生成的 SDK 调用。
6. **安全默认**：密码、Captcha、Refresh Key、日志和审计均遵循最小暴露原则。
7. **整体切换**：不长期双写，不允许新旧 Auth 同时签发 Session。
8. **渐进交付**：先完成认证核心和 Playground 自验收，再进行真实 Mekong 集成与数据迁移。

## 4. 用户与参与者

### 4.1 终端用户

使用 `bus-admin-web` 的人员。核心诉求是稳定登录、刷新会话、退出，并按最新业务权限访问功能和数据。

### 4.2 业务管理员

在 Mekong 中管理用户、组织、角色和权限。核心诉求包括：

- 创建、禁用、删除用户和修改密码。
- 管理组织树及用户归属。
- 调整角色或直接权限并立即生效。
- 查看账户状态并撤销用户 Session。

### 4.3 业务应用

MVP 调用方为 `bus-admin-web`。它消费 Stargate Next 的身份能力，并从 Mekong 获取 Profile 和授权上下文。

### 4.4 开发与测试人员

通过 Playground、SDK、OpenAPI 和黑盒测试验证登录、会话、账户管理以及身份与授权拆分是否正确。

### 4.5 运维与安全人员

负责配置认证服务、检查健康状态、轮换密钥、审计认证事件，并在维护窗口执行迁移、切换或回滚。

## 5. 核心产品对象

| 对象 | 所有者 | 产品含义 |
| --- | --- | --- |
| Tenant | Stargate Next | 认证数据的逻辑隔离边界；不是业务组织或授权对象。 |
| Tenant API Key | Stargate Next | 固定归属一个 Tenant 的服务凭证；明文只在创建时返回一次。 |
| Account | Stargate Next | 可被认证的稳定人员主体，包含登录标识与状态。 |
| Credential | Stargate Next | Account 的当前密码凭证及修改时间。 |
| Captcha | Stargate Next / Redis | 登录前使用的短期、一次性人机校验。 |
| Session | Stargate Next | Account 的可刷新登录会话。 |
| Access Token | Stargate Next | 表达 `tenantId`、`accountId` 与 `sessionId` 的短期访问凭证。 |
| Auth Audit Event | Stargate Next | 登录、刷新、退出、账户和凭证操作的最小安全审计。 |
| User Profile | Mekong | 与 Account 关联的业务展示资料；Phase A 由 Playground 模拟。 |
| Organization | Mekong | 业务组织树及数据范围；Phase A 由 Playground 模拟。 |
| Membership | Mekong | 用户的主组织归属。 |
| Role / Permission | Mekong | 业务角色、角色权限映射和直接授权。 |
| Authorization Context | Mekong | 根据 Profile、组织、角色和直接权限实时计算出的业务授权上下文。 |

## 6. 数据与职责边界

### 6.1 Stargate Next 拥有

- Tenant 的稳定 `tenantId`、展示名称与 `active` / `disabled` 状态。
- Tenant API Key 的 HMAC 摘要、归属与展示元数据；不保存 Key 明文。
- `accountId`，由 Stargate Next 生成，默认使用 CUID。
- 账户状态：`active`、`disabled` 及软删除状态。
- 登录标识：username、登录用途的 phone/email。
- 当前密码凭证。
- Session 与 Refresh Key 哈希。
- Captcha、登录失败限制等短期认证状态。
- 最小认证审计。

登录标识规则（唯一性均以 Tenant 为边界）：

- username 必须以字母开头，不含@等特殊符号，写入前 `trim` 并转为 lowercase。
- email 必须符合邮箱格式，写入前 `trim` 并转为 lowercase。
- phone 写入前 `trim`，并匹配 `^\+?\d+$`；不推断国家码，不自动增删 `+`。

### 6.2 Mekong 拥有

- 最小 User Profile；当前确认至少包含 `name`。
- Organization 和用户主组织归属。
- Role、RoleToPermissions、直接 Permission 和数据范围。
- 创建、禁用、改密、删除用户时的业务编排。

登录 phone/email 与业务联系方式语义独立。若同一个值同时承担两种用途，调用方必须显式更新两侧，任何一侧都不是另一侧的隐式副本。

### 6.3 明确禁止

Stargate Next 的 PostgreSQL 不得保存：

- Profile 展示字段。
- Organization 或 Membership。
- Role、Permission 或数据范围。
- Playground mock 数据。

Playground mock 数据只能保存在进程内或带独立前缀、TTL 和 reset 能力的 Redis 中，不是长期事实来源或迁移目标。

## 7. 核心用户场景

### 7.1 登录并加载业务权限

1. 用户请求并提交 Captcha。
2. 用户使用 username、phone 或 email 与密码登录。
3. Stargate Next 在同一 Tenant 内校验 Captcha、账户状态和密码，创建 Session。
4. Stargate Next 返回 `tenantId`、`accountId`、`sessionId`、Access Token 和 Refresh Key。
5. 业务应用从 JWT 获得 `{ tenantId, accountId, sessionId }` 身份信息。
6. 业务应用按 `accountId` 从 Mekong 加载 Profile、组织和授权上下文。
7. 页面或业务操作根据实时权限决定是否允许访问。

最小价值链路：

`login -> slim JWT -> profile/authorization lookup -> permission calculation -> protected page or action`

### 7.2 刷新与退出

- Refresh 校验 Refresh Key、Session 和 Account 状态，签发新的 Access Token。
- 当前 MVP 保持原 Refresh Key 和 `sessionId`，不延长或更新 Session。
- Logout 删除当前 Session。
- 管理员可撤销账户的全部 Session。
- Session 被删除、过期，或 Account 被禁用、删除后，不得继续 Refresh。
- 已签发 Access Token 可使用至自身过期，不执行逐请求 Session introspection。

### 7.3 管理账户

业务管理员可通过业务编排完成：

- 创建 Account，再创建 Mekong Profile 和授权数据。
- 查询或批量查询 Account 状态。
- 修改 username、登录 phone/email 或 active 状态。
- 通过专用接口修改密码；改密后撤销该账户全部 Session。
- 禁用 Account 并撤销全部 Session。
- 删除业务 Profile 后软删除 Account；操作支持重试并保持幂等。

### 7.4 调整业务授权

管理员只在 Mekong 修改组织、角色或直接权限。下一次业务请求重新加载授权上下文后立即生效，不修改 Stargate Next 数据，也不重新签发 JWT。

## 8. 产品能力范围

### 8.1 Phase A：Stargate Next 自验收

认证核心：

- Tenant 创建、查询、分页与状态/名称更新，以及 Tenant API Key 生命周期管理。
- Account 创建、分页查询、单个查询、批量查询、更新、软删除。
- 密码设置与修改。
- Captcha 创建、验证、过期、一次性消费、错误次数和创建频率限制。
- 登录、Refresh、Logout。
- Session 查询、单个撤销和账户级批量撤销。
- 最小认证审计。
- 健康检查与 PostgreSQL/Redis readiness。

契约与消费：

- 冻结 OpenAPI。
- 生成 `stargate-next-sdk`。
- API 黑盒测试与 SDK 契约测试。

Playground 验收：

- 模拟 Profile、Organization、Membership、Role 和 Direct Permission。
- 展示 slim Session、JWT claims 和模拟授权上下文。
- 验证受保护页面或操作。
- 验证权限变更无需重新签发 JWT。

### 8.2 Phase B：真实 Mekong 集成

- 在 Mekong 自身 PostgreSQL 落地 Profile、Organization、Membership 和授权模型。
- 接入 `bus-admin-web`。
- 将 Mekong 的 Auth client 收缩为身份能力客户端。
- 将 Session 处理收缩为 slim Session。
- 将旧 Auth 的 User、Namespace、Role、Permission 调用迁移到 Mekong。
- 完成用户创建、禁用、改密和删除的跨服务编排。

### 8.3 Phase C：迁移与上线

- 将旧 MongoDB User 数据按所有权拆分到 Auth 与 Mekong PostgreSQL。
- 不迁移旧 Session 和 Captcha，切换后要求全部用户重新登录。
- 执行预检、幂等 ETL、跨库关联校验和机器可读对账。
- 在闲时维护窗口停机整体替换。
- Auth 与 Mekong 同时切换或同时回滚，不混合运行新旧版本。

## 9. 对外身份契约

公开能力集合：

- `GET /health/live`
- `GET /health/ready`
- `POST /v1/captchas`
- `POST /v1/captchas/verify`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/accounts`
- `POST /v1/accounts`
- `GET /v1/accounts/{accountId}`
- `POST /v1/accounts/@batchGet`
- `PATCH /v1/accounts/{accountId}`
- `DELETE /v1/accounts/{accountId}`
- `POST /v1/accounts/{accountId}/password`
- `GET /v1/accounts/{accountId}/sessions`
- `DELETE /v1/accounts/{accountId}/sessions`
- `POST /v1/tenants`
- `GET /v1/tenants`
- `GET /v1/tenants/{tenantId}`
- `PATCH /v1/tenants/{tenantId}`
- `POST /v1/tenant-api-keys`
- `GET /v1/tenant-api-keys`
- `PATCH /v1/tenant-api-keys/{keyId}`
- `DELETE /v1/tenant-api-keys/{keyId}`

内部管理接口的三类凭证职责如下：

| 凭证 | Tenant 作用域 | 职责 |
| --- | --- | --- |
| `STARGATE_ADMIN_API_KEY` | 控制面无 Tenant；数据面由 `x-tenant-id` 明确选择，缺省 `default` | 管理 Tenant，并可代操作任意单一 Tenant 的数据与 API Key。 |
| `STARGATE_API_KEY` | 固定 `default` | 兼容既有调用，只管理默认租户数据。 |
| Tenant API Key | 固定为 Key 所属 Tenant | 管理同租户 Account、Session 与 Tenant API Key；不得扩权到其他 Tenant。 |

JWT 只包含：

- `sub`：`accountId`
- `sid`：`sessionId`
- `tid`：`tenantId`
- `type`
- `iat`
- `exp`

JWT 不得包含 `ns`、`roles`、`permissions` 或 `groups`。

## 10. MVP 非目标

- 不兼容旧 Auth 全部 Mekong 接口。
- 不在 Stargate Next 中实现 Profile、Organization、Role 或业务 Permission。
- 不接入 `mekong-api`。
- 不覆盖 Haivivi、Adventurer 等其他项目。
- 不迁移旧 Session、Captcha、Group、Role collection 或未确认使用的 Namespace 扩展字段。
- 不提供通用短信、邮件、字典、报表或数据清理能力。
- 不在 MVP 实现 Refresh rotation/reuse detection。
- 不在 MVP 实现 RS256、JWKS、OIDC Provider、Client Credential、OAuth/Federation、OTP 登录、KYC 或设备凭证。
- 不把 Playground mock 数据建设成生产业务服务。

## 11. 产品验收标准

### 11.1 身份认证

- Account 的规范化、唯一性、状态、改密和软删除行为符合契约。
- 正确密码、错误密码、禁用和删除账户场景均得到稳定结果。
- Captcha 具备 TTL、一次性消费、错误次数与频率限制。
- Login、Refresh、Logout 和 Session revoke 可通过真实 PostgreSQL、Redis 和运行中服务完成黑盒验收。
- API、SDK、日志和审计不泄露密码、Captcha、Token 或内部 hash。

### 11.2 身份与授权分离

- JWT 不包含 Mekong 业务字段。
- 给定 `accountId`，Playground 或 Mekong 可加载完整授权上下文。
- 没有业务 claim 时，应用仍能正确渲染页面并保护操作。
- Organization、Role 或 Direct Permission 变化无需重新签发 JWT 即可生效。

### 11.3 契约与集成

- Playground 和 Mekong 只通过生成 SDK 消费 Stargate Next。
- API 与 SDK 的写操作均通过后续查询或认证行为验证实际效果。
- `bus-admin-web` 可完成登录、Refresh、Logout 和权限加载。
- 业务模块不再从 Auth 查询 Profile、Namespace、Role 或 Permission。

### 11.4 迁移与上线

- Auth 与 Mekong PostgreSQL 使用相同数据库实例中的不同数据库。
- 每个迁移字段都有唯一目标或明确的不迁移原因。
- ETL 可重试且幂等；任何未解释差异阻止上线。
- 迁移、对账、部署、Smoke Test 和必要回滚可在维护窗口内完成。
- 切换后旧 Auth 不再承接登录、Session 或 Mekong 用户/组织写入。
