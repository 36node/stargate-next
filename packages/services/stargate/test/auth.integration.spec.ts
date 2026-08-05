/** 真实 PostgreSQL 与 Redis 上的认证领域集成回归。 */
import { createHmac, randomBytes } from "node:crypto";

import { type AuthAuditEvent, db } from "@repo/db";
import { getRedisClient } from "@repo/redis";
import { afterAll, describe, expect, it } from "vitest";

import type { StargateConfig } from "../src/config";
import type { AuthTokens, RequestContext } from "../src/contracts";
import { createStargateService } from "../src/service";

const prefix = `authitest${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const accountIds = new Set<string>();
let sequence = 0;

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
  adminApiKey: "auth-itest-admin-api-key",
  apiKey: "auth-itest-api-key",
  captchaAttempts: 5,
  captchaCreateLimit: 30,
  captchaCreateWindowSeconds: 60,
  captchaHmacSecret: "auth-itest-captcha-secret",
  captchaTestCode: "ABCD",
  captchaTtlSeconds: 300,
  clockToleranceSeconds: 30,
  jwtSecret: "auth-itest-jwt-secret",
  loginAttempts: 5,
  loginLockSeconds: 60,
  primary: { id: "auth-itest-primary", secret: "auth-itest-primary-secret" },
  redisKeyPrefix: `${prefix}:`,
  refreshTtlSeconds: 604_800,
  secondary: {
    id: "auth-itest-secondary",
    secret: "auth-itest-secondary-secret",
  },
  testCaptcha: true,
  tenantApiKeyPrimary: {
    id: "auth-itest-tenant-primary",
    secret: "auth-itest-tenant-primary-secret",
  },
  tokenTtlSeconds: 3600,
};

const service = createStargateService(config);
const defaultScope = service.resolveApiCredential(config.apiKey, undefined);

function context(operation: string): RequestContext {
  return {
    ip: `203.0.113.${(sequence % 200) + 1}`,
    requestId: `${prefix}-${operation}`,
    userAgent: "auth-integration-test",
  };
}

function nextIdentity() {
  sequence += 1;
  return {
    email: `${prefix}${sequence}@example.com`,
    phone: `+861${Date.now().toString().slice(-8)}${sequence.toString().padStart(2, "0")}`,
    username: `${prefix}u${sequence.toString(36)}`,
  };
}

async function createAccount(
  password = "integration-password",
  overrides: { active?: boolean } = {}
) {
  const identity = nextIdentity();
  const account = await service.createAccount(
    await defaultScope,
    { ...identity, password, ...overrides },
    context(`account-${sequence}`)
  );
  accountIds.add(account.id);
  return { ...account, password };
}

function captcha(ip: string) {
  return service.createCaptcha(undefined, {
    ip,
    requestId: `${prefix}-captcha-${sequence}`,
  });
}

async function login(
  loginIdentifier: string,
  password: string,
  operation: string
): Promise<AuthTokens> {
  const requestContext = context(operation);
  const challenge = await captcha(requestContext.ip as string);
  return service.login(
    undefined,
    {
      captchaCode: "ABCD",
      captchaId: challenge.id,
      login: loginIdentifier,
      password,
    },
    requestContext
  );
}

async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  throw new Error("expected operation to reject");
}

function redisKey(category: string, suffix: string) {
  return `${config.redisKeyPrefix}${category}:default:${suffix}`;
}

async function waitUntilExpired(key: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3000) {
    if ((await getRedisClient().pttl(key)) === -2) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Redis key did not expire: ${key}`);
}

async function clearRedisPrefix(): Promise<number> {
  const client = getRedisClient();
  let cursor = "0";
  let deleted = 0;
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
      deleted += await client.del(...keys);
    }
  } while (cursor !== "0");
  return deleted;
}

afterAll(async () => {
  const ids = [...accountIds];
  await db.session.deleteMany({ where: { accountId: { in: ids } } });
  await db.authAuditEvent.deleteMany({
    where: {
      OR: [{ accountId: { in: ids } }, { requestId: { startsWith: prefix } }],
    },
  });
  await db.accountCreateIdempotency.deleteMany({
    where: { accountId: { in: ids } },
  });
  await db.account.deleteMany({ where: { id: { in: ids } } });
  await clearRedisPrefix();
  await db.$disconnect();
  getRedisClient().disconnect();
});

