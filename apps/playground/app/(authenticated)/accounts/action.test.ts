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
  StargateApiError: class StargateApiError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@36node/stargate-next-sdk", () => ({
  StargateApiError: mocks.StargateApiError,
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

  it.each([
    ["ACCESS_TOKEN_INVALID", 401, "登录状态已失效，请重新登录。"],
    ["CURRENT_PASSWORD_INVALID", 401, "当前密码不正确。"],
    ["PASSWORD_CHANGE_LOCKED", 429, "当前密码错误次数过多，请稍后再试。"],
    ["PASSWORD_INVALID", 400, "新密码不符合要求。"],
  ])("shows the %s failure reason", async (code, status, message) => {
    mocks.selfChangePassword.mockRejectedValue(
      new mocks.StargateApiError(code, status, "upstream message")
    );

    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "new-password",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ error: message });
  });

  it("keeps unexpected failures user safe", async () => {
    mocks.selfChangePassword.mockRejectedValue(new Error("network details"));

    await expect(
      selfChangePasswordAction(
        form({
          confirmPassword: "new-password",
          currentPassword: "current",
          newPassword: "new-password",
        })
      )
    ).resolves.toEqual({ error: "修改密码失败，请稍后重试。" });
  });
});
