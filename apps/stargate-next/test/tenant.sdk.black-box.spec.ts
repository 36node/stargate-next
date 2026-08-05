/** Multi-tenant SDK 控制面、数据面与 Tenant Key 黑盒回归。 */

import { StargateNextClient } from "@repo/stargate-next-sdk";
import { describe, expect, it } from "vitest";

const TENANT_API_KEY_PATTERN = /^stk_[A-Za-z0-9_-]{32}$/;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for SDK black-box tests`);
  }
  return value;
}

describe("Given the multi-tenant generated SDK", () => {
  it("manages a Tenant and a scoped key without leaking plaintext", async () => {
    const endpoint = env("STARGATE_ENDPOINT");
    const suffix = Date.now().toString(36);
    const tenantId = `sdk-${suffix}`;
    const overrideTenantId = `sdk-${suffix}-override`;
    const admin = new StargateNextClient(endpoint, {
      apiKey: env("STARGATE_ADMIN_API_KEY"),
      tenantId,
    });
    await expect(
      admin.createTenant({ id: tenantId, name: "SDK Tenant" })
    ).resolves.toMatchObject({ id: tenantId, status: "active" });
    await expect(
      admin.createTenant({ id: overrideTenantId, name: "SDK Override" })
    ).resolves.toMatchObject({ id: overrideTenantId, status: "active" });
    await expect(
      admin.listTenants(0, 100, "SDK Tenant")
    ).resolves.toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ id: tenantId })]),
    });
    await expect(admin.getTenant(tenantId)).resolves.toMatchObject({
      id: tenantId,
    });
    await expect(
      admin.patchTenant(tenantId, { name: "SDK Tenant Renamed" })
    ).resolves.toMatchObject({ id: tenantId, name: "SDK Tenant Renamed" });
    await expect(admin.createTenant({ id: tenantId })).rejects.toMatchObject({
      code: "TENANT_ALREADY_EXISTS",
      status: 409,
    });
    await expect(admin.getTenant(`missing-${suffix}`)).rejects.toMatchObject({
      code: "TENANT_NOT_FOUND",
      status: 404,
    });

    const created = await admin.createTenantApiKey({ name: "sdk-worker" });
    expect(created.key).toMatch(TENANT_API_KEY_PATTERN);

    const tenantClient = new StargateNextClient(endpoint, {
      apiKey: created.key,
      tenantId,
    });
    const account = await tenantClient.createAccount({
      password: "sdk-tenant-password",
      username: `sdktenant${suffix}`,
    });
    expect(account.tenantId).toBe(tenantId);
    const overriddenAccount = await admin.createAccount(
      {
        password: "sdk-override-password",
        username: `sdkoverride${suffix}`,
      },
      overrideTenantId
    );
    expect(overriddenAccount.tenantId).toBe(overrideTenantId);

    const legacyClient = new StargateNextClient(endpoint, {
      apiKey: env("STARGATE_API_KEY"),
    });
    const defaultAccount = await legacyClient.createAccount({
      password: "sdk-default-password",
      username: `sdkdefault${suffix}`,
    });
    expect(defaultAccount.tenantId).toBe("default");

    const listed = await tenantClient.listTenantApiKeys(0, 10);
    expect(JSON.stringify(listed)).not.toContain(created.key);
    await expect(
      tenantClient.patchTenantApiKey(created.id, "sdk-worker-renamed")
    ).resolves.toMatchObject({
      id: created.id,
      name: "sdk-worker-renamed",
      tenantId,
    });
    await expect(
      tenantClient.patchTenantApiKey(`missing-${suffix}`, "missing")
    ).rejects.toMatchObject({
      code: "TENANT_API_KEY_NOT_FOUND",
      status: 404,
    });
    await expect(
      tenantClient.deleteTenantApiKey(created.id)
    ).rejects.toMatchObject({
      code: "TENANT_API_KEY_SELF_DELETE",
      status: 400,
    });
    await expect(admin.deleteTenantApiKey(created.id)).resolves.toBeUndefined();
    await expect(admin.deleteTenantApiKey(created.id)).rejects.toMatchObject({
      code: "TENANT_API_KEY_NOT_FOUND",
      status: 404,
    });
  });
});
