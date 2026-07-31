# 202607-02 账户管理

## 概述

本 Feature 在初始化框架上细化认证域的 Account 管理。Account 是可认证的稳定主体，不等于完整业务用户；它不保存 Profile、组织、角色或权限。

范围：

- 创建、分页查询、单个查询和批量查询 Account。
- 更新 username、登录 phone/email 与 `active` 状态。
- 专用改密；普通 Account 更新不接受密码字段。
- 软删除 Account，并释放其登录标识供新 Account 使用。
- 创建操作可选幂等键（有效期可配置，默认 1 小时）。
- `legacy-md5` 密码凭证兼容，以支持迁移前账户验证。

## 模型与兼容范围

Account ID 为不可变稳定标识。username、登录 phone 与登录 email 在规范化后分别全局唯一；username 和 email 写入、查询前去除首尾空白并转小写，phone 只去除首尾空白。

软删除不物理删除历史，而是终止账户认证资格、清空可选登录标识、改写 username 占位值并释放原标识。删除和改密均撤销该账户全部 Session。

旧 Auth 的 User、Namespace、Role、Permission 接口不作为兼容目标；仅迁移认证事实到 Account。

## 验收

### 创建账户并可查询

**Given**

- 服务调用方持有有效 API Key。

**When**

- 使用合法且未占用的 username 与密码创建 Account；可附带 Idempotency Key。

**Then**

- 返回新的 Account ID，且公开表示不包含密码或密码 hash。
- 通过 `GET /v1/accounts/{accountId}` 可查询到同一 Account。
- 若提供 Idempotency Key：相同 key 与相同请求重复提交时返回同一个创建结果；同一 key 携带不同请求时返回幂等冲突。
- 未提供 Idempotency Key 时每次请求独立创建；标识冲突仍返回冲突错误。

**验证**

- `POST /v1/accounts`、`GET /v1/accounts/{accountId}`。
- 黑盒测试：`apps/stargate-next/test/**.black-box.spec.ts`。

### 列表与批量查询

**Given**

- 至少存在一个未删除的 Account。

**When**

- 使用分页参数查询账户列表，或向 `POST /v1/accounts/@batchGet` 提交 Account ID 数组。

**Then**

- 列表响应包含 JSON:API 资源与分页元数据。
- 批量输入格式错误返回稳定的 `BATCH_INVALID` 错误。
- 已软删除 Account 不作为普通查询结果返回。

**验证**

- `GET /v1/accounts`、`POST /v1/accounts/@batchGet`。
- API 黑盒测试覆盖分页与无效批量输入。

### 更新、禁用与改密

**Given**

- 一个未删除的 Account，且该账户至少存在一个可刷新的 Session。

**When**

- 服务调用方更新登录标识或将 `active` 设置为 `false`，或调用专用改密接口。

**Then**

- 更新后的标识继续遵守规范化与唯一性规则。
- disabled Account 不可再次登录或刷新。
- 改密后，旧密码不再有效，且该 Account 的既有 Refresh Key 失效。
- 已签发 Access Token 不因改密或禁用被逐请求撤销，只能使用至自身过期。

**验证**

- `PATCH /v1/accounts/{accountId}`、`POST /v1/accounts/{accountId}/password`。
- API 黑盒测试覆盖改密后 Refresh 失效。
- 禁用后的登录与 Refresh 全矩阵为后续待补的黑盒验证。

### 软删除后复用标识

**Given**

- 一个 Account 使用唯一 username，且已建立 Session。

**When**

- 服务调用方删除该 Account，并以相同 username 创建另一个 Account。

**Then**

- 删除操作终止原 Account 的认证能力并撤销其全部 Session。
- 原 username 可以被新 Account 使用。
- 原 Account ID 不被复用，且历史审计保留。

**验证**

- `DELETE /v1/accounts/{accountId}` 与 `POST /v1/accounts`。
- API 黑盒测试覆盖软删除后的标识复用。
