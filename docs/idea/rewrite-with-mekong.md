# Auth 重写计划：Mekong 拆分版 MVP

## 1. 计划定位

### 1.1 核心目标

本期不再以兼容 Mekong 当前全部 Auth 接口为目标，而是同时完成：

1. 将 Auth 仍应拥有的账户、凭证和 Session 数据迁移到 Auth PostgreSQL。
2. 将 User Profile、Namespace/组织树、角色和业务权限迁移到 Mekong PostgreSQL。
3. 调整 Mekong 内部调用，使其只向 `stargate-next` 请求身份认证能力。
4. 保持 Mekong 用户可登录、可管理账号、可管理组织、可执行原有权限控制。
5. 在维护窗口内整体切换，不做新旧接口长期兼容或双写。

PostgreSQL 迁移仍是 MVP 主目标；职责拆分不是顺带删除接口，而是迁移时必须完成的数据 ownership 调整。

### 1.2 MVP 集成对象

本计划默认只覆盖：

- 仓库：`mekong-next`
- 应用：`apps/bus-admin-web`
- 当前 Auth 封装：`packages/services/auth`
- 当前 Session 封装：`packages/next-stargate`
- 目标业务服务：`packages/services/mekong`
- 目标业务数据库：`packages/db`

以下内容不进入 MVP：

- `apps/mekong-api` 进入弃用路径，不接入新 Auth，不继续兼容旧 `@36node-stargate/auth-sdk` v1。
- Haivivi、Adventurer 等其他项目。

### 1.3 Monorepo 目录结构

Auth 侧使用 pnpm workspace，把旧 Auth 代码作为参考材料保留在仓库中；可运行、可测试、可发布的目标只包含 `stargate-next`、Playground 和稳定契约：

