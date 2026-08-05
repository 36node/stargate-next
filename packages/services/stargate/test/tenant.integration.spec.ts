/** Tenant 控制面、数据隔离与审计事务的真实 PostgreSQL 回归。 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import { db } from "@repo/db";
import { afterAll, describe, expect, it } from "vitest";

import type { StargateConfig } from "../src/config";
import type { RequestContext } from "../src/contracts";
import { createStargateService } from "../src/service";

const prefix = `tenantitest${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const tenantIds = new Set<string>();
const accountIds = new Set<string>();
const auditFailureTrigger = "ticket232_tenant_audit_failure";
const auditFailureFunction = "ticket232_fail_tenant_audit";

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
  primary: { id: `${prefix}-refresh`, secret: `${prefix}-refresh-secret` },
  redisKeyPrefix: `${prefix}:`,
  refreshTtlSeconds: 604_800,
  tenantApiKeyPrimary: {
    id: `${prefix}-tenant-key`,
    secret: `${prefix}-tenant-key-secret`,
  },
  testCaptcha: false,
  tokenTtlSeconds: 3600,
};

const service = createStargateService(config);
const adminScope = service.resolveAdminCredential(config.adminApiKey);

function context(operation: string): RequestContext {
  return { requestId: `${prefix}-${operation}` };
}

function passwordDigest(password: string): string {
  return createHmac("sha256", config.jwtSecret).update(password).digest("hex");
}

function legacyIdempotencyFingerprint(
  username: string,
  password: string
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        active: true,
        email: null,
        passwordDigest: passwordDigest(password),
        phone: null,
        username,
        version: 2,
      })
    )
    .digest("hex");
}

function currentIdempotencyFingerprint(
  tenantId: string,
  username: string,
  password: string
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        active: true,
        email: null,
        passwordDigest: passwordDigest(password),
        phone: null,
        tenantId,
        username,
        version: 3,
      })
    )
    .digest("hex");
}

async function installAuditFailureTrigger(): Promise<void> {
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION ${auditFailureFunction}() RETURNS trigger AS $$
       BEGIN
         IF NEW.request_id LIKE '${prefix}-rollback-%' THEN
           RAISE EXCEPTION 'ticket 232 injected audit failure';
         END IF;
         RETURN NEW;
       END;
     $$ LANGUAGE plpgsql`
  );
  await db.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${auditFailureTrigger} ON auth_audit_events`
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER ${auditFailureTrigger}
       BEFORE INSERT ON auth_audit_events
       FOR EACH ROW EXECUTE FUNCTION ${auditFailureFunction}()`
  );
}

async function removeAuditFailureTrigger(): Promise<void> {
  await db.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${auditFailureTrigger} ON auth_audit_events`
  );
  await db.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS ${auditFailureFunction}()`
  );
}

function createTenant(label: string) {
  const id = `${prefix}-${label}`;
  tenantIds.add(id);
  return service.createTenant(
    adminScope,
    { id, name: ` ${label} ` },
    context(`create-${label}`)
  );
}

afterAll(async () => {
  const tenants = [...tenantIds];
  const accounts = [...accountIds];
  await db.session.deleteMany({ where: { accountId: { in: accounts } } });
  await removeAuditFailureTrigger();
  await db.accountCreateIdempotency.deleteMany({
    where: { key: { startsWith: prefix } },
  });
  await db.tenantApiKey.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.authAuditEvent.deleteMany({
    where: {
      OR: [
        { requestId: { startsWith: prefix } },
        { tenantId: { in: tenants } },
      ],
    },
  });
  await db.account.deleteMany({ where: { id: { in: accounts } } });
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  await db.$disconnect();
});

describe("Tenant service integration", () => {
  it("creates, reads, filters, patches, and audits a Tenant", async () => {
    const created = await createTenant("lifecycle");
    expect(created).toMatchObject({
      id: `${prefix}-lifecycle`,
      name: "lifecycle",
      status: "active",
    });
    expect(created).not.toHaveProperty("active");
    await expect(
      service.createTenant(adminScope, { id: created.id }, context("duplicate"))
    ).rejects.toMatchObject({ code: "TENANT_ALREADY_EXISTS" });

    await expect(service.getTenant(adminScope, created.id)).resolves.toEqual(
      created
    );
    const listed = await service.listTenants(
      adminScope,
      10,
      0,
      "/v1/tenants",
      "lifecycle"
    );
    expect(listed.data.map(({ id }) => id)).toContain(created.id);
    expect(listed.links.self).toContain("filter[name]=lifecycle");

    await Promise.all([
      service.patchTenant(
        adminScope,
        created.id,
        { status: "disabled" },
        context("disable-a")
      ),
      service.patchTenant(
        adminScope,
        created.id,
        { status: "disabled" },
        context("disable-b")
      ),
    ]);
    expect(
      await db.authAuditEvent.count({
        where: { eventType: "tenant.disabled", tenantId: created.id },
      })
    ).toBe(1);
    await service.patchTenant(
      adminScope,
      created.id,
      { status: "disabled" },
      context("disable-repeat")
    );
    expect(
      await db.authAuditEvent.count({
        where: { eventType: "tenant.disabled", tenantId: created.id },
      })
    ).toBe(1);
    const restored = await service.patchTenant(
      adminScope,
      created.id,
      { name: " renamed ", status: "active" },
      context("restore")
    );
    expect(restored).toMatchObject({ name: "renamed", status: "active" });
    expect(
      await db.authAuditEvent.count({
        where: { eventType: "tenant.enabled", tenantId: created.id },
      })
    ).toBe(1);
  });

  it("uses stable errors for invalid ids, the default reservation, and missing paths", async () => {
    for (const id of [
      "default",
      "UPPER",
      " leading",
      "trailing ",
      "a".repeat(64),
    ]) {
      await expect(
        service.createTenant(
          adminScope,
          { id },
          context(`invalid-${id.length}`)
        )
      ).rejects.toMatchObject({ code: "TENANT_ID_INVALID" });
    }
    await expect(
      service.getTenant(adminScope, "NOT-VALID")
    ).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    await expect(
      service.patchTenant(
        adminScope,
        "default",
        { name: "renamed" },
        context("rename-default")
      )
    ).rejects.toMatchObject({ code: "PATCH_INVALID" });
  });

  it("isolates identifiers, ids, lists, and idempotency by Tenant", async () => {
    const firstTenant = await createTenant("isolation-a");
    const secondTenant = await createTenant("isolation-b");
    const [firstScope, secondScope] = await Promise.all([
      service.resolveApiCredential(config.adminApiKey, firstTenant.id),
      service.resolveApiCredential(config.adminApiKey, secondTenant.id),
    ]);
    const username = `${prefix}shared`;
    const idempotencyKey = `${prefix}-same-key`;
    const first = await service.createAccount(
      firstScope,
      { idempotencyKey, password: "first-password", username },
      context("account-first")
    );
    const second = await service.createAccount(
      secondScope,
      { idempotencyKey, password: "second-password", username },
      context("account-second")
    );
    accountIds.add(first.id);
    accountIds.add(second.id);
    expect(first.tenantId).toBe(firstTenant.id);
    expect(second.tenantId).toBe(secondTenant.id);
    expect(first.id).not.toBe(second.id);

    await expect(
      service.getAccount(firstScope, second.id)
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.batchGet(firstScope, [first.id, second.id])
    ).resolves.toEqual([first]);
    const firstList = await service.listAccounts(
      firstScope,
      100,
      0,
      "/v1/accounts"
    );
    expect(firstList.data.map(({ id }) => id)).toContain(first.id);
    expect(firstList.data.map(({ id }) => id)).not.toContain(second.id);
    await expect(
      service.patchAccount(
        firstScope,
        second.id,
        { active: false },
        context("cross-patch")
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.changePassword(
        firstScope,
        second.id,
        "cross-password",
        context("cross-password")
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.deleteAccount(firstScope, second.id, context("cross-delete"))
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.listSessions(firstScope, second.id)
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(
      service.revokeSessions(
        firstScope,
        second.id,
        context("cross-revoke"),
        "admin_bulk_revoke"
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(
      await db.accountCreateIdempotency.count({
        where: { key: idempotencyKey },
      })
    ).toBe(2);
  });

  it("upgrades only default-Tenant legacy idempotency fingerprints", async () => {
    const defaultScope = await service.resolveApiCredential(
      config.apiKey,
      undefined
    );
    const username = `${prefix}legacy`;
    const password = "legacy-idempotency-password";
    const account = await service.createAccount(
      defaultScope,
      { password, username },
      context("legacy-account")
    );
    accountIds.add(account.id);
    const replayKey = `${prefix}-legacy-replay`;
    await db.accountCreateIdempotency.create({
      data: {
        accountId: account.id,
        expiresAt: new Date(Date.now() + 60_000),
        key: replayKey,
        requestHash: legacyIdempotencyFingerprint(username, password),
        tenantId: "default",
      },
    });

    await expect(
      service.createAccount(
        defaultScope,
        { idempotencyKey: replayKey, password, username },
        context("legacy-replay")
      )
    ).resolves.toEqual(account);
    await expect(
      db.accountCreateIdempotency.findUniqueOrThrow({
        where: { tenantId_key: { key: replayKey, tenantId: "default" } },
      })
    ).resolves.toMatchObject({
      requestHash: currentIdempotencyFingerprint("default", username, password),
    });
    await expect(
      service.createAccount(
        defaultScope,
        {
          idempotencyKey: replayKey,
          password: "different-password",
          username,
        },
        context("legacy-conflict")
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const inProgressKey = `${prefix}-legacy-progress`;
    const inProgressUsername = `${prefix}progress`;
    await db.accountCreateIdempotency.create({
      data: {
        expiresAt: new Date(Date.now() + 60_000),
        key: inProgressKey,
        requestHash: legacyIdempotencyFingerprint(inProgressUsername, password),
        tenantId: "default",
      },
    });
    await expect(
      service.createAccount(
        defaultScope,
        {
          idempotencyKey: inProgressKey,
          password,
          username: inProgressUsername,
        },
        context("legacy-progress")
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });

    const tenant = await createTenant("legacy-non-default");
    const tenantScope = await service.resolveApiCredential(
      config.adminApiKey,
      tenant.id
    );
    const tenantAccount = await service.createAccount(
      tenantScope,
      { password, username },
      context("legacy-tenant-account")
    );
    accountIds.add(tenantAccount.id);
    const tenantKey = `${prefix}-legacy-tenant`;
    await db.accountCreateIdempotency.create({
      data: {
        accountId: tenantAccount.id,
        expiresAt: new Date(Date.now() + 60_000),
        key: tenantKey,
        requestHash: legacyIdempotencyFingerprint(username, password),
        tenantId: tenant.id,
      },
    });
    await expect(
      service.createAccount(
        tenantScope,
        { idempotencyKey: tenantKey, password, username },
        context("legacy-tenant-replay")
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps Refresh Keys in their issuing Tenant", async () => {
    const issuingTenant = await createTenant("refresh-a");
    const otherTenant = await createTenant("refresh-b");
    const issuingScope = await service.resolveApiCredential(
      config.adminApiKey,
      issuingTenant.id
    );
    const account = await service.createAccount(
      issuingScope,
      { password: "refresh-password", username: `${prefix}refresh` },
      context("refresh-account")
    );
    accountIds.add(account.id);
    const refreshKey = `${prefix}-refresh-key`;
    const session = await db.session.create({
      data: {
        accountId: account.id,
        expiresAt: new Date(Date.now() + 60_000),
        refreshKeyHash: createHmac("sha256", config.primary.secret)
          .update(refreshKey)
          .digest("hex"),
        refreshKeyHmacKeyId: config.primary.id,
        tenantId: issuingTenant.id,
      },
    });

    await expect(
      service.refresh(otherTenant.id, refreshKey, context("refresh-cross"))
    ).rejects.toMatchObject({ code: "REFRESH_INVALID" });
    await expect(
      db.session.findUnique({ where: { id: session.id } })
    ).resolves.not.toBeNull();
    await expect(
      service.refresh(issuingTenant.id, refreshKey, context("refresh-owner"))
    ).resolves.toMatchObject({
      accountId: account.id,
      sessionId: session.id,
      tenantId: issuingTenant.id,
    });
  });

  it("rolls back Tenant and API Key mutations when audit insertion fails", async () => {
    const stableTenant = await createTenant("rollback-stable");
    const stableScope = await service.resolveApiCredential(
      config.adminApiKey,
      stableTenant.id
    );
    const stableKey = await service.createTenantApiKey(
      stableScope,
      { name: "stable" },
      context("stable-key")
    );
    await installAuditFailureTrigger();

    const failedTenantId = `${prefix}-rollback-created`;
    tenantIds.add(failedTenantId);
    await expect(
      service.createTenant(
        adminScope,
        { id: failedTenantId },
        context("rollback-create")
      )
    ).rejects.toThrow();
    await expect(
      db.tenant.findUnique({ where: { id: failedTenantId } })
    ).resolves.toBeNull();

    const keyCount = await db.tenantApiKey.count({
      where: { tenantId: stableTenant.id },
    });
    await expect(
      service.createTenantApiKey(
        stableScope,
        { name: "rolled-back" },
        context("rollback-key-create")
      )
    ).rejects.toThrow();
    await expect(
      db.tenantApiKey.count({ where: { tenantId: stableTenant.id } })
    ).resolves.toBe(keyCount);

    await expect(
      service.deleteTenantApiKey(
        stableScope,
        stableKey.id,
        context("rollback-key-delete")
      )
    ).rejects.toThrow();
    await expect(
      service.resolveApiCredential(stableKey.key, undefined)
    ).resolves.toMatchObject({ actorId: stableKey.id });

    await expect(
      service.patchTenant(
        adminScope,
        stableTenant.id,
        { status: "disabled" },
        context("rollback-tenant-status")
      )
    ).rejects.toThrow();
    await expect(
      service.getTenant(adminScope, stableTenant.id)
    ).resolves.toMatchObject({ status: "active" });

    await removeAuditFailureTrigger();
    await expect(
      service.createTenant(
        adminScope,
        { id: failedTenantId },
        context("rollback-retry")
      )
    ).resolves.toMatchObject({ id: failedTenantId });
  });
});
