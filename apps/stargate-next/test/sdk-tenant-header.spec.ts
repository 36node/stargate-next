/** SDK 必须显式区分 Tenant 数据面与控制面请求头。 */

import { StargateNextClient } from "@36node/stargate-next-sdk";
import { describe, expect, it, vi } from "vitest";

describe("StargateNextClient Tenant headers", () => {
  it("sends the configured key only for explicit login exemption", async () => {
    const requests: Request[] = [];
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Promise.resolve(
          Response.json({ accountId: "account", tenantId: "test" })
        );
      }
    );
    const client = new StargateNextClient("https://stargate.example", {
      apiKey: "tenant-key",
      fetch: fetchImpl as typeof fetch,
      tenantId: "test",
    });
    await client.login("alice", "password", "captcha", "ABCD");
    await client.login(
      "alice",
      "password",
      undefined,
      undefined,
      undefined,
      {}
    );
    await client.login("alice", "password", undefined, undefined, undefined, {
      skipCaptcha: false,
    });
    await client.login("alice", "password", undefined, undefined, "other", {
      skipCaptcha: true,
    });
    const noKey = new StargateNextClient("https://stargate.example", {
      fetch: fetchImpl as typeof fetch,
    });
    await noKey.login("alice", "password", undefined, undefined, undefined, {
      skipCaptcha: true,
    });

    expect(requests.map((request) => request.headers.get("x-api-key"))).toEqual(
      [null, null, null, "tenant-key", null]
    );
    expect(
      requests.map((request) => request.headers.get("x-tenant-id"))
    ).toEqual(["test", "test", "test", "other", null]);
    expect(await requests[0].json()).toEqual({
      login: "alice",
      password: "password",
      captchaId: "captcha",
      captchaCode: "ABCD",
    });
    expect(await requests[3].json()).toEqual({
      login: "alice",
      password: "password",
      options: { skipCaptcha: true },
    });
  });

  it("keeps API keys off Bearer self-change requests", async () => {
    const fetchImpl = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(new URL(request.url).pathname).toBe("/v1/auth/password");
        expect(request.method).toBe("POST");
        expect(request.headers.get("authorization")).toBe(
          "Bearer access-token"
        );
        expect(request.headers.get("x-api-key")).toBeNull();
        expect(request.headers.get("x-tenant-id")).toBe("test");
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    );
    const client = new StargateNextClient("https://stargate.example", {
      apiKey: "admin-key",
      fetch: fetchImpl as typeof fetch,
      tenantId: "test",
    });

    await expect(
      client.selfChangePassword(
        "access-token",
        "current-password",
        "new-password"
      )
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

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