```text
auth/
├── apps/
│   ├── auth/                       # 旧 Auth 参考代码；不运行、不发布、不作为 CI 目标
│   ├── stargate-next/              # 新 Auth；只负责账户、凭证、Session 和安全基础
│   │   ├── src/
│   │   │   ├── bootstrap/
│   │   │   ├── platform/
│   │   │   ├── modules/
│   │   │   ├── protocols/
│   │   │   └── main.ts
│   │   ├── migrations/
│   │   └── test/
│   └── playground/                 # Next.js App Router 测试用业务客户端、登录 UI、Token/Session 调试
├── packages/
│   ├── stargate-contracts/         # 错误码、公共类型、OpenAPI 快照；不放业务实现
│   ├── stargate-next-sdk/          # 从 stargate-next OpenAPI 生成，供 playground 和 Mekong 调用
│   ├── config/                     # 仅放跨 app 共享的配置加载和校验
│   ├── eslint-config/
│   └── typescript-config/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

Mekong 侧仍在 `mekong-next` 内改造现有业务包，不把 Mekong Profile/Organization 代码搬进 Auth 仓库：

```text
mekong-next/
├── apps/
│   ├── bus-admin-web/              # 管理后台，首个纵向链路集成对象
│   └── mekong-api/                 # 弃用，不接入新 Auth
├── packages/
│   ├── db/                         # Mekong PostgreSQL schema 和 migration
│   ├── next-stargate/              # slim session/JWT 处理，不承载业务授权
│   └── services/
│       ├── auth/                   # 收缩为 stargate-next client
│       └── mekong/                 # Profile、Organization、授权和账号编排
└── tests/
```

约束：

- `apps/stargate-next` 不 import `apps/auth` 的源码；旧实现只作为阅读参考和契约对照资料。
- `apps/auth` 不提供启动、发布或部署目标，不进入 CI build/test 矩阵。
- `apps/playground` 必须通过生成的 `packages/stargate-next-sdk` 调用 `stargate-next`，不得手写与实现耦合的 HTTP 请求。
- Auth monorepo 的 PostgreSQL 只供 `stargate-next` 使用，不承载 Playground 的 Mekong 模拟数据。
- Playground 的短期 Profile、Organization、Role、Permission 模拟数据只使用进程内内存或 Redis，支持测试 reset/TTL，不创建 PostgreSQL schema。
- 不为了“复用”过早把领域模块移动到 `packages`；只有两个以上应用真正共同使用的稳定代码才抽包。
- Mekong Profile、Organization、roles 和业务权限只放在 `mekong-next`，不进入 Auth monorepo。
- `mekong-next/packages/services/auth` 也应通过生成 client 或明确的内部 client 调用 `stargate-next`，不得依赖 Auth 实现源码。
- `apps/bus-admin-web` 通过 `packages/services/auth` 与 `packages/next-stargate` 接入新 Auth。
- `apps/mekong-api` 只保留必要下线期处理，不作为新 Auth consumer。

### 1.4 关键原则

- 不以旧 Auth 的 22 个 Mekong 接口作为新契约。
- `stargate-next` 不提供 User Profile 和 Namespace CRUD。
- Mekong 是 Profile、组织和业务授权的唯一事实来源。
- `stargate-next` 是账户状态、登录标识、密码和 Session 的唯一事实来源。
- 两边通过稳定的 `accountId` 关联，不共享 ORM model。
- JWT 不再携带 `ns`、`roles`、`permissions` 等 Mekong 业务数据。
- 不长期双写同一字段；跨服务操作使用明确编排、幂等和补偿。
- Mekong 整体切换后，旧 Mekong Auth 实例停止写入。

## 2. 目标职责边界

### 2.1 `stargate-next` 负责

账户主体：

- `accountId`
- 账户状态：active/disabled
- 账户过期时间
- 登录标识：username，以及确认仍用于登录的 phone/email

凭证：

- 密码 hash、salt、algorithm
- 密码修改
- 旧密码算法兼容

认证与 Session：

- 用户名/手机号与密码登录
- Captcha 验证
- Access Token
- Refresh Session
- logout
- 按账户撤销 Session
- `x-api-key` 服务访问兼容

安全基础：

- 登录失败限制
- 最小安全审计
- 配置校验
- 健康检查

### 2.2 Mekong 负责

User Profile：

- `accountId`
- name
- avatar
- 业务联系电话
- 业务展示字段
- 操作日志所需用户快照

组织：

- Organization/原 Namespace 的 key、parent、name、description、sequence
- 组织树查询
- 组织 CRUD
- 删除保护
- 用户组织归属

授权：

- roles
- direct permissions
- `RoleToPermissions`
- 数据范围和 namespace scope
- Station 等业务动态权限

业务编排：

- 创建用户时同时创建 Auth Account 和 Mekong Profile。
- 禁用用户时调用 Auth Account 状态接口并撤销 Session。
- 删除用户时协调删除凭证和 Profile。
- 组织管理只访问 Mekong PostgreSQL。

### 2.3 字段边界

共同标识：

- Auth `accounts.id` 与 Mekong `user_profiles.account_id` 使用同一个字符串。
- 迁移时保留现有 Auth User ID。
- 新账号由 Mekong 编排层生成 ID，并传给 Auth。

Auth 独占：

- username
- password
- active
- 登录失败状态
- Session

Mekong 独占：

- name
- avatar
- organization membership
- roles
- permissions
- 业务 Profile

phone/email 需要区分语义：

- 用于登录时，规范化标识由 Auth 保存。
- 仅用于业务联系时，由 Mekong Profile 保存。
- 如果同一号码同时承担两种语义，接口必须显式更新两边，不把其中一边当作隐式副本。

## 3. 目标运行流程

### 3.1 登录

1. Mekong 登录页请求 Captcha。
2. 用户提交 login、password 和 Captcha。
3. `stargate-next` 验证 Captcha、账户状态和密码。
4. `stargate-next` 创建 Session，返回 Access Token 和 Refresh Key。
5. JWT 只包含身份和 Session 信息。
6. Mekong 根据 `sub/accountId` 从本地 PostgreSQL 加载 Profile、组织和授权。
7. Mekong 使用本地 `RoleToPermissions` 计算页面及业务权限。

### 3.2 每次请求

1. `@repo/next-stargate` 验证 JWT 或 refresh Session。
2. 得到 `{ accountId, sessionId }`。
3. Mekong 从本地数据库加载授权上下文。
4. middleware/server action 使用 Mekong 授权上下文设置数据范围。

不再从 JWT 读取：

- `ns`
- `roles`
- `permissions`

### 3.3 Refresh

1. Mekong 将 Refresh Key 交给 `stargate-next`。
2. `stargate-next` 检查账户状态和 Session。
3. `stargate-next` 返回新 Access Token，MVP 保持原 Refresh Key 和 Session ID。
4. Mekong 继续从本地数据库加载最新授权。

因此角色或组织变更无需等待 Access Token 过期。

### 3.4 创建用户

Mekong 是操作编排方：

1. 生成稳定 `accountId`。
2. 调用 `stargate-next` 创建 Account 和初始 Credential。
3. 在 Mekong 事务内创建 User Profile、Organization Membership 和 Role Assignment。
4. 如果 Mekong 事务失败，调用幂等删除接口补偿 Auth Account。
5. 如果补偿失败，记录 reconciliation item，禁止静默忽略孤儿 Account。

这不是同一字段双写：Auth 写身份数据，Mekong 写业务数据。

### 3.5 更新用户

Profile 更新：

- name、avatar、业务电话等只写 Mekong。

授权更新：

- organization、roles、permissions 只写 Mekong。

账户更新：

- username、active 只写 Auth。

密码修改：

- 只调用 Auth Credential 接口。

禁用账号：

1. Auth 将账户设为 disabled。
2. Auth 撤销该账户全部 Session。
3. Mekong 不复制 active 状态作为事实来源。

### 3.6 删除用户

1. Mekong 先检查业务引用和删除条件。
2. Auth 禁用 Account 并撤销 Session。
3. Mekong 删除或软删除 Profile、Membership 和 Assignment。
4. 根据审计/恢复要求决定 Auth Account 最终软删除或删除 Credential。

MVP 默认优先软删除账户，避免业务历史记录失去 accountId。

## 4. 新接口契约

接口可以调整，不继续生成旧 Auth 全量 SDK。建议为 `stargate-next` 生成只包含身份能力的内部 client。

### 4.1 健康检查

- `GET /health/live`
- `GET /health/ready`

`/hello` 仅可在过渡期保留为无逻辑别名，上线后删除。

### 4.2 登录与 Session

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/accounts/{accountId}/sessions`
- `DELETE /v1/accounts/{accountId}/sessions`

