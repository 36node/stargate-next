import { randomBytes } from "node:crypto";

import { db } from "@repo/db";
import { getRedisClient } from "@repo/redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadStargateConfig } from "../src/config";
import type { CreatedTenantApiKey, TenantScope } from "../src/contracts";
import { createStargateService } from "../src/service";

const prefix = `bypass${randomBytes(6).toString("hex")}`;
const tenantIds = [`${prefix}-a`, `${prefix}-b`];
const config = loadStargateConfig({
  CAPTCHA_HMAC_SECRET: `${prefix}-captcha`,
  CAPTCHA_TEST_CODE: "ABCD",
  CAPTCHA_TEST_MODE: "true",
  LOGIN_MAX_ATTEMPTS: "3",
  LOGIN_LOCK_SECONDS: "60",
  REFRESH_KEY_HMAC_PRIMARY_KEY_ID: "refresh",
  REFRESH_KEY_HMAC_PRIMARY_SECRET: `${prefix}-refresh`,
  REDIS_KEY_PREFIX: `${prefix}:`,
  STARGATE_ADMIN_API_KEY: `${prefix}-admin`,
  STARGATE_API_KEY: `${prefix}-service`,
  STARGATE_JWT_SECRET: `${prefix}-jwt`,
  TENANT_API_KEY_HMAC_PRIMARY_KEY_ID: "tenant",
  TENANT_API_KEY_HMAC_PRIMARY_SECRET: `${prefix}-tenant`,
});
const service = createStargateService(config);
const admin = service.resolveAdminCredential(config.adminApiKey);
const password = "bypass-account-password";
const skip = { skipCaptcha: true };
let scopes: TenantScope[];
let keys: CreatedTenantApiKey[];
let sequence = 0;
const defaultAccountIds: string[] = [];

function context(operation = "login") {
  sequence += 1;
  return {
    ip: "203.0.113.81",
    requestId: `${prefix}-${operation}-${sequence}`,
  };
}

function account(tenant = 0) {
  sequence += 1;
  return service.createAccount(
    scopes[tenant],
    {
      email: `user${sequence}@example.com`,
      password,
      phone: `+8613800${sequence.toString().padStart(6, "0")}`,
      username: `user${sequence}`,
    },
    context("account")
  );
}

function failureKey(login: string, tenant = 0) {
  return `${prefix}:login-failure:${encodeURIComponent(tenantIds[tenant])}:${login}`;
}

async function defaultAccount() {
  sequence += 1;
  const scope = await service.resolveApiCredential(config.apiKey, undefined);
  const created = await service.createAccount(
    scope,
    {
      username: `${prefix}user${sequence}`,
      password,
    },
    context("default-account")
  );
  defaultAccountIds.push(created.id);
  return created;
}

beforeAll(async () => {
  for (const id of tenantIds) {
    await service.createTenant(admin, { id }, context("tenant"));
  }
  scopes = await Promise.all(
    tenantIds.map((id) => service.resolveApiCredential(config.adminApiKey, id))
  );
  keys = await Promise.all(
    scopes.map((scope) => service.createTenantApiKey(scope, {}, context("key")))
  );
});

afterAll(async () => {
  const where = { tenantId: { in: tenantIds } };
  await db.account.deleteMany({
    where: { OR: [where, { id: { in: defaultAccountIds } }] },
  });
  await db.tenantApiKey.deleteMany({ where });
  await db.authAuditEvent.deleteMany({
    where: { OR: [where, { requestId: { startsWith: prefix } }] },
  });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  const redis = getRedisClient();
  const redisKeys = await redis.keys(`${prefix}:*`);
  if (redisKeys.length) {
    await redis.del(...redisKeys);
  }
  await redis.quit();
  await db.$disconnect();
});