describe("authentication service integration", () => {
  it("keeps captcha verification atomic, bounded, and expiry-aware", async () => {
    const ip = "198.51.100.21";
    const once = await captcha(ip);
    await expect(
      service.verifyCaptcha(undefined, once.id, "ABCD")
    ).resolves.toBe(true);
    await expect(
      service.verifyCaptcha(undefined, once.id, "ABCD")
    ).resolves.toBe(false);

    const concurrent = await captcha(ip);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.verifyCaptcha(undefined, concurrent.id, "ABCD")
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);

    const exhausted = await captcha(ip);
    for (let attempt = 0; attempt < config.captchaAttempts; attempt += 1) {
      await expect(
        service.verifyCaptcha(undefined, exhausted.id, "WXYZ")
      ).resolves.toBe(false);
    }
    await expect(
      service.verifyCaptcha(undefined, exhausted.id, "ABCD")
    ).resolves.toBe(false);

    const stableTtl = await captcha(ip);
    const stableKey = redisKey("captcha", stableTtl.id);
    const before = await getRedisClient().pttl(stableKey);
    await service.verifyCaptcha(undefined, stableTtl.id, "WXYZ");
    const after = await getRedisClient().pttl(stableKey);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);

    const expiring = await captcha(ip);
    const expiringKey = redisKey("captcha", expiring.id);
    await getRedisClient().expire(expiringKey, 1);
    await waitUntilExpired(expiringKey);
    await expect(
      service.verifyCaptcha(undefined, expiring.id, "ABCD")
    ).resolves.toBe(false);
  });

  it("uses a fixed atomic captcha rate-limit window isolated by IP", async () => {
    const limitedIp = "198.51.100.22";
    for (let count = 0; count < config.captchaCreateLimit; count += 1) {
      await expect(captcha(limitedIp)).resolves.toHaveProperty("id");
    }
    const key = redisKey("captcha-rate-limit", limitedIp);
    const before = await getRedisClient().pttl(key);
    await expect(captcha(limitedIp)).rejects.toMatchObject({
      code: "CAPTCHA_RATE_LIMITED",
    });
    await expect(captcha(limitedIp)).rejects.toMatchObject({
      code: "CAPTCHA_RATE_LIMITED",
    });
    const after = await getRedisClient().pttl(key);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    await expect(captcha("203.0.113.222")).resolves.toHaveProperty("id");
  });

  it("logs in by username, phone, and email with identical token contracts", async () => {
    const account = await createAccount();
    for (const [label, identifier] of [
      ["username", account.username],
      ["phone", account.phone as string],
      ["email", account.email as string],
    ]) {
      const tokens = await login(
        identifier,
        account.password,
        `login-${label}-${sequence}`
      );
      expect(tokens.accountId).toBe(account.id);
      expect(tokens.sessionId).toBeTruthy();
      expect(tokens.accessToken.split(".")).toHaveLength(3);
    }
  });

  it("unifies invalid credentials after consuming captcha", async () => {
    const wrongPassword = await createAccount("correct-password");
    const disabled = await createAccount("disabled-password", {
      active: false,
    });
    const deleted = await createAccount("deleted-password");
    await db.account.update({
      data: { deletedAt: new Date() },
      where: { id: deleted.id },
    });
    const unknownAlgorithm = await createAccount("algorithm-password");
    await db.account.update({
      data: { passwordAlgorithm: "unknown" },
      where: { id: unknownAlgorithm.id },
    });

    const cases = [
      [wrongPassword.username, "wrong-password", "wrong-password"],
      [`${prefix}missing`, "anything", "missing"],
      [disabled.username, disabled.password, "disabled"],
      [deleted.username, deleted.password, "deleted"],
      [unknownAlgorithm.username, unknownAlgorithm.password, "algorithm"],
      ["!!!", "anything", "malformed-login"],
    ] as const;
    const errors: { code: string; message: string }[] = [];
    for (const [identifier, password, label] of cases) {
      errors.push(
        await rejected(
          login(identifier, password, `invalid-${label}-${sequence}`)
        )
      );
    }
    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(["LOGIN_INVALID"])
    );
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
  });

  it("returns explicit input codes for empty and whitespace credentials", async () => {
    for (const loginValue of ["", "   "]) {
      await expect(
        service.login(
          undefined,
          {
            captchaCode: "ABCD",
            captchaId: "unused",
            login: loginValue,
            password: "password",
          },
          context(`empty-login-${sequence}`)
        )
      ).rejects.toMatchObject({ code: "LOGIN_IDENTIFIER_INVALID" });
    }
    for (const password of ["", "   "]) {
      await expect(
        service.login(
          undefined,
          {
            captchaCode: "ABCD",
            captchaId: "unused",
            login: `${prefix}valid`,
            password,
          },
          context(`empty-password-${sequence}`)
        )
      ).rejects.toMatchObject({ code: "PASSWORD_INVALID" });
    }
  });

  it("uses a fixed login-failure window, locks at the threshold, and clears on success", async () => {
    const missing = `${prefix}locked`;
    const failureKey = redisKey("login-failure", missing);
    let previousTtl: number | undefined;
    for (let attempt = 1; attempt <= config.loginAttempts; attempt += 1) {
      const error = await rejected(
        login(missing, "wrong", `locked-${attempt}-${sequence}`)
      );
      expect(error.code).toBe("LOGIN_INVALID");
      const ttl = await getRedisClient().pttl(failureKey);
      expect(ttl).toBeGreaterThan(0);
      if (attempt > 1 && attempt < config.loginAttempts && previousTtl) {
        expect(ttl).toBeLessThanOrEqual(previousTtl);
      }
      previousTtl = ttl;
    }
    await expect(
      login(missing, "wrong", `locked-final-${sequence}`)
    ).rejects.toMatchObject({ code: "LOGIN_LOCKED" });

    const account = await createAccount("clear-failure-password");
    const accountFailureKey = redisKey("login-failure", account.username);
    await rejected(
      login(account.username, "wrong", `clear-failure-wrong-${sequence}`)
    );
    expect(await getRedisClient().get(accountFailureKey)).toBe("1");
    await login(
      account.username,
      account.password,
      `clear-failure-success-${sequence}`
    );
    expect(await getRedisClient().get(accountFailureKey)).toBeNull();
  });

  it("refreshes without mutating session facts and supports the secondary key", async () => {
    const account = await createAccount("refresh-password");
    const loggedIn = await login(
      account.username,
      account.password,
      `refresh-login-${sequence}`
    );
    const before = await db.session.findUniqueOrThrow({
      where: { id: loggedIn.sessionId },
    });
    const refreshed = await service.refresh(
      undefined,
      loggedIn.refreshKey,
      context(`refresh-success-${sequence}`)
    );
    const after = await db.session.findUniqueOrThrow({
      where: { id: loggedIn.sessionId },
    });
    expect(refreshed).toMatchObject({
      accountId: loggedIn.accountId,
      refreshKey: loggedIn.refreshKey,
      sessionId: loggedIn.sessionId,
    });
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.refreshKeyHash).toBe(before.refreshKeyHash);
    expect(after.refreshKeyHmacKeyId).toBe(before.refreshKeyHmacKeyId);

    const secondaryRefreshKey = `${prefix}-secondary-refresh`;
    const secondary = await db.session.create({
      data: {
        accountId: account.id,
        expiresAt: new Date(Date.now() + 3_600_000),
        refreshKeyHash: createHmac("sha256", config.secondary?.secret ?? "")
          .update(secondaryRefreshKey)
          .digest("hex"),
        refreshKeyHmacKeyId: config.secondary?.id ?? "",
        tenantId: "default",
      },
    });
    const secondaryResult = await service.refresh(
      undefined,
      secondaryRefreshKey,
      context(`refresh-secondary-${sequence}`)
    );
    expect(secondaryResult.sessionId).toBe(secondary.id);
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: secondary.id } }))
        .refreshKeyHmacKeyId
    ).toBe(config.secondary?.id);
  });

  it("unifies refresh failures for missing, expired, disabled, and deleted sessions", async () => {
    const expired = await createAccount("expired-refresh-password");
    const expiredKey = `${prefix}-expired-refresh`;
    await db.session.create({
      data: {
        accountId: expired.id,
        expiresAt: new Date(Date.now() - 1000),
        refreshKeyHash: createHmac("sha256", config.primary.secret)
          .update(expiredKey)
          .digest("hex"),
        refreshKeyHmacKeyId: config.primary.id,
        tenantId: "default",
      },
    });

    const disabled = await createAccount("disabled-refresh-password");
    const disabledTokens = await login(
      disabled.username,
      disabled.password,
      `disabled-refresh-login-${sequence}`
    );
    await db.account.update({
      data: { status: "disabled" },
      where: { id: disabled.id },
    });

    const deleted = await createAccount("deleted-refresh-password");
    const deletedTokens = await login(
      deleted.username,
      deleted.password,
      `deleted-refresh-login-${sequence}`
    );
    await db.account.update({
      data: { deletedAt: new Date() },
      where: { id: deleted.id },
    });

    const errors = await Promise.all([
      rejected(
        service.refresh(
          undefined,
          `${prefix}-missing`,
          context("refresh-missing")
        )
      ),
      rejected(
        service.refresh(undefined, expiredKey, context("refresh-expired"))
      ),
      rejected(
        service.refresh(
          undefined,
          disabledTokens.refreshKey,
          context("refresh-disabled")
        )
      ),
      rejected(
        service.refresh(
          undefined,
          deletedTokens.refreshKey,
          context("refresh-deleted")
        )
      ),
    ]);
    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(["REFRESH_INVALID"])
    );
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
  });

  it("lists only active sessions and scopes single or bulk revocation by account", async () => {
    const first = await createAccount("session-first-password");
    const second = await createAccount("session-second-password");
    const firstTokens = await login(
      first.username,
      first.password,
      `session-first-${sequence}`
    );
    const secondTokens = await login(
      second.username,
      second.password,
      `session-second-${sequence}`
    );
    await db.session.create({
      data: {
        accountId: first.id,
        expiresAt: new Date(Date.now() - 1000),
        refreshKeyHash: createHmac("sha256", config.primary.secret)
          .update(`${prefix}-expired-list`)
          .digest("hex"),
        refreshKeyHmacKeyId: config.primary.id,
        tenantId: "default",
      },
    });

    const listed = await service.listSessions(await defaultScope, first.id);
    expect(listed).toHaveLength(1);
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "updatedAt",
    ]);

    await service.revokeSessions(
      await defaultScope,
      second.id,
      context(`cross-revoke-${sequence}`),
      "admin_single_revoke",
      firstTokens.sessionId
    );
    await expect(
      service.refresh(
        undefined,
        firstTokens.refreshKey,
        context(`cross-refresh-${sequence}`)
      )
    ).resolves.toMatchObject({ sessionId: firstTokens.sessionId });

    await service.revokeSessions(
      await defaultScope,
      first.id,
      context(`bulk-revoke-${sequence}`),
      "admin_bulk_revoke"
    );
    await expect(
      service.listSessions(await defaultScope, first.id)
    ).resolves.toEqual([]);
    await expect(
      service.refresh(
        undefined,
        firstTokens.refreshKey,
        context(`bulk-refresh-${sequence}`)
      )
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
    await expect(
      service.refresh(
        undefined,
        secondTokens.refreshKey,
        context(`second-refresh-${sequence}`)
      )
    ).resolves.toMatchObject({ sessionId: secondTokens.sessionId });
    await expect(
      service.revokeSessions(
        await defaultScope,
        first.id,
        context(`missing-revoke-${sequence}`),
        "admin_single_revoke",
        `${prefix}-missing-session`
      )
    ).resolves.toBeUndefined();
  });

  it("records one safe audit row per authentication outcome", async () => {
    const account = await createAccount("audit-auth-password");
    const successContext = context(`audit-login-success-${sequence}`);
    const challenge = await captcha(successContext.ip as string);
    const tokens = await service.login(
      undefined,
      {
        captchaCode: "ABCD",
        captchaId: challenge.id,
        login: account.username,
        password: account.password,
      },
      successContext
    );
    await service.refresh(
      undefined,
      tokens.refreshKey,
      context(`audit-refresh-success-${sequence}`)
    );
    await rejected(
      service.refresh(
        undefined,
        `${prefix}-bad-refresh`,
        context(`audit-refresh-fail-${sequence}`)
      )
    );
    await rejected(
      login(`${prefix}unknownaudit`, "wrong", `audit-login-fail-${sequence}`)
    );
    await service.revokeSessions(
      await defaultScope,
      account.id,
      context(`audit-logout-${sequence}`),
      "logout",
      tokens.sessionId
    );
    await service.revokeSessions(
      await defaultScope,
      account.id,
      context(`audit-revoke-${sequence}`),
      "admin_bulk_revoke"
    );

    const expected = [
      ["login", `${prefix}-audit-login-success-${sequence}`, true],
      ["refresh", `${prefix}-audit-refresh-success-${sequence}`, true],
      ["refresh", `${prefix}-audit-refresh-fail-${sequence}`, false],
      ["login", `${prefix}-audit-login-fail-${sequence}`, false],
      ["logout", `${prefix}-audit-logout-${sequence}`, true],
      ["session.revoke", `${prefix}-audit-revoke-${sequence}`, true],
    ] as const;
    const rows: AuthAuditEvent[] = [];
    for (const [eventType, requestId, success] of expected) {
      const matching = await db.authAuditEvent.findMany({
        where: { eventType, requestId, success },
      });
      expect(matching).toHaveLength(1);
      rows.push(...matching);
    }
    const unknown = rows.find(
      (row) => row.requestId === `${prefix}-audit-login-fail-${sequence}`
    );
    expect(unknown).toMatchObject({ accountId: null, actorType: "anonymous" });
    const stored = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    const serialized = JSON.stringify(rows);
    for (const sensitive of [
      account.password,
      "ABCD",
      tokens.accessToken,
      tokens.refreshKey,
      stored.passwordHash,
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});