登录请求至少包含：

```json
{
  "login": "admin",
  "password": "***",
  "captchaId": "...",
  "captchaCode": "..."
}
```

登录响应：

```json
{
  "accountId": "...",
  "sessionId": "...",
  "accessToken": "...",
  "accessTokenExpiresAt": "...",
  "refreshKey": "...",
  "refreshExpiresAt": "..."
}
```

响应不包含 name、ns、roles、permissions。

### 4.3 Account 管理

- `POST /v1/accounts`
- `GET /v1/accounts/{accountId}`
- `POST /v1/accounts/@batchGet`
- `PATCH /v1/accounts/{accountId}`
- `DELETE /v1/accounts/{accountId}`
- `POST /v1/accounts/{accountId}/password`

Account 创建字段：

- `id`
- `username`
- 可选登录 phone/email
- `password`
- `active`
- `idempotencyKey`

Account 查询只返回身份字段，不返回 Profile 和业务授权。

`@batchGet` 用于 Mekong 用户列表合并账户状态，避免逐个调用 Auth。

### 4.4 Captcha

- `POST /v1/captchas`
- `POST /v1/captchas/verify`

Captcha 必须：

- 有 TTL。
- 一次性消费。
- 限制错误次数。
- 不提供 list/get/update/delete 通用 CRUD。

### 4.5 JWT

MVP 保持 HS256，避免同时引入 Mekong 验签基础设施改造。

最小 claim：

- `sub`：accountId
- `sid`：sessionId
- `type`
- `iat`
- `exp`

明确删除：

- `ns`
- `roles`
- `permissions`
- `groups`

RS256、JWKS、issuer/audience 标准化进入 Post-MVP。

### 4.6 服务访问

MVP 可继续接受 Mekong 独立 `x-api-key`，但必须：

- 无代码默认值。
- Mekong 使用独立 Key，不与其他项目共享。
- 支持配置轮换。
- 只允许访问本计划列出的内部管理接口。

完整 Client Credential 模型进入 Post-MVP。

## 5. Mekong 内部改造

### 5.1 `packages/db`

新增 Prisma model 和 migration：