describe("API Key captcha exemption", () => {
  it.each([
    { kind: "admin", header: undefined },
    { kind: "admin", header: "default" },
    { kind: "service", header: undefined },
    { kind: "service", header: "default" },
  ])("authenticates default Tenant using $kind with header $header and records its actor", async ({
    kind,
    header,
  }) => {
    const created = await defaultAccount();
    const apiKey = kind === "admin" ? config.adminApiKey : config.apiKey;
    const failureContext = context("password-failure");
    await expect(
      service.login(
        header,
        {
          login: created.username,
          password: "wrong",
          options: skip,
        },
        failureContext,
        apiKey
      )
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    const successContext = context("success");
    const tokens = await service.login(
      header,
      {
        login: created.username,
        password,
        options: skip,
        captchaCode: null,
        captchaId: [],
      },
      successContext,
      apiKey
    );
    expect(tokens).toMatchObject({
      accountId: created.id,
      tenantId: "default",
    });
    expect(
      service.accessTokenClaims(`Bearer ${tokens.accessToken}`)
    ).toMatchObject({ tenantId: "default" });
    for (const [requestContext, success] of [
      [failureContext, false],
      [successContext, true],
    ] as const) {
      const audit = await db.authAuditEvent.findFirstOrThrow({
        where: { requestId: requestContext.requestId },
      });
      expect(audit).toMatchObject({
        accountId: created.id,
        actorType: kind,
        actorId: null,
        metadata: { method: `${kind}_api_key` },
        tenantId: "default",
        success,
      });
      expect(JSON.stringify(audit)).not.toContain(apiKey);
      expect(JSON.stringify(audit)).not.toContain(password);
    }
    await expect(
      service.refresh("default", tokens.refreshKey, context())
    ).resolves.toMatchObject({ sessionId: tokens.sessionId });
    await service.logout("default", `Bearer ${tokens.accessToken}`, context());
    await expect(
      service.refresh("default", tokens.refreshKey, context())
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
  });

  it("lets Admin choose a non-default Tenant while Service remains bound to default", async () => {
    const created = await account();
    const requestContext = context();
    const tokens = await service.login(
      tenantIds[0],
      {
        login: created.username,
        password,
        options: skip,
      },
      requestContext,
      config.adminApiKey
    );
    expect(tokens).toMatchObject({
      accountId: created.id,
      tenantId: tenantIds[0],
    });
    expect(
      await db.authAuditEvent.findFirstOrThrow({
        where: { requestId: requestContext.requestId },
      })
    ).toMatchObject({
      actorType: "admin",
      actorId: null,
      metadata: { method: "admin_api_key" },
      tenantId: tenantIds[0],
    });
    const failureContext = context();
    await expect(
      service.login(
        tenantIds[0],
        { login: created.username, password: "wrong", options: skip },
        failureContext,
        config.adminApiKey
      )
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    expect(
      await db.authAuditEvent.findFirstOrThrow({
        where: { requestId: failureContext.requestId },
      })
    ).toMatchObject({
      actorType: "admin",
      actorId: null,
      accountId: created.id,
      metadata: { method: "admin_api_key" },
      success: false,
    });
    for (const header of [tenantIds[0], "missing-tenant"]) {
      await expect(
        service.login(header, { options: skip }, context(), config.apiKey)
      ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    }
    await expect(
      service.login(
        "missing-tenant",
        { options: skip },
        context(),
        config.adminApiKey
      )
    ).rejects.toMatchObject({ code: "TENANT_INVALID" });
  });

  it("authenticates each identifier, infers Tenant and records the key actor", async () => {
    const created = await account();
    for (const login of [
      created.username.toUpperCase(),
      created.email,
      created.phone,
    ]) {
      const requestContext = context();
      const tokens = await service.login(
        undefined,
        { login, password, options: skip },
        requestContext,
        keys[0].key
      );
      expect(tokens).toMatchObject({
        accountId: created.id,
        tenantId: tenantIds[0],
      });
      expect(service.accessTokenClaims(`Bearer ${tokens.accessToken}`)).toEqual(
        {
          accountId: created.id,
          sessionId: tokens.sessionId,
          tenantId: tenantIds[0],
        }
      );
      expect(
        await db.authAuditEvent.findFirstOrThrow({
          where: { requestId: requestContext.requestId },
        })
      ).toMatchObject({
        accountId: created.id,
        actorId: keys[0].id,
        actorType: "tenant_key",
        metadata: { method: "tenant_api_key" },
        sessionId: tokens.sessionId,
        success: true,
      });
    }
    expect((await service.getTenant(admin, tenantIds[0])).settings).toEqual({});
  });

  it("rejects invalid credentials and checks credential scope before fields", async () => {
    for (const key of [undefined, "invalid"]) {
      await expect(
        service.login(
          undefined,
          { options: skip, captchaCode: null },
          context(),
          key
        )
      ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    }
    for (const header of [tenantIds[1], "missing-tenant"]) {
      await expect(
        service.login(header, { options: skip }, context(), keys[0].key)
      ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    }
    for (const apiKey of [keys[0].key, config.adminApiKey, config.apiKey]) {
      for (const header of ["", " ", "BAD", "a".repeat(64)]) {
        await expect(
          service.login(header, { options: skip }, context(), apiKey)
        ).rejects.toMatchObject({ code: "TENANT_INVALID" });
      }
    }
    await service.patchTenant(
      admin,
      tenantIds[1],
      { status: "disabled" },
      context()
    );
    await expect(
      service.login(undefined, { options: skip }, context(), keys[1].key)
    ).rejects.toMatchObject({ code: "TENANT_DISABLED" });
    await expect(
      service.login(
        tenantIds[1],
        { options: skip },
        context(),
        config.adminApiKey
      )
    ).rejects.toMatchObject({ code: "TENANT_DISABLED" });
    await service.patchTenant(
      admin,
      tenantIds[1],
      { status: "active" },
      context()
    );
  });

  it("validates options and fields without accumulating password failures", async () => {
    const created = await account();
    for (const options of [
      null,
      [],
      "true",
      true,
      1,
      { skipCaptcha: "true" },
      { skipCaptcha: null },
      { unknown: true },
    ]) {
      await expect(
        service.login(
          undefined,
          { login: created.username, password, options },
          context(),
          keys[0].key
        )
      ).rejects.toMatchObject({ code: "BODY_INVALID" });
    }
    await expect(
      service.login(
        undefined,
        { login: created.username, options: skip },
        context(),
        keys[0].key
      )
    ).rejects.toMatchObject({ code: "PASSWORD_INVALID" });
    await expect(
      service.login(
        undefined,
        { password, options: skip },
        context(),
        keys[0].key
      )
    ).rejects.toMatchObject({ code: "LOGIN_IDENTIFIER_INVALID" });
    await expect(
      service.login(
        undefined,
        { login: created.username, password, options: skip },
        context(),
        "wrong"
      )
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    expect(await getRedisClient().get(failureKey(created.username))).toBeNull();
  });

  it("preserves public login behavior and ignores captcha only after authorization", async () => {
    const created = await account();
    for (const options of [undefined, {}, { skipCaptcha: false }]) {
      for (const key of [
        keys[0].key,
        "wrong",
        config.adminApiKey,
        config.apiKey,
      ]) {
        await expect(
          service.login(
            tenantIds[0],
            { login: created.username, password, options },
            context(),
            key
          )
        ).rejects.toMatchObject({ code: "CAPTCHA_CODE_INVALID" });
      }
    }
    await expect(
      service.login(
        undefined,
        { login: created.username, password },
        context(),
        keys[0].key
      )
    ).rejects.toMatchObject({ code: "CAPTCHA_CODE_INVALID" });
    const challenge = await service.createCaptcha(tenantIds[0], context());
    await service.login(
      undefined,
      {
        login: created.username,
        password,
        options: skip,
        captchaId: challenge.id,
        captchaCode: "ABCD",
      },
      context(),
      keys[0].key
    );
    expect(
      await service.verifyCaptcha(tenantIds[0], challenge.id, "ABCD")
    ).toBe(true);
    expect(
      await service.verifyCaptcha(tenantIds[0], challenge.id, "ABCD")
    ).toBe(false);
    await expect(
      service.login(
        tenantIds[0],
        {
          login: created.username,
          password,
          options: skip,
          captchaId: [],
          captchaCode: null,
        },
        context(),
        keys[0].key
      )
    ).resolves.toMatchObject({ accountId: created.id });

    await service.patchTenant(
      admin,
      tenantIds[1],
      { settings: { loginCaptchaRequired: false } },
      context()
    );
    const other = await account(1);
    await expect(
      service.login(
        tenantIds[1],
        { login: other.username, password },
        context(),
        "wrong"
      )
    ).resolves.toMatchObject({ accountId: other.id });
    await expect(
      service.login(
        tenantIds[1],
        { login: other.username, password, options: skip },
        context(),
        "wrong"
      )
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    await service.patchTenant(admin, tenantIds[1], { settings: {} }, context());
  });

  it("shares the lock across public login and different keys, isolated by Tenant", async () => {
    const created = await account();
    await service.createAccount(
      scopes[1],
      { username: created.username, password },
      context()
    );
    const secondKey = await service.createTenantApiKey(
      scopes[0],
      {},
      context()
    );
    for (let attempt = 0; attempt < config.loginAttempts; attempt += 1) {
      const challenge = await service.createCaptcha(tenantIds[0], context());
      const body =
        attempt % 2 === 0
          ? {
              login: created.username.toUpperCase(),
              password: "wrong",
              options: skip,
            }
          : {
              login: created.username,
              password: "wrong",
              captchaId: challenge.id,
              captchaCode: "ABCD",
            };
      await expect(
        service.login(
          tenantIds[0],
          body,
          context(),
          attempt === 2 ? config.adminApiKey : keys[0].key
        )
      ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    }
    expect(await getRedisClient().get(failureKey(created.username))).toBe("3");
    await expect(
      service.login(
        undefined,
        { login: created.username, password, options: skip },
        context(),
        secondKey.key
      )
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    await expect(
      service.login(
        tenantIds[0],
        { login: created.username, password, options: skip },
        context(),
        config.adminApiKey
      )
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    const challenge = await service.createCaptcha(tenantIds[0], context());
    await expect(
      service.login(
        tenantIds[0],
        {
          login: created.username,
          password,
          captchaId: challenge.id,
          captchaCode: "ABCD",
        },
        context()
      )
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    await expect(
      service.login(
        undefined,
        { login: created.username, password, options: skip },
        context(),
        keys[1].key
      )
    ).resolves.toMatchObject({ tenantId: tenantIds[1] });
    await getRedisClient().pexpire(failureKey(created.username), 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await service.login(
      undefined,
      { login: created.username, password, options: skip },
      context(),
      keys[0].key
    );
    await expect(
      service.login(
        undefined,
        { login: created.username, password: "wrong", options: skip },
        context(),
        keys[0].key
      )
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    await service.login(
      undefined,
      { login: created.username, password, options: skip },
      context(),
      keys[0].key
    );
    expect(await getRedisClient().get(failureKey(created.username))).toBeNull();
  });

  it("shares the default Tenant lock across Admin and Service keys", async () => {
    const created = await defaultAccount();
    for (const apiKey of [
      config.adminApiKey,
      config.apiKey,
      config.adminApiKey,
    ]) {
      await expect(
        service.login(
          undefined,
          {
            login: created.username.toUpperCase(),
            password: "wrong",
            options: skip,
          },
          context(),
          apiKey
        )
      ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    }
    const counterKey = `${prefix}:login-failure:default:${created.username}`;
    expect(await getRedisClient().get(counterKey)).toBe("3");
    for (const apiKey of [config.adminApiKey, config.apiKey]) {
      await expect(
        service.login(
          "default",
          { login: created.username, password, options: skip },
          context(),
          apiKey
        )
      ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    }
    expect(await db.session.count({ where: { accountId: created.id } })).toBe(
      0
    );
    await getRedisClient().pexpire(counterKey, 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await service.login(
      undefined,
      { login: created.username, password, options: skip },
      context(),
      config.apiKey
    );
    expect(await getRedisClient().get(counterKey)).toBeNull();
  });

  it("unifies account rejection, records failure actors and does not create sessions", async () => {
    for (const state of [
      "wrong-password",
      "disabled",
      "deleted",
      "unsupported",
      "missing",
    ]) {
      const created = await account();
      if (state === "disabled") {
        await service.patchAccount(
          scopes[0],
          created.id,
          { active: false },
          context()
        );
      } else if (state === "deleted") {
        await service.deleteAccount(scopes[0], created.id, context());
      } else if (state === "unsupported") {
        await db.account.update({
          where: { id: created.id },
          data: { passwordAlgorithm: "unsupported" },
        });
      }
      const requestContext = context();
      await expect(
        service.login(
          undefined,
          {
            login:
              state === "missing"
                ? `${created.username}missing`
                : created.username,
            password: state === "wrong-password" ? "wrong" : password,
            options: skip,
          },
          requestContext,
          keys[0].key
        )
      ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
      expect(await db.session.count({ where: { accountId: created.id } })).toBe(
        0
      );
      const audit = await db.authAuditEvent.findFirstOrThrow({
        where: { requestId: requestContext.requestId },
      });
      expect(audit).toMatchObject({
        actorType: "tenant_key",
        actorId: keys[0].id,
        metadata: { method: "tenant_api_key" },
        success: false,
        accountId:
          state === "missing" || state === "deleted" ? null : created.id,
      });
      for (const secret of [
        keys[0].key,
        password,
        "passwordHash",
        "refreshKey",
      ]) {
        expect(JSON.stringify(audit)).not.toContain(secret);
      }
    }
  });

  it("keeps existing sessions usable after key deletion and supports logout and revoke", async () => {
    const created = await account();
    const key = await service.createTenantApiKey(scopes[0], {}, context());
    const tokens = await service.login(
      undefined,
      { login: created.username, password, options: skip },
      context(),
      key.key
    );
    await service.deleteTenantApiKey(scopes[0], key.id, context());
    await expect(
      service.login(
        undefined,
        { login: created.username, password, options: skip },
        context(),
        key.key
      )
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    await expect(
      service.refresh(tenantIds[0], tokens.refreshKey, context())
    ).resolves.toMatchObject({
      sessionId: tokens.sessionId,
      refreshKey: tokens.refreshKey,
    });
    await expect(
      service.refresh(tenantIds[1], tokens.refreshKey, context())
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
    await service.logout(
      tenantIds[0],
      `Bearer ${tokens.accessToken}`,
      context()
    );
    await expect(
      service.refresh(tenantIds[0], tokens.refreshKey, context())
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
    const next = await service.login(
      undefined,
      { login: created.username, password, options: skip },
      context(),
      keys[0].key
    );
    await service.revokeSessions(
      scopes[0],
      created.id,
      context(),
      "admin_single_revoke",
      next.sessionId
    );
    await expect(
      service.refresh(tenantIds[0], next.refreshKey, context())
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
  });
});
