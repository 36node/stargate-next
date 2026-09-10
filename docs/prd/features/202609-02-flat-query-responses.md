# 202609-02 查询 API 扁平响应

## 概述

本 Feature 将 Stargate Next 的分页查询响应从 JSON:API 风格资源对象改为扁平资源列表，使列表接口与现有单条查询、创建和更新接口使用一致的资源表示。

范围：

- `GET /v1/accounts` 返回扁平的 `Account[]`。
- `GET /v1/tenants` 返回扁平的 `Tenant[]`。
- `GET /v1/tenant-api-keys` 返回扁平的 `TenantApiKey[]`。
- 分页元数据直接位于 `meta`，不再使用 `meta.page`。
- 响应不再返回 JSON:API 的 `type`、`attributes` 或分页 `links`。
- OpenAPI、生成的 SDK 与服务契约在实现时同步采用新响应结构。

这是一次有意的破坏性契约变更，不提供旧响应结构的兼容层。单条查询、批量账户查询、Session 查询、写接口、错误响应和数据库模型不在本期范围内。

## 设计原因

本次改造保留现有 JSON:API 风格中简单且有价值的统一约定：列表结果继续使用顶层 `data` 承载资源，分页信息继续集中在 `meta`，分页和过滤参数也保持一致。这样仍能让所有列表接口具有稳定、可预测的公共结构，同时消除每条资源上的重复包装。

Stargate Next 当前不需要完整 JSON:API 提供的关系描述、`included` 复合文档、稀疏字段集、资源链接以及专用 media type 等能力。继续返回 `type`、`attributes` 和 `links` 会让服务契约、OpenAPI 类型、SDK 以及调用方解包逻辑承担额外复杂性，却没有对应的业务收益。若未来确实出现跨资源关系或按需展开等需求，应基于实际用例单独设计，而不是提前保留暂时用不到的协议结构。

扁平资源配合顶层 `data`、`meta` 的形态也更接近流行的 Strapi 列表响应风格。开发者可以直接读取 `response.data` 中的业务字段，并从 `response.meta` 获取分页信息，减少理解和接入成本。这里的“接近”仅指响应组织方式和开发体验；本接口不声明与 Strapi 或 JSON:API 协议兼容。

## 响应契约

三个分页查询接口统一返回以下顶层结构：

```ts
type Collection<T> = {
  data: T[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
};
```

各接口的资源类型如下：

| 接口 | `data` 类型 | 资源要求 |
| --- | --- | --- |
| `GET /v1/accounts` | `Account[]` | 与单条 Account 查询相同的公开字段，不包含密码或凭证信息 |
| `GET /v1/tenants` | `Tenant[]` | 与单条 Tenant 查询相同的公开字段，包含已保存的 `settings` |
| `GET /v1/tenant-api-keys` | `TenantApiKey[]` | 仅包含 Key 元数据，不包含明文 Key、`hash`、`hmacKeyId` 或 HMAC secret |

目标响应示例：

```json
{
  "data": [
    {
      "id": "acc_123",
      "username": "alice",
      "phone": null,
      "email": "alice@example.com",
      "active": true,
      "tenantId": "default",
      "createdAt": "2026-09-10T08:00:00.000Z",
      "updatedAt": "2026-09-10T08:00:00.000Z"
    }
  ],
  "meta": {
    "limit": 10,
    "offset": 0,
    "total": 25
  }
}
```

旧响应中的以下结构全部删除：

- 列表项外层的 `type`。
- 列表项外层的 `attributes`；资源公开字段直接位于 `data` 元素上。
- 顶层 `links`，包括 `links.self` 和 `links.next`。
- `meta.page` 包装层；`limit`、`offset`、`total` 直接位于 `meta`。

即使仍有下一页，服务端也不返回下一页链接。调用方使用以下条件判断是否继续查询：

```ts
const hasNextPage = offset + data.length < meta.total;
const nextOffset = offset + data.length;
```

当查询没有匹配资源时，返回空数组和对应分页元数据：

```json
{
  "data": [],
  "meta": {
    "limit": 10,
    "offset": 0,
    "total": 0
  }
}
```

## 查询参数与既有行为

本次只改变成功响应结构，不改变查询请求契约：

- 分页继续使用 `page[offset]` 和 `page[limit]`。
- `page[offset]` 必须为非负整数。
- `page[limit]` 必须为 `1..100` 的整数。
- 未提供分页参数时沿用现有默认值。
- `GET /v1/tenants` 继续支持 `filter[name]`，并沿用现有精确匹配语义。
- 重复、非法或越界分页参数继续返回现有稳定错误。

