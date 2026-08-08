/** 用户自改密码的条件更新与 Session 撤销必须保持原子。 */
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StargateConfig } from "../src/config";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  accountUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  redis: {
    del: vi.fn(),
    eval: vi.fn(),
    get: vi.fn(),
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
    account: { findFirst: mocks.accountFindFirst },
    authAuditEvent: { create: mocks.auditCreate },
  },
}));

vi.mock("@repo/redis", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue({ latencyMs: 0, ok: true }),
  getRedisClient: () => mocks.redis,
  withRedisTimeout: <T>(promise: Promise<T>) => promise,
}));

import { signAccessToken } from "../src/access-token";
import { createStargateService } from "../src/service";

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
  passwordChangeLockSeconds: 60,
  primary: { id: "primary", secret: "primary-secret" },
  redisKeyPrefix: "self-change-concurrency:",
  refreshTtlSeconds: 604_800,
  tenantApiKeyPrimary: {
    id: "tenant-primary",
    secret: "tenant-primary-secret",
  },
  testCaptcha: false,
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
  mocks.accountUpdateMany.mockReset();
  mocks.auditCreate.mockReset().mockResolvedValue({});
  mocks.sessionDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.redis.get.mockReset().mockResolvedValue(null);
  mocks.redis.eval.mockReset().mockResolvedValue(1);
  mocks.redis.del.mockReset().mockResolvedValue(1);
});

describe("self-change password concurrency", () => {
  it("rolls back without deleting sessions when the account changed concurrently", async () => {
    mocks.accountUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword, newPassword: "new-password" },
        { requestId: "self-change-concurrent-miss" }
      )
    ).rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID" });
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("deletes other sessions and audits success after one conditional update", async () => {
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      createStargateService(config).selfChangePassword(
        undefined,
        `Bearer ${accessToken}`,
        { currentPassword, newPassword: "new-password" },
        { requestId: "self-change-concurrent-success" }
      )
    ).resolves.toBeUndefined();
    expect(mocks.sessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "password.self_change",
        success: true,
      }),
    });
  });
});
