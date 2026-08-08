/** Redis 不可用时认证能力必须失败关闭。 */
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StargateConfig } from "../src/config";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  accountUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  tenantFindUnique: vi.fn().mockResolvedValue({
    id: "default",
    status: "active",
  }),
  redis: {
    del: vi.fn<(...args: unknown[]) => Promise<number>>(),
    eval: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    expire: vi.fn<(...args: unknown[]) => Promise<number>>(),
    get: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
    incr: vi.fn<(...args: unknown[]) => Promise<number>>(),
    ping: vi.fn<(...args: unknown[]) => Promise<string>>(),
    set: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
  },
}));

vi.mock("@repo/db", () => ({
  checkDbHealth: vi.fn().mockResolvedValue({ latencyMs: 0, ok: true }),
  db: {
    $transaction: (callback: (transaction: unknown) => unknown) =>
      Promise.resolve(
        callback({
          account: { updateMany: mocks.accountUpdateMany },
          session: { deleteMany: mocks.sessionDeleteMany },
        })
      ),
    account: {
      findFirst: mocks.accountFindFirst,
      updateMany: mocks.accountUpdateMany,
    },
    authAuditEvent: { create: mocks.auditCreate },
    session: { deleteMany: mocks.sessionDeleteMany },
    tenant: { findUnique: mocks.tenantFindUnique },
  },
}));

vi.mock("@repo/redis", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue({
    error: "redis unavailable",
    latencyMs: 0,
    ok: false,
  }),
  getRedisClient: () => mocks.redis,
  withRedisTimeout: <T>(promise: Promise<T>) => promise,
}));

import { signAccessToken } from "../src/access-token";
import { StargateServiceError } from "../src/errors";
import { checkStargateHealth, createStargateService } from "../src/service";

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
  adminApiKey: "admin-api-key",
  apiKey: "api-key",
  captchaAttempts: 5,
  captchaCreateLimit: 30,
  captchaCreateWindowSeconds: 60,
  captchaHmacSecret: "captcha-secret",
  captchaTtlSeconds: 300,
  clockToleranceSeconds: 30,
  jwtSecret: "jwt-secret",
  loginAttempts: 5,
  loginLockSeconds: 60,
  passwordChangeAttempts: 3,
  passwordChangeLockSeconds: 2,
  primary: { id: "primary", secret: "primary-secret" },
  redisKeyPrefix: "redis-failure:",
  refreshTtlSeconds: 604_800,
  testCaptcha: true,
  tenantApiKeyPrimary: {
    id: "tenant-primary",
    secret: "tenant-primary-secret",
  },
  tokenTtlSeconds: 3600,
};

const salt = "abcdefghijklm";
const currentPassword = "current-password";
const passwordHash = `${salt}${createHash("md5")
  .update(`${currentPassword}${salt}`)
  .digest("hex")}`;
const accessToken = signAccessToken({
  accountId: "account-1",
  secret: config.jwtSecret,
  sessionId: "session-1",
  tenantId: "default",
  ttlSeconds: config.tokenTtlSeconds,
}).token;

beforeEach(() => {
  mocks.accountFindFirst.mockReset().mockResolvedValue({
    deletedAt: null,
    id: "account-1",
    passwordAlgorithm: "legacy-md5",
    passwordHash,
    status: "active",
    tenantId: "default",
  });
  mocks.accountUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockReset().mockResolvedValue({});
  mocks.sessionDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.tenantFindUnique.mockClear();
  mocks.redis.del.mockReset().mockResolvedValue(1);
  mocks.redis.eval.mockReset().mockResolvedValue(1);
  mocks.redis.expire.mockReset().mockResolvedValue(1);
  mocks.redis.get.mockReset().mockResolvedValue(null);
  mocks.redis.incr.mockReset().mockResolvedValue(1);
  mocks.redis.ping.mockReset().mockResolvedValue("PONG");
  mocks.redis.set.mockReset().mockResolvedValue("OK");
});

describe("redis failure handling", () => {
  it("does not return a captcha when rate limiting is unavailable", async () => {
    mocks.redis.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      createStargateService(config).createCaptcha(undefined, {
        ip: "203.0.113.1",
      })
    ).rejects.toThrow("redis unavailable");
  });

  it("never accepts a captcha when storage is unavailable", async () => {
    mocks.redis.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      createStargateService(config).verifyCaptcha(
        undefined,
        "captcha-1",
        "ABCD"
      )
    ).rejects.toThrow("redis unavailable");
  });

  it("does not query accounts when the login lock cannot be checked", async () => {
    mocks.redis.get.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      createStargateService(config).login(
        undefined,
        {
          captchaCode: "ABCD",
          captchaId: "captcha-1",
          login: "account",
          password: "password",
        },
        { requestId: "redis-failure-login" }
      )
    ).rejects.toThrow("redis unavailable");
    expect(mocks.accountFindFirst).not.toHaveBeenCalled();
  });

  it("reports Redis as unavailable in readiness", async () => {
    await expect(checkStargateHealth()).resolves.toMatchObject({
      database: { ok: true },
      redis: { error: "redis unavailable", ok: false },
    });
  });

  it("fails closed when the password-change lock cannot be read", async () => {
    mocks.redis.get.mockRejectedValueOnce(new Error("redis unavailable"));
    let received: unknown;
    try {
      await createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword, newPassword: "new-password" },
        { requestId: "password-change-get-failure" }
      );
    } catch (error) {
      received = error;
    }
    expect(received).toBeInstanceOf(Error);
    expect(received).not.toBeInstanceOf(StargateServiceError);
    expect(mocks.accountUpdateMany).not.toHaveBeenCalled();
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("fails closed when a password mismatch cannot be counted", async () => {
    mocks.redis.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword: "wrong-password", newPassword: "new-password" },
        { requestId: "password-change-eval-failure" }
      )
    ).rejects.toThrow("redis unavailable");
    expect(mocks.accountUpdateMany).not.toHaveBeenCalled();
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("lets a failed audit replace the current-password error", async () => {
    mocks.auditCreate.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword: "wrong-password", newPassword: "new-password" },
        { requestId: "password-change-failure-audit" }
      )
    ).rejects.toThrow("audit unavailable");
    expect(mocks.accountUpdateMany).not.toHaveBeenCalled();
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("keeps a committed password change successful when counter cleanup fails", async () => {
    mocks.redis.del.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword, newPassword: "new-password" },
        { requestId: "password-change-del-failure" }
      )
    ).resolves.toBeUndefined();
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.sessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "password.self_change",
        metadata: { failureCounterCleared: "false" },
        success: true,
      }),
    });
  });

  it("surfaces a successful audit failure after committing the password change", async () => {
    mocks.auditCreate.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword, newPassword: "new-password" },
        { requestId: "password-change-success-audit-failure" }
      )
    ).rejects.toThrow("audit unavailable");
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.sessionDeleteMany).toHaveBeenCalledTimes(1);
  });
});
