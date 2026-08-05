import { createHash, randomBytes } from "node:crypto";

import { type AuthAuditEvent, db } from "@repo/db";
import { afterAll, describe, expect, it } from "vitest";

import type { StargateConfig } from "../src/config";
import type { AccountInput, RequestContext } from "../src/contracts";
import { createStargateService } from "../src/service";

const PASSWORD_HASH_PATTERN = /^[A-Za-z0-9]{13}[a-f0-9]{32}$/;
const REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/;
const prefix = `itest${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const accountIds = new Set<string>();
const idempotencyKeys = new Set<string>();
let usernameSequence = 0;

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
  adminApiKey: "itest-admin-api-key",
  apiKey: "itest-api-key",
  captchaAttempts: 5,
  captchaCreateLimit: 30,
  captchaCreateWindowSeconds: 60,
  captchaHmacSecret: "itest-captcha-secret",
  captchaTtlSeconds: 300,
  clockToleranceSeconds: 30,
  jwtSecret: "itest-jwt-secret",
  loginAttempts: 5,
  loginLockSeconds: 60,
  primary: { id: "itest-k1", secret: "itest-s1" },
  redisKeyPrefix: `${prefix}:`,
  refreshTtlSeconds: 604_800,
  testCaptcha: false,
  tenantApiKeyPrimary: {
    id: "itest-tenant-k1",
    secret: "itest-tenant-s1",
  },
  tokenTtlSeconds: 3600,
};

const service = createStargateService(config);
const defaultScope = service.resolveApiCredential(config.apiKey, undefined);

function context(operation: string): RequestContext {
  return { requestId: `${prefix}-${operation}` };
}

function nextUsername(): string {
  usernameSequence += 1;
  return `${prefix}a${usernameSequence.toString(36)}`;
}

function legacyDigest(password: string, salt: string): string {
  return createHash("md5").update(`${password}${salt}`).digest("hex");
}

async function createAccount(input: AccountInput, operation: string) {
  if (input.idempotencyKey) {
    idempotencyKeys.add(input.idempotencyKey);
  }
  const account = await service.createAccount(
    await defaultScope,
    input,
    context(operation)
  );
  accountIds.add(account.id);
  return account;
}

async function seedSession(accountId: string, label: string) {
  const refreshKey = `${prefix}-${label}-refresh-key`;
  const refreshKeyHash = createHash("sha256").update(refreshKey).digest("hex");
  await db.session.create({
    data: {
      accountId,
      expiresAt: new Date(Date.now() + 3_600_000),
      refreshKeyHash,
      refreshKeyHmacKeyId: config.primary.id,
      tenantId: "default",
    },
  });
  return { refreshKey, refreshKeyHash };
}

afterAll(async () => {
  const ids = [...accountIds];
  await db.session.deleteMany({ where: { accountId: { in: ids } } });
  await db.accountCreateIdempotency.deleteMany({
    where: { key: { in: [...idempotencyKeys] } },
  });
  await db.authAuditEvent.deleteMany({
    where: {
      OR: [{ accountId: { in: ids } }, { requestId: { startsWith: prefix } }],
    },
  });
  await db.account.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("Account service integration", () => {
  it("stores independently salted legacy-md5 credentials", async () => {
    const password = "integration-create-password";
    const first = await createAccount(
      { password, username: nextUsername() },
      "credential-create-1"
    );
    const second = await createAccount(
      { password, username: nextUsername() },
      "credential-create-2"
    );
    const stored = await db.account.findMany({
      orderBy: { id: "asc" },
      where: { id: { in: [first.id, second.id] } },
    });
    expect(stored).toHaveLength(2);
    for (const account of stored) {
      expect(account.passwordAlgorithm).toBe("legacy-md5");
      expect(account.passwordHash).toMatch(PASSWORD_HASH_PATTERN);
      const salt = account.passwordHash.slice(0, 13);
      expect(account.passwordHash.slice(13)).toBe(legacyDigest(password, salt));
    }
    expect(stored[0]?.passwordHash.slice(0, 13)).not.toBe(
      stored[1]?.passwordHash.slice(0, 13)
    );
  });

  it("changes credentials against a stable timestamp baseline and removes sessions", async () => {
    const oldPassword = "integration-old-password";
    const newPassword = "integration-new-password";
    const account = await createAccount(
      { password: oldPassword, username: nextUsername() },
      "password-create"
    );
    const before = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    const baseline = new Date("2020-01-01T00:00:00.000Z");
    await db.account.update({
      data: { passwordChangedAt: baseline },
      where: { id: account.id },
    });
    await seedSession(account.id, "password-change");

    await service.changePassword(
      await defaultScope,
      account.id,
      newPassword,
      context("password-change")
    );
    const after = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    const salt = after.passwordHash.slice(0, 13);
    expect(after.passwordChangedAt.getTime()).toBeGreaterThan(
      baseline.getTime()
    );
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(salt).not.toBe(before.passwordHash.slice(0, 13));
    expect(after.passwordHash.slice(13)).toBe(legacyDigest(newPassword, salt));
    expect(after.passwordHash.slice(13)).not.toBe(
      legacyDigest(oldPassword, salt)
    );
    expect(await db.session.count({ where: { accountId: account.id } })).toBe(
      0
    );
  });

  it("writes exactly one safe audit event for each lifecycle operation", async () => {
    const password = "audit-plain-password";
    const account = await createAccount(
      { password, username: nextUsername() },
      "audit-create"
    );
    const { refreshKey, refreshKeyHash } = await seedSession(
      account.id,
      "audit"
    );
    await service.patchAccount(
      await defaultScope,
      account.id,
      { active: false },
      context("audit-update")
    );
    await service.changePassword(
      await defaultScope,
      account.id,
      "audit-next-password",
      context("audit-password")
    );
    const stored = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    await service.deleteAccount(
      await defaultScope,
      account.id,
      context("audit-delete")
    );

    const expected = [
      ["account.create", "audit-create"],
      ["account.update", "audit-update"],
      ["session.revoke", "audit-update"],
      ["password.change", "audit-password"],
      ["account.delete", "audit-delete"],
    ] as const;
    const events: AuthAuditEvent[] = [];
    for (const [eventType, operation] of expected) {
      const matching = await db.authAuditEvent.findMany({
        where: {
          accountId: account.id,
          eventType,
          requestId: `${prefix}-${operation}`,
        },
      });
      expect(matching).toHaveLength(1);
      events.push(...matching);
    }
    expect(
      events.find(({ eventType }) => eventType === "session.revoke")
    ).toMatchObject({ metadata: { reason: "account_disable" } });
    const serialized = JSON.stringify(events);
    for (const sensitive of [
      password,
      "audit-next-password",
      stored.passwordHash,
      refreshKey,
      refreshKeyHash,
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("persists soft-deletion facts while retaining audit history", async () => {
    const account = await createAccount(
      {
        email: `${nextUsername()}@example.com`,
        password: "soft-delete-password",
        phone: `+861${Date.now()}7`,
        username: nextUsername(),
      },
      "soft-delete-create"
    );
    await seedSession(account.id, "soft-delete");
    await service.deleteAccount(
      await defaultScope,
      account.id,
      context("soft-delete")
    );
    await service.deleteAccount(
      await defaultScope,
      account.id,
      context("soft-delete-repeat")
    );
    await expect(
      service.deleteAccount(
        await defaultScope,
        `${prefix}-missing-account`,
        context("soft-delete-missing")
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    const stored = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.email).toBeNull();
    expect(stored.phone).toBeNull();
    expect(stored.username).toBe(`deleted:${account.id}`);
    expect(await db.session.count({ where: { accountId: account.id } })).toBe(
      0
    );
    expect(
      await db.authAuditEvent.count({ where: { accountId: account.id } })
    ).toBeGreaterThan(0);
    expect(
      await db.authAuditEvent.count({
        where: {
          eventType: "account.delete",
          requestId: `${prefix}-soft-delete`,
        },
      })
    ).toBe(1);
    expect(
      await db.authAuditEvent.count({
        where: {
          requestId: {
            in: [
              `${prefix}-soft-delete-repeat`,
              `${prefix}-soft-delete-missing`,
            ],
          },
        },
      })
    ).toBe(0);
  });

  it("cannot block deletion by occupying the old public placeholder", async () => {
    const victim = await createAccount(
      { password: "victim-password", username: nextUsername() },
      "placeholder-victim"
    );
    const blocker = await createAccount(
      {
        password: "blocker-password",
        username: `deleted-${victim.id}`,
      },
      "placeholder-blocker"
    );
    await expect(
      service.deleteAccount(
        await defaultScope,
        victim.id,
        context("placeholder-delete")
      )
    ).resolves.toBeUndefined();
    const [storedVictim, storedBlocker] = await Promise.all([
      db.account.findUniqueOrThrow({ where: { id: victim.id } }),
      db.account.findUniqueOrThrow({ where: { id: blocker.id } }),
    ]);
    expect(storedVictim.username).toBe(`deleted:${victim.id}`);
    expect(storedBlocker).toMatchObject({
      id: blocker.id,
      username: `deleted-${victim.id}`,
    });
  });

  it("uses a stable password-sensitive idempotency fingerprint", async () => {
    const username = nextUsername();
    const password = "idempotency-secret-password";
    const key = `${prefix}-fingerprint-key`;
    const input = { idempotencyKey: key, password, username };
    const first = await createAccount(input, "fingerprint-create");
    const firstRecord = await db.accountCreateIdempotency.findUniqueOrThrow({
      where: { tenantId_key: { key, tenantId: "default" } },
    });
    const replay = await createAccount(input, "fingerprint-replay");
    const replayRecord = await db.accountCreateIdempotency.findUniqueOrThrow({
      where: { tenantId_key: { key, tenantId: "default" } },
    });
    expect(replay.id).toBe(first.id);
    expect(firstRecord.requestHash).toMatch(REQUEST_HASH_PATTERN);
    expect(firstRecord.requestHash).not.toContain(password);
    expect(replayRecord.requestHash).toBe(firstRecord.requestHash);
    await expect(
      service.createAccount(
        await defaultScope,
        { ...input, password: "different-idempotency-password" },
        context("fingerprint-conflict")
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("reuses an expired idempotency key for a new Account", async () => {
    const key = `${prefix}-expired-key`;
    const first = await createAccount(
      {
        idempotencyKey: key,
        password: "expired-first-password",
        username: nextUsername(),
      },
      "expired-first"
    );
    await db.accountCreateIdempotency.update({
      data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      where: { tenantId_key: { key, tenantId: "default" } },
    });
    const second = await createAccount(
      {
        idempotencyKey: key,
        password: "expired-second-password",
        username: nextUsername(),
      },
      "expired-second"
    );
    expect(second.id).not.toBe(first.id);
  });

  it("atomically disables an Account and removes all Sessions", async () => {
    const account = await createAccount(
      { password: "disable-password", username: nextUsername() },
      "disable-create"
    );
    await Promise.all([
      seedSession(account.id, "disable-1"),
      seedSession(account.id, "disable-2"),
    ]);
    await service.patchAccount(
      await defaultScope,
      account.id,
      { active: false },
      context("disable-account")
    );
    const stored = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(stored.status).toBe("disabled");
    expect(await db.session.count({ where: { accountId: account.id } })).toBe(
      0
    );
  });

  it("rolls back Session deletion when disabling hits an identifier conflict", async () => {
    const victim = await createAccount(
      { password: "atomic-victim-password", username: nextUsername() },
      "atomic-victim"
    );
    const blocker = await createAccount(
      { password: "atomic-blocker-password", username: nextUsername() },
      "atomic-blocker"
    );
    await seedSession(victim.id, "atomic");
    await expect(
      service.patchAccount(
        await defaultScope,
        victim.id,
        { active: false, username: blocker.username },
        context("atomic-conflict")
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTIFIER_CONFLICT" });
    const stored = await db.account.findUniqueOrThrow({
      where: { id: victim.id },
    });
    expect(stored.status).toBe("active");
    expect(await db.session.count({ where: { accountId: victim.id } })).toBe(1);
  });

  it("classifies concurrent same-key different-password requests as idempotency conflicts", async () => {
    for (let round = 0; round < 3; round += 1) {
      const username = nextUsername();
      const key = `${prefix}-concurrent-${round}`;
      const phone = `+861${Date.now()}8${round}`;
      idempotencyKeys.add(key);
      const results = await Promise.allSettled([
        service.createAccount(
          await defaultScope,
          {
            active: true,
            email: `${username}@example.com`,
            idempotencyKey: key,
            password: `concurrent-password-a-${round}`,
            phone,
            username,
          },
          context(`concurrent-a-${round}`)
        ),
        service.createAccount(
          await defaultScope,
          {
            active: true,
            email: `${username}@example.com`,
            idempotencyKey: key,
            password: `concurrent-password-b-${round}`,
            phone,
            username,
          },
          context(`concurrent-b-${round}`)
        ),
      ]);
      const fulfilled = results.filter(
        (
          result
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof service.createAccount>>
        > => result.status === "fulfilled"
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
      });
      const successfulAccount = fulfilled[0]?.value;
      expect(successfulAccount).toBeDefined();
      if (!successfulAccount) {
        throw new Error("concurrent Account creation did not produce a winner");
      }
      accountIds.add(successfulAccount.id);
      expect(await db.account.count({ where: { username } })).toBe(1);
      const record = await db.accountCreateIdempotency.findUniqueOrThrow({
        where: { tenantId_key: { key, tenantId: "default" } },
      });
      expect(record.accountId).toBe(successfulAccount.id);
    }
  });
});
