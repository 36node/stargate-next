# Stargate Next SDK

此包用于预留从 Stargate Next OpenAPI 契约生成的 API 绑定。

## Tenant 作用域

未指定 `tenantId` 时，Tenant-scoped API 使用内建的 `default` Tenant。可以在客户端构造时设置默认 Tenant，也可在每次调用的最后一个可选参数覆盖：

```ts
const client = new StargateNextClient(endpoint, {
  apiKey: tenantApiKey,
  tenantId: "test",
});

const accounts = await client.listAccounts();
const defaultAccounts = await client.listAccounts(0, 10, "default");
```

Tenant 控制面方法 `createTenant`、`listTenants`、`getTenant`、`patchTenant` 只接受 Admin Key，永远不会发送 `x-tenant-id`。Tenant API Key 管理方法属于 Tenant-scoped API：

```ts
const admin = new StargateNextClient(endpoint, { apiKey: adminApiKey });
await admin.createTenant({ id: "test", name: "Test" });

const created = await admin.createTenantApiKey({ name: "worker" }, "test");
// created.key 是明文唯一一次可见；请立即安全保存。
await admin.listTenantApiKeys(0, 10, "test");
```

## 刷新凭据

调用 `refresh` 成功后，客户端必须用响应中的 `refreshKey` 覆盖本地保存的值，并在下一次刷新时提交该值。当前服务可能返回原 refresh key，但客户端不应依赖这一行为；接口允许服务后续在每次刷新时轮换 refresh key。