- UserProfile
- Organization
- OrganizationMembership
- UserRoleAssignment
- UserPermissionGrant
- AuthReconciliationItem

当前 schema 只有示例模型，MVP 不能假设 Profile/Organization 表已经存在。

### 5.2 `packages/services/mekong`

新增：

- `organization.ts`
- `user-profile.ts`
- `authorization.ts`
- `account-orchestration.ts`

负责：

- Organization CRUD 和树查询。
- Profile CRUD。
- 用户组织归属。
- Role/Permission assignment。
- 创建、禁用、删除用户的跨服务编排。
- 根据 accountId 返回完整 Mekong 授权上下文。

### 5.3 `packages/services/auth`

收缩为 Auth client：

保留：

- login/refresh/logout
- captcha
- account credential/status
- session revoke

迁出：

- `user.ts` 的 Profile/组织查询。
- `namespace.ts`。
- `role.ts`。
- `permission.ts`。

过渡期允许旧函数名 re-export Mekong service，但不得继续调用 Auth User/Namespace endpoint。

### 5.4 `packages/next-stargate`

调整：

- TokenPayload/Session 只保留 accountId 和 sessionId。
- 不再解析 `ns/roles/permissions`。
- 不负责计算业务权限。
- Session refresh 只访问 Auth。

授权上下文加载放在 Mekong 应用层，不让通用 Session 包依赖 Mekong 数据库。

### 5.5 Mekong apps

`apps/bus-admin-web` 需要修改：

- Platform layout：Session 后按 accountId 加载 Mekong Profile/Authorization。
- `StargateProvider`：接收 slim session、profile 和 permissions。
- middleware：不从 JWT 读取 `ns`；通过 Mekong 授权上下文设置数据范围。
- Organization actions：改用 Mekong organization service。
- User actions：Profile/授权写 Mekong，账户状态/密码通过 orchestration 调 Auth。
- `/api/screen/namespaces`：改用 Mekong。
- 登录 route：适配新 login response，并从 Mekong 加载用户上下文。
- operation log：用户名称从 Mekong Profile 获取。

`apps/mekong-api` 不做新 Auth 接入：

- 标记为弃用，不再作为 MVP 兼容面。
- 不再新增对旧 `@36node-stargate/auth-sdk` v1 的适配。
- 下线前只保留必要的流量迁移、调用方确认和回滚说明。

### 5.6 业务服务引用

当前从 `@repo/auth-service` 查询 Namespace/User 的模块需要改为 Mekong：

- vehicle
- station
- fault record
- work order
- operation log
- 测试 fixture/helper

改造完成后，Mekong 业务模块不得 import Auth User/Namespace client。

## 6. PostgreSQL 数据模型

### 6.1 Auth PostgreSQL

#### `accounts`

- `id text primary key`
- `status text not null`
- `username text not null`
- `phone text null unique`
- `email text null unique`
- `password_algorithm text not null`
- `password_hash text not null`
- `password_changed_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz null`

约束：

- username 必须存在。
- username 写入前统一执行 `trim().toLowerCase()`，数据库只保存规范化结果并直接对 username 建唯一约束。
- phone/email 只在作为登录标识时迁入。
- email 写入前 trim 并转为 lowercase。
- phone 写入前 trim，且必须匹配 `^\+?\d+$`；不允许内部空格，不自动转换国家码或增删 `+`。
- phone、email 直接建立唯一约束。
- MVP 不做 phone/email 应用层字段加密；使用 PostgreSQL 静态加密、TLS、最小权限、加密备份和日志脱敏保护。
- Account API 不返回 password hash/salt。
- 通用 Account 更新不接受密码字段，改密使用专用接口。

MVP 只支持 `legacy-md5` 格式；旧密码原样迁移，新建和改密继续生成 `13 位 salt + MD5(password + salt)`。Argon2id 进入 Post-MVP。

#### `sessions`

- `id primary key`
- `account_id`
- `refresh_key_hash`
- `refresh_key_hmac_key_id`
- `expires_at`
- `created_at`

不存储 Organization、Role、Permission 快照或撤销状态。logout/revoke 直接删除 Session，并写入 `auth_audit_events`。

