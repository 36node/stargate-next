/** Redis 中 captcha、限流与登录锁的 Tenant 隔离真实回归。 */
import { randomBytes } from "node:crypto";

import { db } from "@repo/db";
import { getRedisClient } from "@repo/redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StargateConfig } from "../src/config";
import type {
  PublicAccount,
  RequestContext,
  TenantScope,
} from "../src/contracts";
import { createStargateService } from "../src/service";

const prefix = `redisitest${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const tenantId = `${prefix}-tenant`;
const accountIds = new Set<string>();

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
  adminApiKey: `${prefix}-admin-key`,
  apiKey: `${prefix}-service-key`,
  captchaAttempts: 3,
  captchaCreateLimit: 3,
  captchaCreateWindowSeconds: 60,
  captchaHmacSecret: `${prefix}-captcha-secret`,
  captchaTestCode: "ABCD",
  captchaTtlSeconds: 300,
  clockToleranceSeconds: 30,
  jwtSecret: `${prefix}-jwt-secret`,
  loginAttempts: 2,
  loginLockSeconds: 60,
  passwordChangeAttempts: 2,
  passwordChangeLockSeconds: 60,
  primary: { id: `${prefix}-refresh`, secret: `${prefix}-refresh-secret` },
  redisKeyPrefix: `${prefix}:`,
  refreshTtlSeconds: 604_800,
  tenantApiKeyPrimary: {
    id: `${prefix}-tenant-primary`,
    secret: `${prefix}-tenant-primary-secret`,
  },
  testCaptcha: true,
  tokenTtlSeconds: 3600,
};

const service = createStargateService(config);
const adminScope = service.resolveAdminCredential(config.adminApiKey);
let defaultScope: TenantScope;
let tenantScope: TenantScope;
let requestSequence = 0;

function context(operation: string, ip: string): RequestContext {
  requestSequence += 1;
  return {
    ip,
    requestId: `${prefix}-${operation}-${requestSequence}`,
    userAgent: "redis-tenant-integration-test",
  };
}

function redisKey(category: string, scopeTenantId: string, suffix: string) {
  return `${config.redisKeyPrefix}${category}:${scopeTenantId}:${suffix}`;
}

async function clearRedisPrefix(): Promise<void> {
  const client = getRedisClient();
  let cursor = "0";
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      "MATCH",
      `${config.redisKeyPrefix}*`,
      "COUNT",
      100
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } while (cursor !== "0");
}

async function createSharedAccount(
  username: string,
  password: string
): Promise<{ defaultAccount: PublicAccount; tenantAccount: PublicAccount }> {
  const created: PublicAccount[] = [];
  for (const scope of [defaultScope, tenantScope]) {
    const account = await service.createAccount(
      scope,
      { password, username },
      context(`account-${scope.tenantId}`, "192.0.2.1")
    );
    accountIds.add(account.id);
    created.push(account);
  }
  const [defaultAccount, tenantAccount] = created as [
    PublicAccount,
    PublicAccount,
  ];
  return { defaultAccount, tenantAccount };
}

async function loginAttempt(
  scopeTenantId: string,
  username: string,
  password: string,
  operation: string
) {
  const ip = `192.0.2.${requestSequence + 10}`;
  const tenantHeader = scopeTenantId === "default" ? undefined : scopeTenantId;
  const challenge = await service.createCaptcha(
    tenantHeader,
    context(`${operation}-captcha`, ip)
  );
  return service.login(
    tenantHeader,
    {
      captchaCode: "ABCD",
      captchaId: challenge.id,
      login: username,
      password,
    },
    context(operation, ip)
  );
}

beforeAll(async () => {
  await service.createTenant(
    adminScope,
    { id: tenantId, name: "Redis integration tenant" },
    context("tenant-create", "192.0.2.2")
  );
  [defaultScope, tenantScope] = await Promise.all([
    service.resolveApiCredential(config.apiKey, undefined),
    service.resolveApiCredential(config.adminApiKey, tenantId),
  ]);
});

afterAll(async () => {
  const ids = [...accountIds];
  await db.session.deleteMany({ where: { accountId: { in: ids } } });
  await db.authAuditEvent.deleteMany({
    where: {
      OR: [{ requestId: { startsWith: prefix } }, { accountId: { in: ids } }],
    },
  });
  await db.account.deleteMany({ where: { id: { in: ids } } });
  await db.tenantApiKey.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
  await clearRedisPrefix();
  await db.$disconnect();
  getRedisClient().disconnect();
});

describe("Tenant-isolated Redis state", () => {
  it("does not consume another Tenant's captcha challenge", async () => {
    const challenge = await service.createCaptcha(
      undefined,
      context("captcha-owner", "192.0.2.20")
    );
    await expect(
      service.verifyCaptcha(tenantId, challenge.id, "ABCD")
    ).resolves.toBe(false);
    await expect(
      service.verifyCaptcha(undefined, challenge.id, "ABCD")
    ).resolves.toBe(true);
  });

  it("allocates independent captcha rate-limit windows for the same IP", async () => {
    const ip = "192.0.2.21";
    for (const header of [undefined, tenantId]) {
      for (let count = 0; count < config.captchaCreateLimit; count += 1) {
        await expect(
          service.createCaptcha(header, context(`rate-${header}-${count}`, ip))
        ).resolves.toHaveProperty("id");
      }
      await expect(
        service.createCaptcha(header, context(`rate-${header}-blocked`, ip))
      ).rejects.toMatchObject({ code: "CAPTCHA_RATE_LIMITED" });
    }
    await expect(
      getRedisClient().pttl(redisKey("captcha-rate-limit", "default", ip))
    ).resolves.toBeGreaterThan(0);
    await expect(
      getRedisClient().pttl(redisKey("captcha-rate-limit", tenantId, ip))
    ).resolves.toBeGreaterThan(0);
  });

  it("locks the same login independently in each Tenant", async () => {
    const username = `${prefix}locked`;
    const password = "redis-lock-password";
    await createSharedAccount(username, password);

    for (let attempt = 0; attempt < config.loginAttempts; attempt += 1) {
      await expect(
        loginAttempt("default", username, "wrong-password", `lock-${attempt}`)
      ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    }
    await expect(
      loginAttempt("default", username, password, "default-locked")
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    await expect(
      loginAttempt(tenantId, username, password, "tenant-unlocked")
    ).resolves.toMatchObject({ tenantId });
  });

  it("clears only the successful Tenant's login failure key", async () => {
    const username = `${prefix}cleared`;
    const password = "redis-clear-password";
    await createSharedAccount(username, password);

    await expect(
      loginAttempt("default", username, "wrong-password", "default-failure")
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    await expect(
      loginAttempt(tenantId, username, "wrong-password", "tenant-failure")
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });

    const defaultFailureKey = redisKey("login-failure", "default", username);
    const tenantFailureKey = redisKey("login-failure", tenantId, username);
    await expect(getRedisClient().get(defaultFailureKey)).resolves.toBe("1");
    await expect(getRedisClient().get(tenantFailureKey)).resolves.toBe("1");

    await expect(
      loginAttempt(tenantId, username, password, "tenant-success")
    ).resolves.toMatchObject({ tenantId });
    await expect(getRedisClient().get(tenantFailureKey)).resolves.toBeNull();
    await expect(getRedisClient().get(defaultFailureKey)).resolves.toBe("1");
  });

  it("isolates password-change failures by Tenant and Account", async () => {
    const username = `${prefix}selfpwd`;
    const password = "redis-self-change-password";
    const { defaultAccount, tenantAccount } = await createSharedAccount(
      username,
      password
    );
    expect(defaultAccount.id).not.toBe(tenantAccount.id);
    const defaultTokens = await loginAttempt(
      "default",
      username,
      password,
      "self-change-default-login"
    );
    const tenantTokens = await loginAttempt(
      tenantId,
      username,
      password,
      "self-change-tenant-login"
    );

    await expect(
      service.selfChangePassword(
        undefined,
        `Bearer ${defaultTokens.accessToken}`,
        { currentPassword: "wrong-password", newPassword: "unused-password" },
        context("self-change-default-wrong-1", "192.0.2.70")
      )
    ).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INVALID" });
    await expect(
      service.selfChangePassword(
        undefined,
        `Bearer ${defaultTokens.accessToken}`,
        { currentPassword: "wrong-password", newPassword: "unused-password" },
        context("self-change-default-wrong-2", "192.0.2.71")
      )
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_LOCKED" });

    const defaultKey = redisKey(
      "password-change-failure",
      "default",
      defaultAccount.id
    );
    const tenantKey = redisKey(
      "password-change-failure",
      tenantId,
      tenantAccount.id
    );
    await expect(getRedisClient().get(defaultKey)).resolves.not.toBeNull();
    await expect(getRedisClient().get(tenantKey)).resolves.toBeNull();

    await expect(
      loginAttempt(
        "default",
        username,
        password,
        "self-change-login-lock-independent"
      )
    ).resolves.toMatchObject({ accountId: defaultAccount.id });
    await expect(
      loginAttempt(
        tenantId,
        username,
        "wrong-password",
        "self-change-tenant-login-failure"
      )
    ).rejects.toMatchObject({ code: "LOGIN_INVALID" });
    await expect(
      service.selfChangePassword(
        tenantId,
        `Bearer ${tenantTokens.accessToken}`,
        {
          currentPassword: password,
          newPassword: "redis-self-change-new-password",
        },
        context("self-change-tenant-success", "192.0.2.72")
      )
    ).resolves.toBeUndefined();
    await expect(getRedisClient().get(tenantKey)).resolves.toBeNull();
  });

  it("allows a valid issued token to self-change after Tenant disablement", async () => {
    const username = `${prefix}disabledselfpwd`;
    const password = "redis-disabled-tenant-password";
    const { tenantAccount } = await createSharedAccount(username, password);
    const tenantTokens = await loginAttempt(
      tenantId,
      username,
      password,
      "disabled-tenant-self-change-login"
    );
    const original = await db.account.findUniqueOrThrow({
      where: { id: tenantAccount.id },
    });

    await service.patchTenant(
      adminScope,
      tenantId,
      { status: "disabled" },
      context("disabled-tenant-self-change-disable", "192.0.2.73")
    );
    try {
      await expect(
        service.selfChangePassword(
          tenantId,
          `Bearer ${tenantTokens.accessToken}`,
          {
            currentPassword: password,
            newPassword: "redis-disabled-tenant-new-password",
          },
          context("disabled-tenant-self-change", "192.0.2.74")
        )
      ).resolves.toBeUndefined();
      const updated = await db.account.findUniqueOrThrow({
        where: { id: tenantAccount.id },
      });
      expect(updated.passwordHash).not.toBe(original.passwordHash);
      expect(updated.passwordChangedAt.getTime()).toBeGreaterThan(
        original.passwordChangedAt.getTime()
      );
    } finally {
      await service.patchTenant(
        adminScope,
        tenantId,
        { status: "active" },
        context("disabled-tenant-self-change-restore", "192.0.2.75")
      );
    }
  });
});
