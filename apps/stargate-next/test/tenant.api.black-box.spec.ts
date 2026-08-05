/** Multi-tenant HTTP 越权、错误矩阵与 Tenant API Key 黑盒回归。 */
import { describe, expect, it } from "vitest";

import { env, login, request } from "./support/black-box";

const adminApiKey = env("STARGATE_ADMIN_API_KEY");
const TENANT_API_KEY_PATTERN = /^stk_[A-Za-z0-9_-]{32}$/;

describe("Given the multi-tenant HTTP API", () => {
  it("isolates accounts and enforces the frozen credential matrix", async () => {
    const suffix = Date.now().toString(36);
    const tenantId = `bb-${suffix}`;
    const username = `shared${suffix}`;
    const createdTenant = await request("/v1/tenants", "POST", {
      apiKey: adminApiKey,
      body: { id: tenantId, name: " Black Box " },
    });
    expect(createdTenant.status).toBe(201);
    expect(createdTenant.body).toMatchObject({
      id: tenantId,
      name: "Black Box",
      status: "active",
    });
    expect(createdTenant.body).not.toHaveProperty("active");
    expect(
      await request(`/v1/tenants/${tenantId}`, "GET", { adminKey: true })
    ).toMatchObject({ status: 200, body: { id: tenantId } });
    const tenantList = await request(
      `/v1/tenants?page[offset]=0&page[limit]=10&filter[name]=${encodeURIComponent("Black Box")}`,
      "GET",
      { adminKey: true }
    );
    expect(tenantList.status).toBe(200);
    expect(
      (tenantList.body as { data: Array<{ id: string }> }).data.map(
        ({ id }) => id
      )
    ).toContain(tenantId);
    expect(
      await request(`/v1/tenants/${tenantId}`, "PATCH", {
        adminKey: true,
        body: { name: "Renamed Black Box" },
      })
    ).toMatchObject({
      status: 200,
      body: { name: "Renamed Black Box", status: "active" },
    });

    const defaultAccount = await request("/v1/accounts", "POST", {
      body: { password: "default-password", username },
      service: true,
    });
    const tenantAccount = await request("/v1/accounts", "POST", {
      apiKey: adminApiKey,
      body: { password: "tenant-password", username },
      tenantId,
    });
    expect(defaultAccount.status).toBe(201);
    expect(tenantAccount.status).toBe(201);
    expect((defaultAccount.body as { tenantId: string }).tenantId).toBe(
      "default"
    );
    expect((tenantAccount.body as { tenantId: string }).tenantId).toBe(
      tenantId
    );

    const crossRead = await request(
      `/v1/accounts/${(tenantAccount.body as { id: string }).id}`,
      "GET",
      { service: true }
    );
    expect(crossRead).toMatchObject({
      status: 404,
      body: { code: "ACCOUNT_NOT_FOUND" },
    });
    const tenantAccountId = (tenantAccount.body as { id: string }).id;
    for (const path of [
      `/v1/accounts/${tenantAccountId}`,
      `/v1/accounts/${tenantAccountId}/sessions`,
    ]) {
      expect(
        await request(path, "DELETE", {
          service: true,
        })
      ).toMatchObject({
        status: 404,
        body: { code: "ACCOUNT_NOT_FOUND" },
      });
    }
    const crossBatch = await request("/v1/accounts/@batchGet", "POST", {
      body: {
        accountIds: [
          (defaultAccount.body as { id: string }).id,
          (tenantAccount.body as { id: string }).id,
        ],
      },
      service: true,
    });
    expect(crossBatch.status).toBe(200);
    expect(
      (crossBatch.body as Array<{ id: string }>).map(({ id }) => id)
    ).toEqual([(defaultAccount.body as { id: string }).id]);
    const widenedService = await request("/v1/accounts", "GET", {
      service: true,
      tenantId,
    });
    expect(widenedService).toMatchObject({
      status: 401,
      body: { code: "API_KEY_INVALID" },
    });

    const signedIn = await login(
      username,
      "tenant-password",
      "192.0.2.1",
      tenantId
    );
    expect(signedIn).toMatchObject({
      status: 200,
      body: { tenantId },
    });
    const claims = JSON.parse(
      Buffer.from(
        (signedIn.body as { accessToken: string }).accessToken.split(".")[1],
        "base64url"
      ).toString("utf8")
    ) as { tid: string };
    expect(claims.tid).toBe(tenantId);

    const disabled = await request(`/v1/tenants/${tenantId}`, "PATCH", {
      apiKey: adminApiKey,
      body: { status: "disabled" },
    });
    expect(disabled).toMatchObject({
      status: 200,
      body: { status: "disabled" },
    });
    const disabledCaptcha = await request("/v1/captchas", "POST", {
      tenantId,
    });
    expect(disabledCaptcha).toMatchObject({
      status: 401,
      body: { code: "TENANT_INVALID" },
    });
    expect(
      await request(
        `/v1/accounts/${(tenantAccount.body as { id: string }).id}`,
        "GET",
        { adminKey: true, tenantId }
      )
    ).toMatchObject({
      status: 401,
      body: { code: "TENANT_DISABLED" },
    });
    expect(
      await request("/v1/auth/login", "POST", {
        body: {
          captchaCode: env("CAPTCHA_TEST_CODE"),
          captchaId: "disabled-tenant",
          login: username,
          password: "tenant-password",
        },
        tenantId,
      })
    ).toMatchObject({
      status: 401,
      body: { code: "LOGIN_INVALID" },
    });
  });

  it("creates one-time Tenant keys without exposing stored credentials", async () => {
    const suffix = `${Date.now().toString(36)}k`;
    const tenantId = `bb-${suffix}`;
    expect(
      (
        await request("/v1/tenants", "POST", {
          apiKey: adminApiKey,
          body: { id: tenantId },
        })
      ).status
    ).toBe(201);
    const created = await request("/v1/tenant-api-keys", "POST", {
      apiKey: adminApiKey,
      body: { name: "worker" },
      tenantId,
    });
    expect(created.status).toBe(201);
    const key = created.body as {
      firstFour: string;
      id: string;
      key: string;
      tenantId: string;
    };
    expect(key.key).toMatch(TENANT_API_KEY_PATTERN);
    expect(key.firstFour).toBe(key.key.slice(4, 8));
    expect(key.tenantId).toBe(tenantId);
    expect(created.body).not.toHaveProperty("hash");
    expect(created.body).not.toHaveProperty("hmacKeyId");

    const listed = await request("/v1/tenant-api-keys", "GET", {
      apiKey: key.key,
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(key.key);
    expect(JSON.stringify(listed.body)).not.toContain("hash");

    const patched = await request(`/v1/tenant-api-keys/${key.id}`, "PATCH", {
      apiKey: key.key,
      body: { name: "renamed-worker" },
    });
    expect(patched).toMatchObject({
      status: 200,
      body: { id: key.id, name: "renamed-worker", tenantId },
    });
    expect(patched.body).not.toHaveProperty("key");

    expect(
      await request("/v1/tenants", "GET", { apiKey: key.key })
    ).toMatchObject({
      status: 401,
      body: { code: "API_KEY_INVALID" },
    });
    expect(
      await request("/v1/tenants", "POST", {
        body: { id: `forbidden-${suffix}` },
        service: true,
      })
    ).toMatchObject({
      status: 401,
      body: { code: "API_KEY_INVALID" },
    });

    const mismatched = await request("/v1/tenant-api-keys", "GET", {
      apiKey: key.key,
      tenantId: "default",
    });
    expect(mismatched).toMatchObject({
      status: 401,
      body: { code: "API_KEY_INVALID" },
    });
    const selfDelete = await request(
      `/v1/tenant-api-keys/${key.id}`,
      "DELETE",
      { apiKey: key.key }
    );
    expect(selfDelete).toMatchObject({
      status: 400,
      body: { code: "TENANT_API_KEY_SELF_DELETE" },
    });
    expect(
      (
        await request(`/v1/tenant-api-keys/${key.id}`, "DELETE", {
          apiKey: adminApiKey,
          tenantId,
        })
      ).status
    ).toBe(204);
    expect(
      await request("/v1/tenant-api-keys", "GET", { apiKey: key.key })
    ).toMatchObject({
      status: 401,
      body: { code: "API_KEY_INVALID" },
    });
  });

  it("rejects malformed Tenant request bodies with stable 400 codes", async () => {
    const suffix = `${Date.now().toString(36)}m`;
    const tenantId = `bb-${suffix}`;
    expect(
      await request("/v1/tenants", "POST", {
        adminKey: true,
        body: { id: tenantId },
      })
    ).toMatchObject({ status: 201 });
    const createdKey = await request("/v1/tenant-api-keys", "POST", {
      adminKey: true,
      body: { name: "malformed-target" },
      tenantId,
    });
    expect(createdKey.status).toBe(201);
    const keyId = (createdKey.body as { id: string }).id;

    const malformedCases: Array<{
      body?: unknown;
      code: string;
      method: string;
      path: string;
      tenantId?: string;
    }> = [
      { body: [], code: "BODY_INVALID", method: "POST", path: "/v1/tenants" },
      {
        body: "invalid",
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      { body: null, code: "BODY_INVALID", method: "POST", path: "/v1/tenants" },
      {
        body: { id: 1 },
        code: "TENANT_ID_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { id: {} },
        code: "TENANT_ID_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { id: true },
        code: "TENANT_ID_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { name: 1 },
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { name: {} },
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { name: [] },
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { unknown: "x" },
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenants",
      },
      {
        body: { status: true },
        code: "PATCH_INVALID",
        method: "PATCH",
        path: `/v1/tenants/${tenantId}`,
      },
      {
        body: { status: "paused" },
        code: "PATCH_INVALID",
        method: "PATCH",
        path: `/v1/tenants/${tenantId}`,
      },
      {
        body: {},
        code: "PATCH_INVALID",
        method: "PATCH",
        path: `/v1/tenants/${tenantId}`,
      },
      {
        body: { id: "x" },
        code: "PATCH_INVALID",
        method: "PATCH",
        path: `/v1/tenants/${tenantId}`,
      },
      {
        body: { name: 1 },
        code: "BODY_INVALID",
        method: "POST",
        path: "/v1/tenant-api-keys",
        tenantId,
      },
      {
        body: { firstFour: "abcd" },
        code: "PATCH_INVALID",
        method: "PATCH",
        path: `/v1/tenant-api-keys/${keyId}`,
        tenantId,
      },
    ];
    for (const malformed of malformedCases) {
      expect(
        await request(malformed.path, malformed.method, {
          adminKey: true,
          body: malformed.body,
          tenantId: malformed.tenantId,
        })
      ).toMatchObject({
        status: 400,
        body: { code: malformed.code },
      });
    }
    expect(
      await request("/v1/tenants?filter[name]=a&filter[name]=b", "GET", {
        adminKey: true,
      })
    ).toMatchObject({ status: 400, body: { code: "PAGE_INVALID" } });
  });

  it("handles omitted, empty, malformed, and active Tenant headers", async () => {
    const suffix = `${Date.now().toString(36)}h`;
    const tenantId = `bb-${suffix}`;
    expect(
      await request("/v1/tenants", "POST", {
        adminKey: true,
        body: { id: tenantId },
      })
    ).toMatchObject({ status: 201 });

    const invalidHeaders: Array<string | null> = [
      null,
      " ",
      "\t",
      "TEST",
      "a".repeat(64),
      "-bad",
      "bad-",
      `missing-${suffix}`,
    ];
    for (const [index, tenantIdHeader] of invalidHeaders.entries()) {
      const managed = await request("/v1/accounts", "POST", {
        adminKey: true,
        body: {
          password: "header-password",
          username: `headerm${suffix}${index}`,
        },
        tenantIdHeader,
      });
      expect(managed).toMatchObject({
        status: 401,
        body: { code: "TENANT_INVALID" },
      });
      const publicLogin = await request("/v1/auth/login", "POST", {
        body: {
          captchaCode: env("CAPTCHA_TEST_CODE"),
          captchaId: "invalid-header",
          login: `headerp${suffix}${index}`,
          password: "header-password",
        },
        forwardedFor: `192.0.2.${index + 2}`,
        tenantIdHeader,
      });
      expect(publicLogin).toMatchObject({
        status: 401,
        body: { code: "LOGIN_INVALID" },
      });
    }

    const defaultUsername = `headerdefault${suffix}`;
    expect(
      await request("/v1/accounts", "POST", {
        adminKey: true,
        body: { password: "header-password", username: defaultUsername },
      })
    ).toMatchObject({ status: 201, body: { tenantId: "default" } });
    expect(
      await login(defaultUsername, "header-password", "192.0.2.20")
    ).toMatchObject({ status: 200, body: { tenantId: "default" } });

    const tenantUsername = `headertenant${suffix}`;
    expect(
      await request("/v1/accounts", "POST", {
        adminKey: true,
        body: { password: "header-password", username: tenantUsername },
        tenantIdHeader: tenantId,
      })
    ).toMatchObject({ status: 201, body: { tenantId } });
    expect(
      await login(tenantUsername, "header-password", "192.0.2.21", tenantId)
    ).toMatchObject({ status: 200, body: { tenantId } });
  });
});
