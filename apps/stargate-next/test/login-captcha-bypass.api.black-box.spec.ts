import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { env, request, uniqueUsername } from "./support/black-box.js";

const tenantId = `bb-bypass-${randomBytes(6).toString("hex")}`;
const password = "api-bypass-password";
let key: { id: string; key: string };
function account(targetTenant = tenantId) {
  return request("/v1/accounts", "POST", {
    adminKey: true,
    tenantId: targetTenant,
    body: { username: uniqueUsername(), password },
  });
}

beforeAll(async () => {
  const tenant = await request("/v1/tenants", "POST", {
    adminKey: true,
    body: { id: tenantId },
  });
  if (tenant.status !== 201) {
    throw new Error(`Tenant fixture failed: ${tenant.status}`);
  }
  const created = await request("/v1/tenant-api-keys", "POST", {
    adminKey: true,
    tenantId,
    body: {},
  });
  if (created.status !== 201) {
    throw new Error(`Tenant key fixture failed: ${created.status}`);
  }
  key = created.body as typeof key;
});

describe("HTTP login captcha exemption", () => {
  it.each([
    { kind: "admin", target: "named", explicit: true },
    { kind: "admin", target: "default", explicit: false },
    { kind: "admin", target: "default", explicit: true },
    { kind: "service", target: "default", explicit: false },
    { kind: "service", target: "default", explicit: true },
  ])("supports $kind in $target with explicit header=$explicit", async ({
    kind,
    target,
    explicit,
  }) => {
    const targetTenant = target === "named" ? tenantId : "default";
    const created = await account(targetTenant);
    const { id: accountId, username } = created.body as {
      id: string;
      username: string;
    };
    const loggedIn = await request("/v1/auth/login", "POST", {
      apiKey: env(
        kind === "admin" ? "STARGATE_ADMIN_API_KEY" : "STARGATE_API_KEY"
      ),
      tenantId: explicit ? targetTenant : undefined,
      body: {
        login: username,
        password,
        options: { skipCaptcha: true },
        captchaCode: null,
        captchaId: [],
      },
    });
    expect(loggedIn).toMatchObject({
      status: 200,
      body: { accountId, tenantId: targetTenant },
    });
    const tokens = loggedIn.body as {
      accessToken: string;
      refreshKey: string;
      sessionId: string;
    };
    expect(
      await request("/v1/auth/refresh", "POST", {
        tenantId: targetTenant,
        body: { refreshKey: tokens.refreshKey },
      })
    ).toMatchObject({ status: 200, body: { sessionId: tokens.sessionId } });
    expect(
      await request("/v1/auth/login", "POST", {
        accessToken: tokens.accessToken,
        tenantId: targetTenant,
        body: { login: username, password, options: { skipCaptcha: true } },
      })
    ).toMatchObject({ status: 401, body: { code: "API_KEY_INVALID" } });
    expect(
      await request("/v1/auth/logout", "POST", {
        tenantId: targetTenant,
        accessToken: tokens.accessToken,
      })
    ).toMatchObject({ status: 204 });
  });

  it.each([
    null,
    [],
    true,
    "true",
    { skipCaptcha: "true" },
    { skipCaptcha: null },
    { extra: true },
  ])("rejects invalid options %j before checking credentials", async (options) => {
    expect(
      await request("/v1/auth/login", "POST", { body: { options } })
    ).toMatchObject({ status: 400, body: { code: "BODY_INVALID" } });
  });

  it("rejects invalid keys and requests outside credential scope", async () => {
    for (const apiKey of [undefined, "wrong"]) {
      expect(
        await request("/v1/auth/login", "POST", {
          apiKey,
          body: { options: { skipCaptcha: true }, captchaCode: null },
        })
      ).toMatchObject({ status: 401, body: { code: "API_KEY_INVALID" } });
    }
    expect(
      await request("/v1/auth/login", "POST", {
        service: true,
        tenantId,
        body: { options: { skipCaptcha: true } },
      })
    ).toMatchObject({ status: 401, body: { code: "API_KEY_INVALID" } });
    expect(
      await request("/v1/auth/login", "POST", {
        adminKey: true,
        tenantId: "missing-bypass-tenant",
        body: { options: { skipCaptcha: true } },
      })
    ).toMatchObject({ status: 401, body: { code: "TENANT_INVALID" } });
    expect(
      await request("/v1/auth/login", "POST", {
        apiKey: key.key,
        tenantId: "default",
        body: { options: { skipCaptcha: true } },
      })
    ).toMatchObject({ status: 401, body: { code: "API_KEY_INVALID" } });
    expect(
      await request("/v1/auth/login", "POST", {
        apiKey: key.key,
        tenantIdHeader: "BAD",
        body: { options: { skipCaptcha: true } },
      })
    ).toMatchObject({ status: 401, body: { code: "TENANT_INVALID" } });
    expect(
      await request("/v1/auth/login", "POST", {
        apiKey: key.key,
        body: { options: { skipCaptcha: true } },
      })
    ).toMatchObject({
      status: 400,
      body: { code: "LOGIN_IDENTIFIER_INVALID" },
    });
  });

  it("keeps captcha mandatory without explicit exemption and skips all captcha validation when authorized", async () => {
    const created = await account();
    const { username } = created.body as { username: string };
    for (const options of [undefined, {}, { skipCaptcha: false }]) {
      expect(
        await request("/v1/auth/login", "POST", {
          apiKey: key.key,
          tenantId,
          body: { login: username, password, options },
        })
      ).toMatchObject({ status: 400, body: { code: "CAPTCHA_CODE_INVALID" } });
    }
    expect(
      await request("/v1/auth/login", "POST", {
        apiKey: key.key,
        body: {
          login: username,
          password,
          options: { skipCaptcha: true },
          captchaCode: null,
          captchaId: [],
        },
      })
    ).toMatchObject({ status: 200, body: { tenantId } });
  });

  it("does not consume a submitted captcha and completes refresh and logout", async () => {
    const created = await account();
    const { id: accountId, username } = created.body as {
      id: string;
      username: string;
    };
    const challenge = await request("/v1/captchas", "POST", { tenantId });
    const captchaId = (challenge.body as { id: string }).id;
    const captchaCode = env("CAPTCHA_TEST_CODE");
    const loggedIn = await request("/v1/auth/login", "POST", {
      apiKey: key.key,
      tenantId,
      body: {
        login: username,
        password,
        options: { skipCaptcha: true },
        captchaId,
        captchaCode,
      },
    });
    expect(loggedIn).toMatchObject({
      status: 200,
      body: { accountId, tenantId },
    });
    const tokens = loggedIn.body as {
      accessToken: string;
      refreshKey: string;
      sessionId: string;
    };
    expect(
      await request("/v1/captchas/verify", "POST", {
        tenantId,
        body: { id: captchaId, code: captchaCode },
      })
    ).toMatchObject({ status: 200, body: { verified: true } });
    expect(
      await request("/v1/auth/refresh", "POST", {
        tenantId,
        body: { refreshKey: tokens.refreshKey },
      })
    ).toMatchObject({ status: 200, body: { sessionId: tokens.sessionId } });
    expect(
      await request("/v1/auth/logout", "POST", {
        tenantId,
        accessToken: tokens.accessToken,
      })
    ).toMatchObject({ status: 204 });
    expect(
      await request("/v1/auth/refresh", "POST", {
        tenantId,
        body: { refreshKey: tokens.refreshKey },
      })
    ).toMatchObject({ status: 401, body: { code: "REFRESH_INVALID" } });
  });
});