资源可见性和安全规则保持不变：

- Account 列表只返回当前 Tenant 下未软删除的 Account。
- Tenant 列表仍仅允许 Admin 查询。
- Tenant API Key 列表只返回当前 Tenant 下的 Key 元数据。
- Admin、兼容 API Key 和 Tenant API Key 的租户解析与隔离规则不变。
- 排序方式与 `total` 的统计范围保持现有语义。

## 兼容与交付边界

实现该 Feature 时直接替换旧契约，不通过请求头、查询参数、Feature Flag 或并行版本保留旧格式。依赖旧结构的调用方必须同步迁移：

- `resource.attributes` 改为直接读取 `resource`。
- `response.meta.page.total` 等字段改为读取 `response.meta.total`。
- 依赖 `links.next` 的分页循环改为依据 `offset`、`data.length` 和 `meta.total` 计算下一页。

OpenAPI 不再将这三个响应描述为 JSON:API，也不再为其声明 `application/vnd.api+json`；新契约仅使用 `application/json`。Collection 类型名称和 SDK 的 `list*` 方法名称可以保持不变，其返回类型结构直接更新为新格式。

以下内容不因本 Feature 改变：

- `GET /v1/accounts/{accountId}` 和 `GET /v1/tenants/{tenantId}` 的单条扁平响应。
- `POST /v1/accounts/@batchGet` 的批量 Account 响应。
- `GET /v1/accounts/{accountId}/sessions` 的 Session 响应。
- 创建、更新、删除、认证和 Captcha 接口。
- 错误响应的状态码、`code` 与 `message` 结构。
- 数据库 schema、数据迁移和持久化内容。

## 验收

### Account 列表返回扁平资源

**Given**

- 当前 Tenant 下存在未删除的 Account，并存在已软删除或属于其他 Tenant 的 Account。

**When**

- 调用 `GET /v1/accounts?page[offset]=0&page[limit]=10`。

**Then**

- `data` 中每一项直接包含 Account 的公开字段，不包含 `type` 或 `attributes`。
- 只返回当前 Tenant 下未软删除的 Account。
- `meta` 直接包含请求生效后的 `limit`、`offset` 和可见 Account 的 `total`。
- 响应不包含 `links`，也不包含 `meta.page`。

### Tenant 列表保持过滤语义

**Given**

- 调用方持有有效 Admin 凭证，并存在多个名称不同的 Tenant。

**When**

- 携带分页参数和 `filter[name]` 调用 `GET /v1/tenants`。

**Then**

- `data` 中每一项为扁平 Tenant，包含 `id`、`name`、`status`、`settings` 和时间戳等公开字段。
- 名称过滤、排序和总数统计沿用现有语义。
- `meta` 直接包含 `limit`、`offset`、`total`，响应不包含 `links`。
- 非 Admin 凭证仍不可查询 Tenant 列表。

### Tenant API Key 列表保持隔离和敏感信息保护

**Given**

- 一个 Tenant 下存在多把 Tenant API Key，其他 Tenant 下也存在 Key。

**When**

- 使用 Admin 或当前 Tenant 的有效 Key 调用 `GET /v1/tenant-api-keys`。

**Then**

- `data` 中每一项为扁平 Tenant API Key 元数据。
- 只返回目标 Tenant 下的 Key，不泄露其他 Tenant 的数据。
- 响应不包含 Key 明文、`hash`、`hmacKeyId` 或 HMAC secret。
- `meta` 直接包含 `limit`、`offset`、`total`，响应不包含 `links`。

### 空列表与多页遍历

**Given**

- 查询条件可能没有匹配项，或匹配项数量大于单页 `limit`。

**When**

- 调用任一纳入本 Feature 的分页查询接口。

**Then**

- 没有匹配项时返回 `data: []` 和正确的 `meta`，不返回 `links`。
- 存在多页时，调用方可使用 `offset + data.length < meta.total` 判断还有下一页，并以 `offset + data.length` 作为下一次请求的 offset。
- 遍历完成后不遗漏或重复由本次响应协议变更导致的资源。

### 契约一致性

**Given**

- 服务实现、OpenAPI 和生成 SDK 已按本 Feature 更新。

**When**

- 分别通过 HTTP API 和 SDK 调用三个列表接口。

**Then**

- OpenAPI schema、SDK 返回类型和实际 JSON 响应一致。
- 新契约中不存在 JSON:API 资源包装、JSON:API media type 或旧分页结构。
