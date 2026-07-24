"use server";

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

export async function loginAction(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const login = formData.get("login");
  const password = formData.get("password");
  const from = formData.get("from");

  if (typeof login !== "string" || typeof password !== "string") {
    return { error: "请输入账号和密码。" };
  }

  try {
    await signIn(
      { login, password },
      { from: typeof from === "string" && from.startsWith("/") ? from : "/" }
    );
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    return { error: "登录失败，请检查账号、密码和 Stargate 配置。" };
  }

  return { error: "登录未完成，请重试。" };
}