Refresh Key hash 使用 HMAC-SHA256。配置 primary 和可选 secondary `(keyId, secret)`：新 Session 只用 primary 生成 hash 并记录 key ID；验证时使用对应 `(keyId, hash)` 组合查询，任一组合匹配即可。`(refresh_key_hmac_key_id, refresh_key_hash)` 唯一，secondary 仅用于平滑轮换。

#### `auth_audit_events`

只记录：

- login success/failure
- refresh/logout
- account create/update/disable/delete
- password change
- session revoke
- migration

### 6.2 Mekong PostgreSQL

#### `user_profiles`

- `account_id text primary key`
- `name`
- `avatar`
- `contact_phone`
- 其他明确仍被 Mekong 使用的业务展示字段
- `created_at`
- `updated_at`
- `deleted_at`

不保存 password 和 Session。

#### `organizations`

- `key text primary key`
- `parent_key text null`
- `name`
- `description`
- `sequence`
- timestamps

MVP 保留 `.` 层级和现有 key，不强制重编码业务外键。

#### `organization_memberships`

- `account_id`
- `organization_key`
- timestamps

MVP 可限制一个 account 只有一个主 Organization，以兼容当前 `user.ns`。

#### `user_role_assignments`

- `account_id`
- `role_key`

Role 定义仍由 Mekong 代码维护，不迁移旧 Auth Role collection。

#### `user_permission_grants`

- `account_id`
- `permission`

用于保留旧 `users.permissions` 的直接授权。

#### `auth_reconciliation_items`

记录跨服务编排失败：

- operation
- account_id
- desired_state
- last_error
- attempts
- resolved_at

它不是双写队列，只用于恢复跨服务操作中的孤儿状态。

## 7. MongoDB 数据拆分迁移

### 7.1 `users` 拆分

迁入 Auth PostgreSQL：

- `_id/id`
- username
- 用作登录标识的 phone/email
- password/hash/salt
- active
- passwordChangedAt

迁入 Mekong PostgreSQL：

- 同一个 id 作为 accountId
- name
- avatar
- 业务 contact phone
- ns → organization membership
- roles → role assignments
- permissions → permission grants
- Mekong 确认仍使用的其他 Profile 字段

不迁移：

- 未被 Mekong 使用的 Profile 字段。
- groups。
- identity/KYC。
- invitation、level、labels 等未确认业务字段。

### 7.2 `namespaces` 拆分

全部迁入 Mekong PostgreSQL：

- key
- ns → parent_key
- name
- desc
- seq

以下字段默认不迁移，除非 Mekong 代码扫描确认使用：

- defaultPassword
- permissions
- data
- labels
- exportable

### 7.3 不迁移

- 旧 sessions：上线后强制重新登录。
- captchas：短期数据直接失效。
- groups。
- roles collection。
- thirdparties。
- email/sms records。
- industries/regions。

### 7.4 预检

Auth 侧：

- 重复或缺失 username。
- 未知密码 hash。
- active 异常。
- 登录 phone/email 冲突。

Mekong 侧：

- 缺失 Profile id。
- 用户引用不存在 Namespace。
- Namespace 重复 key、孤儿父节点、循环。
- roles/permissions 类型异常。
- 业务表中引用不存在的 ns/accountId。

跨库：

- 每个 Mekong UserProfile 必须存在 Auth Account。
- 每个 Membership 必须存在 Profile 和 Organization。
- 所有现有业务 user/ns 外键都能映射到新表。

预检只能报告，禁止静默修改生产数据。

### 7.5 迁移顺序

1. 冻结 Auth Account 与 Mekong Profile/Organization schema。
2. 从 MongoDB 导出一致性快照。
3. 将登录标识和当前密码凭证合并迁移到 Auth accounts。
4. 迁移 Mekong organizations。
5. 迁移 Mekong profiles、memberships、roles、permissions。
6. 验证跨库 accountId 和业务引用。
7. 不迁移 Session/Captcha。
8. 在维护窗口执行最终增量或重新全量导入。
9. 对账通过后同时部署 Auth 和 Mekong 改造。

### 7.6 对账

必须输出机器可读报告：

- 源 User 数。
- Auth Account 数及密码算法分布。
- Mekong Profile 数。
- Namespace/Organization 数。
- Membership、Role、Permission 数。
- 未迁移字段数量和原因。
- 孤儿 Account/Profile/Membership。
- 业务 user/ns 引用异常。
- 抽样密码验证结果。
- Organization 树查询对比。

