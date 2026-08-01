/** Redis 不可用时认证能力必须失败关闭。 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StargateConfig } from "../src/config";

const mocks = vi.hoisted(() => {
  const redisFailure = () => Promise.reject(new Error("redis unavailable"));
  return {
    accountFindFirst: vi.fn(),
    redis: {
      del: vi.fn(redisFailure),
      eval: vi.fn(redisFailure),
      expire: vi.fn(redisFailure),
      get: vi.fn(redisFailure),
      incr: vi.fn(redisFailure),
      ping: vi.fn(redisFailure),
      set: vi.fn(redisFailure),
    },
  };
});

vi.mock("@repo/db", () => ({
  checkDbHealth: vi.fn().mockResolvedValue({ latencyMs: 0, ok: true }),
  db: {
    account: { findFirst: mocks.accountFindFirst },
    authAuditEvent: { create: vi.fn() },
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

import { checkStargateHealth, createStargateService } from "../src/service";

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
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
  primary: { id: "primary", secret: "primary-secret" },
  redisKeyPrefix: "redis-failure:",
  refreshTtlSeconds: 604_800,
  testCaptcha: true,
  tokenTtlSeconds: 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redis failure handling", () => {
  it("does not return a captcha when rate limiting is unavailable", async () => {
    await expect(
      createStargateService(config).createCaptcha({ ip: "203.0.113.1" })
    ).rejects.toThrow("redis unavailable");
  });

  it("never accepts a captcha when storage is unavailable", async () => {
    await expect(
      createStargateService(config).verifyCaptcha("captcha-1", "ABCD")
    ).rejects.toThrow("redis unavailable");
  });

  it("does not query accounts when the login lock cannot be checked", async () => {
    await expect(
      createStargateService(config).login(
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
});
