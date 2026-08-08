/** Playground 自助改密 Action 的 Cookie 取值与 SDK 调用回归。 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: {
    STARGATE_API_KEY: "api-key",
    STARGATE_AUTH_BACKEND: "next",
    STARGATE_ENDPOINT: "http://stargate.test",
  },
  getSessionTokenFromCookie: vi.fn(),
  getTenantFromCookie: vi.fn(),
  selfChangePassword: vi.fn(),
}));

vi.mock("@repo/stargate-next-sdk", () => ({
  StargateNextClient: vi.fn(function StargateNextClient() {
    return { selfChangePassword: mocks.selfChangePassword };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/auth-config", () => ({
  sessionCookieNames: {
    refresh: "refresh-cookie",
    tenant: "tenant-cookie",
    token: "token-cookie",
  },
}));

vi.mock("@/packages/next-stargate/cookie", () => ({
  getSessionTokenFromCookie: mocks.getSessionTokenFromCookie,
  getTenantFromCookie: mocks.getTenantFromCookie,
}));

vi.mock("@/packages/services/auth/client", () => ({ auth: {} }));
vi.mock("@/packages/services/env", () => ({ env: mocks.environment }));

import { selfChangePasswordAction } from "./action";

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  mocks.environment.STARGATE_AUTH_BACKEND = "next";
  mocks.getSessionTokenFromCookie.mockReset().mockResolvedValue("token-1");
  mocks.getTenantFromCookie.mockReset().mockResolvedValue("tenant-1");
  mocks.selfChangePassword.mockReset().mockResolvedValue(undefined);
});

describe("selfChangePasswordAction", () => {
  it("rejects missing fields", async () => {
    await expect(
      selfChangePasswordAction(form({ currentPassword: "current" }))
    ).resolves.toEqual({ error: "请填写当前密码和新密码。" });
  });

  it("rejects a mismatched confirmation", async () => {
    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "different",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ error: "两次输入的新密码不一致。" });
  });

  it("rejects the legacy authentication backend", async () => {
    mocks.environment.STARGATE_AUTH_BACKEND = "legacy";
    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "new-password",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ error: "当前认证后端不支持自助改密。" });
  });

  it("rejects a missing session token", async () => {
    mocks.getSessionTokenFromCookie.mockResolvedValue(undefined);
    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "new-password",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ error: "登录状态已失效，请重新登录。" });
  });

  it("calls the Bearer SDK method with token and Tenant from cookies", async () => {
    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "new-password",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ success: true });
    expect(mocks.getSessionTokenFromCookie).toHaveBeenCalledWith(
      "token-cookie"
    );
    expect(mocks.getTenantFromCookie).toHaveBeenCalledWith("tenant-cookie");
    expect(mocks.selfChangePassword).toHaveBeenCalledWith(
      "token-1",
      "current",
      "new-password",
      "tenant-1"
    );
  });
});