任一未解释差异都阻止上线。

## 8. 并行工作流

### Workstream A：Auth Core

- Auth PostgreSQL schema。
- Account（包含登录标识和当前密码凭证）。
- Login/Captcha。
- Session/Refresh/Logout。
- slim JWT。
- Auth client/OpenAPI。

### Workstream B：Mekong Profile 与 Organization

- Mekong Prisma schema。
- Profile。
- Organization。
- Membership。
- Role/Permission。
- Authorization context。

### Workstream C：Mekong 调用改造

- auth-service 收缩。
- next-stargate slim session。
- bus-admin-web layout/middleware/action。
- mekong-api 弃用路径和调用方迁移确认。
- 业务模块 import 迁移。
- Account orchestration。

### Workstream D：迁移与质量

- Mongo 预检。
- 双目标 ETL。
- 对账。
- Auth contract test。
- Mekong E2E。
- 上线和回滚演练。

以下契约必须由单一 Owner 审核：

- accountId。
- User 字段拆分。
- JWT payload。
- Account/Profile 创建和删除编排。
- Organization key/parent 语义。
- 数据迁移映射。

## 9. 压缩后的 Gate

### Gate 0：职责与契约冻结

交付：

1. 确认 MVP 包含 `bus-admin-web`。
2. 冻结 Auth/Mekong 字段 ownership。
3. 冻结 slim Auth API。
4. 冻结 JWT payload。
5. 确认 `mekong-api` 弃用路径和剩余调用方迁移 owner。
6. 保存当前登录、权限、组织 E2E 基线。
7. 确认源 Auth MongoDB 是否 Mekong 独享。

退出条件：

- 不再以旧 22 个 endpoint 为目标。
- 所有当前调用都有新 owner 和替代调用。
- Mongo User 每个迁移字段都有唯一目标。

### Gate 1：双库数据骨架

并行交付：

- Auth accounts/sessions migration。
- Mekong profiles/organizations/memberships/assignments migration。
- Repository 和测试 fixture。
- 预检与首次脱敏数据迁移。

退出条件：

- 同一 accountId 可在两库正确关联。
- Organization 树和业务引用可恢复。
- 旧密码可验证。

### Gate 2：最小纵向链路

交付：

1. Auth login/refresh/logout。
2. Mekong profile/authorization lookup。
3. next-stargate slim session。
4. bus-admin-web 登录和 layout。

退出条件：

- `login → slim JWT → load profile → calculate permissions` 贯通。
- `bus-admin-web` 不再读取 JWT 里的 Mekong 业务 claim。
- JWT 不包含 Mekong 业务 claim。
- 角色和数据范围与旧系统一致。

### Gate 3：用户与组织管理

交付：

- Organization CRUD。
- Profile CRUD。
- 创建用户编排。
- 禁用、改密、删除用户。
- Account batch get。
- Session revoke。
- `bus-admin-web` 页面、server action 和 service import 改造。

退出条件：

- Organization E2E 通过。
- Login/Permission E2E 通过。
- Auth 不再暴露 User Profile/Namespace endpoint。
- Mekong 业务代码不再从 Auth 查询 Profile/Namespace。

### Gate 4：迁移和上线演练

交付：

1. 使用生产规模脱敏快照迁移两套 PostgreSQL 数据。
2. 输出完整对账报告。
3. 测量迁移时长和 SQL 性能。
4. 演练停止写入、最终迁移、部署、切换和回滚。
5. 验证跨服务补偿和 reconciliation。

退出条件：

- 迁移可在维护窗口内完成。
- 无未解释的孤儿数据。
- 回滚演练成功。
- Auth 与 Mekong owner 联合签字。

### Gate 5：Mekong 整体上线

1. 停止切换前线上旧 Auth 和组织/用户写入。
2. 备份 MongoDB。
3. 执行最终双目标迁移。
4. 对账 Auth Account 与 Mekong Profile/Organization。
5. 部署 `stargate-next` 和 Mekong 改造。
6. 更新 endpoint 和 Secret。
7. 使所有旧 Session 失效。
8. 执行 `bus-admin-web` 登录、权限、用户、组织 smoke test。
9. 验收后恢复流量。
10. 切换前线上旧实例仅作为回滚保留，不从仓库重新运行或发布 `apps/auth`。

