/** SDK 必须显式区分 Tenant 数据面与控制面请求头。 */

import { StargateNextClient } from "@repo/stargate-next-sdk";
import { describe, expect, it, vi } from "vitest";

describe("StargateNextClient Tenant headers", () => {
  it("inherits and overrides Tenant only for tenant-scoped operations", async () => {
    const headers: Array<{ path: string; tenant: string | null }> = [];
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        headers.push({
          path: new URL(request.url).pathname,
          tenant: request.headers.get("x-tenant-id"),
        });
        const body = request.url.includes("/v1/tenants")
          ? {
              createdAt: new Date(0).toISOString(),
              id: "test",
              name: "test",
              status: "active",
              updatedAt: new Date(0).toISOString(),
            }
          : {
              active: true,
              createdAt: new Date(0).toISOString(),
              email: null,
              id: "account-1",
              phone: null,
              tenantId: "test",
              updatedAt: new Date(0).toISOString(),
              username: "account",
            };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
            status: 200,
          })
        );
      }
    );
    const client = new StargateNextClient("https://stargate.example", {
      apiKey: "admin-key",
      fetch: fetchImpl as typeof fetch,
      tenantId: "test",
    });

    await client.createTenant({ id: "test" });
    await client.listTenants();
    await client.getTenant("test");
    await client.patchTenant("test", { status: "active" });
    await client.createTenantApiKey();
    await client.listTenantApiKeys();
    await client.patchTenantApiKey("key-1", "renamed");
    await client.deleteTenantApiKey("key-1");
    await client.createAccount({ password: "password", username: "account" });
    await client.createAccount(
      { password: "password", username: "other-account" },
      "other"
    );
    await client.getAccount("account-1", "default");

    expect(headers).toEqual([
      { path: "/v1/tenants", tenant: null },
      { path: "/v1/tenants", tenant: null },
      { path: "/v1/tenants/test", tenant: null },
      { path: "/v1/tenants/test", tenant: null },
      { path: "/v1/tenant-api-keys", tenant: "test" },
      { path: "/v1/tenant-api-keys", tenant: "test" },
      { path: "/v1/tenant-api-keys/key-1", tenant: "test" },
      { path: "/v1/tenant-api-keys/key-1", tenant: "test" },
      { path: "/v1/accounts", tenant: "test" },
      { path: "/v1/accounts", tenant: "other" },
      { path: "/v1/accounts/account-1", tenant: "default" },
    ]);
  });
});
