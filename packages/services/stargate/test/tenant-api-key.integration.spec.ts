/** Tenant API Key 签发、解析、越权与敏感字段隔离的真实 PostgreSQL 回归。 */
import { createHmac, randomBytes } from "node:crypto";

import { db } from "@repo/db";
import { afterAll, describe, expect, it } from "vitest";

import type { StargateConfig } from "../src/config";
import type { RequestContext } from "../src/contracts";
import { createStargateService } from "../src/service";

const prefix = `keyitest${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const tenantIds = [`${prefix}-a`, `${prefix}-b`];
const TENANT_API_KEY_PATTERN = /^stk_[A-Za-z0-9_-]{32}$/;

const config: StargateConfig = {
  accountCreateIdempotencyTtlSeconds: 3600,
  adminApiKey: `${prefix}-admin-key`,
  apiKey: `${prefix}-service-key`,
  captchaAttempts: 5,
  captchaCreateLimit: 30,
  captchaCreateWindowSeconds: 60,
  captchaHmacSecret: `${prefix}-captcha-secret`,
  captchaTtlSeconds: 300,
  clockToleranceSeconds: 30,
  jwtSecret: `${prefix}-jwt-secret`,
  loginAttempts: 5,
  loginLockSeconds: 60,
  passwordChangeAttempts: 5,
  passwordChangeLockSeconds: 60,
  primary: { id: `${prefix}-refresh`, secret: `${prefix}-refresh-secret` },
  redisKeyPrefix: `${prefix}:`,
  refreshTtlSeconds: 604_800,
  tenantApiKeyPrimary: {
    id: `${prefix}-tenant-primary`,
    secret: `${prefix}-tenant-primary-secret`,
  },
  tenantApiKeySecondary: {
    id: `${prefix}-tenant-secondary`,
    secret: `${prefix}-tenant-secondary-secret`,
  },
  testCaptcha: false,
  tokenTtlSeconds: 3600,
};

const service = createStargateService(config);
const adminScope = service.resolveAdminCredential(config.adminApiKey);

function context(operation: string): RequestContext {
  return { requestId: `${prefix}-${operation}` };
}

afterAll(async () => {
  await db.tenantApiKey.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await db.authAuditEvent.deleteMany({
    where: {
      OR: [
        { requestId: { startsWith: prefix } },
        { tenantId: { in: tenantIds } },
      ],
    },
  });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await db.$disconnect();
});

describe("Tenant API Key service integration", () => {
  it("resolves credential classes without widening Tenant authority", async () => {
    for (const id of tenantIds) {
      await service.createTenant(
        adminScope,
        { id, name: id },
        context(`create-${id}`)
      );
    }
    const adminTenantScope = await service.resolveApiCredential(
      config.adminApiKey,
      tenantIds[0]
    );
    expect(adminTenantScope).toMatchObject({
      actorType: "admin",
      tenantId: tenantIds[0],
    });
    await expect(
      service.resolveApiCredential(config.apiKey, tenantIds[0])
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    await expect(
      service.resolveApiCredential("wrong-key", tenantIds[0])
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    for (const invalidHeader of [
      "",
      " ",
      "\t",
      ` ${tenantIds[0]}`,
      `${tenantIds[0]} `,
      "TEST",
      "a".repeat(64),
      "-bad",
      "bad-",
    ]) {
      await expect(
        service.resolveApiCredential(config.adminApiKey, invalidHeader)
      ).rejects.toMatchObject({ code: "TENANT_INVALID" });
    }
  });

  it("returns plaintext once, stores only HMAC, and keeps list output safe", async () => {
    const scope = await service.resolveApiCredential(
      config.adminApiKey,
      tenantIds[0]
    );
    const created = await service.createTenantApiKey(
      scope,
      { name: " worker " },
      context("key-create")
    );
    expect(created.key).toMatch(TENANT_API_KEY_PATTERN);
    expect(created.firstFour).toBe(created.key.slice(4, 8));
    expect(created).toMatchObject({ name: "worker", tenantId: tenantIds[0] });
    const stored = await db.tenantApiKey.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.hash).toBe(
      createHmac("sha256", config.tenantApiKeyPrimary.secret)
        .update(created.key)
        .digest("hex")
    );
    expect(JSON.stringify(stored)).not.toContain(created.key);

    const listed = await service.listTenantApiKeys(scope, 100, 0);
    expect(listed.meta).toEqual({ limit: 100, offset: 0, total: 1 });
    expect(listed).not.toHaveProperty("links");
    expect(listed.data[0]).toMatchObject({ id: created.id, name: "worker" });
    expect(listed.data[0]).not.toHaveProperty("attributes");
    expect(listed.data[0]).not.toHaveProperty("type");
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(created.key);
    expect(serialized).not.toContain(stored.hash);
    expect(serialized).not.toContain(stored.hmacKeyId);

    const keyScope = await service.resolveApiCredential(created.key, undefined);
    expect(keyScope).toMatchObject({
      actorId: created.id,
      actorType: "tenant_key",
      tenantId: tenantIds[0],
    });
    await expect(
      service.resolveApiCredential(created.key, tenantIds[1])
    ).rejects.toMatchObject({ code: "API_KEY_INVALID" });
    await expect(
      service.deleteTenantApiKey(keyScope, created.id, context("self-delete"))
    ).rejects.toMatchObject({ code: "TENANT_API_KEY_SELF_DELETE" });

    const patched = await service.patchTenantApiKey(keyScope, created.id, {
      name: " renamed ",
    });
    expect(patched.name).toBe("renamed");
    const otherScope = await service.resolveApiCredential(
      config.adminApiKey,
      tenantIds[1]
    );
    await expect(
      service.patchTenantApiKey(otherScope, created.id, { name: null })
    ).rejects.toMatchObject({ code: "TENANT_API_KEY_NOT_FOUND" });

    await service.deleteTenantApiKey(
      scope,
      created.id,
      context("admin-delete")
    );
    expect(
      await db.authAuditEvent.count({
        where: {
          eventType: "tenant_api_key.deleted",
          tenantId: tenantIds[0],
        },
      })
    ).toBe(1);
  });

  it("accepts secondary HMAC records and rejects disabled Tenants", async () => {
    const plaintext = `stk_${randomBytes(24).toString("base64url")}`;
    const secondary = config.tenantApiKeySecondary;
    if (!secondary) {
      throw new Error("secondary Tenant API Key config is required by test");
    }
    const stored = await db.tenantApiKey.create({
      data: {
        firstFour: plaintext.slice(4, 8),
        hash: createHmac("sha256", secondary.secret)
          .update(plaintext)
          .digest("hex"),
        hmacKeyId: secondary.id,
        name: "secondary",
        tenantId: tenantIds[0],
      },
    });
    await expect(
      service.resolveApiCredential(plaintext, undefined)
    ).resolves.toMatchObject({ actorId: stored.id, tenantId: tenantIds[0] });

    await service.patchTenant(
      adminScope,
      tenantIds[0],
      { status: "disabled" },
      context("disable")
    );
    await expect(
      service.resolveApiCredential(plaintext, undefined)
    ).rejects.toMatchObject({ code: "TENANT_DISABLED" });
    await service.patchTenant(
      adminScope,
      tenantIds[0],
      { status: "active" },
      context("enable")
    );
  });
});