## 10. 测试门禁

### 10.1 Auth

- 正确/错误密码。
- disabled account。
- legacy MD5 验证。
- 新建和改密生成 salted MD5；Argon2id 不进入本阶段。
- Refresh、logout、Session revoke。
- Captcha 正确、错误、过期、重复消费。
- 重复 username/phone 并发创建。
- Account create/update/delete 幂等。

### 10.2 Mekong

- Profile CRUD。
- Organization CRUD、树查询和删除保护。
- Membership。
- RoleToPermissions。
- direct permission。
- namespace 数据范围。
- 用户列表合并 Account 状态。
- 创建用户失败补偿。
- 禁用用户撤销 Session。
- 删除用户保留历史业务引用。

### 10.3 集成

必须复用并调整：

- `apps/bus-admin-web/tests/e2e/login-permission.spec.ts`
- `apps/bus-admin-web/tests/e2e/org-*.spec.ts`
- `tests/helpers/auth-api.ts`
- `packages/services/mekong-tests`

重点验证：

- `bus-admin-web` 能使用新 Auth 完成登录、refresh 和 logout。
- Session 无业务 claims 时 UI 权限不变。
- Organization key 保持后业务查询结果不变。
- 用户改组织后立即按新范围授权。
- 角色修改无需重新签发 JWT。
- Profile 服务异常时不得误判为未登录或高权限。
- Auth 异常时 Profile/Organization 查询不受影响，但凭证操作明确失败。
- `mekong-api` 无新增新 Auth 接入，剩余流量和调用方有明确下线计划。

### 10.4 迁移

- 脚本幂等。
- 对账失败返回非零退出码。
- 未知字段/算法不静默跳过。
- accountId 跨库一致。
- Organization 无环且父节点完整。
- 生产规模迁移时间满足维护窗口。

## 11. 回滚策略

- 不做 Mongo/PostgreSQL 长期双写。
- 维护窗口内完成迁移和验收后再开放流量。
- 开放流量前失败：直接恢复切换前线上旧 Auth endpoint 和旧 Mekong 版本，不重新构建或发布仓库内 `apps/auth`。
- 开放流量后发生新 Account/Profile/组织写入时，不得直接丢弃 PostgreSQL。
- 必须准备 PostgreSQL 新增/变更数据导出方案，或明确上线后只允许 forward fix。
- 回滚必须同时回滚 Auth 与 Mekong，不允许新 Mekong 配旧 Auth Profile/Namespace API。

## 12. Post-MVP

- Haivivi、Adventurer。
- Phone/Email OTP、极光登录。
- OAuth/Federation、KYC。
- Device Session/UAT/MQTT Token。
- Namespace/Organization 独立服务化。
- RS256、JWKS、issuer/audience。
- per-client credential。
- OIDC Provider。
- 完整 Audit/outbox/SIEM。
- 切换前线上旧 Auth 全局下线，仓库内 `apps/auth` 继续仅作参考代码保留。

## 13. 编码前必须确认

- [ ] MVP 是否覆盖 `mekong-next/apps/bus-admin-web`。
- [ ] `apps/mekong-api` 的弃用时间、剩余调用方和下线 owner。
- [ ] Mekong Auth MongoDB 是否独享。
- [ ] username 和 phone 的实际登录规则。
- [ ] phone 是登录标识、业务联系方式，还是两者都是。
- [ ] User Profile 最小保留字段。
- [ ] Namespace 中 data/labels/defaultPassword/exportable 是否确实无调用。
- [ ] 角色和直接权限的生产数据量。
- [ ] Organization 是否保持一个用户一个主组织。
- [ ] 业务表中 userId/ns 引用范围。
- [ ] 新 Account ID 生成方。
- [ ] Account/Profile 创建失败的补偿和人工处理 owner。
- [ ] 是否接受上线后全部用户重新登录。
- [ ] PostgreSQL 是同实例分 schema，还是两个独立数据库。
- [ ] 维护窗口和回滚窗口。
- [ ] Auth 与 Mekong 的开发、迁移和上线 owner。
