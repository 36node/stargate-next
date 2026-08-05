"use server";

import { StargateApiError } from "@repo/stargate-next-sdk";

import { resolveTenantId } from "@/auth-config";
import { signIn } from "../../../stargate";

export type LoginState = { error?: string };

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof StargateApiError)) {
    return "登录失败，请检查账号、密码和 Stargate 配置。";
  }

  switch (error.code) {
    case "CAPTCHA_INVALID":
      return "验证码错误或已过期，请刷新后重试。";
    case "LOGIN_LOCKED":
      return "登录尝试过多，请稍后再试。";
    case "LOGIN_INVALID":
      return "账号或密码错误。";
    default:
      return "登录失败，请稍后重试。";
  }
}

export async function loginAction(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const login = formData.get("login");
  const password = formData.get("password");
  const captchaId = formData.get("captchaId");
  const captchaCode = formData.get("captchaCode");
  const from = formData.get("from");
  const tenantId = resolveTenantId(formData.get("tenantId"));

  if (typeof login !== "string" || typeof password !== "string") {
    return { error: "请输入账号和密码。" };
  }

  try {
    await signIn(
      {
        captchaCode: typeof captchaCode === "string" ? captchaCode : undefined,
        captchaId: typeof captchaId === "string" ? captchaId : undefined,
        login,
        password,
        tenantId,
      },
      { from: typeof from === "string" && from.startsWith("/") ? from : "/" }
    );
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    return { error: loginErrorMessage(error) };
  }

  return { error: "登录未完成，请重试。" };
}
