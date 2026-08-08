"use server";

import { randomUUID } from "node:crypto";

import { StargateNextClient } from "@repo/stargate-next-sdk";
import { revalidatePath } from "next/cache";

import { sessionCookieNames } from "@/auth-config";
import {
  getSessionTokenFromCookie,
  getTenantFromCookie,
} from "@/packages/next-stargate/cookie";
import { auth } from "@/packages/services/auth/client";
import { env } from "@/packages/services/env";

export type AccountActionState = {
  error?: string;
  success?: true;
};

function getRequiredString(
  formData: FormData,
  key: string
): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actionError(): AccountActionState {
  return { error: "操作失败，请稍后重试。" };
}

function nextClient() {
  return new StargateNextClient(env.STARGATE_ENDPOINT, {
    apiKey: env.STARGATE_API_KEY,
  });
}

export async function createAccountAction(
  formData: FormData
): Promise<AccountActionState> {
  const username = getRequiredString(formData, "username");
  const name = getRequiredString(formData, "name");
  const password = getRequiredString(formData, "password");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (
    !(
      username &&
      password &&
      confirmPassword &&
      (env.STARGATE_AUTH_BACKEND === "next" || name)
    )
  ) {
    return { error: "请填写登录用户名、账号名称和密码。" };
  }

  if (password !== confirmPassword) {
    return { error: "两次输入的密码不一致。" };
  }

  try {
    if (env.STARGATE_AUTH_BACKEND === "next") {
      await nextClient().createAccount({
        active: true,
        idempotencyKey: randomUUID(),
        password,
        username,
      });
    } else {
      await auth.createUser({
        body: { active: true, name, password, username },
      });
    }
    revalidatePath("/accounts");
    return { success: true };
  } catch {
    return actionError();
  }
}

export async function updateAccountNameAction(
  formData: FormData
): Promise<AccountActionState> {
  const userId = getRequiredString(formData, "userId");
  const name = getRequiredString(formData, "name");

  if (!(userId && name)) {
    return { error: "请输入账号名称。" };
  }

  try {
    if (env.STARGATE_AUTH_BACKEND === "next") {
      return { error: "Stargate Next 不支持编辑账号名称。" };
    }
    await auth.updateUser({ body: { name }, path: { userId } });
    revalidatePath("/accounts");
    return { success: true };
  } catch {
    return actionError();
  }
}

export async function updateAccountActiveAction(
  formData: FormData
): Promise<AccountActionState> {
  const userId = getRequiredString(formData, "userId");
  const active = formData.get("active");

  if (!userId || (active !== "true" && active !== "false")) {
    return actionError();
  }

  try {
    if (env.STARGATE_AUTH_BACKEND === "next") {
      await nextClient().patchAccount(userId, { active: active === "true" });
    } else {
      await auth.updateUser({
        body: { active: active === "true" },
        path: { userId },
      });
    }
    revalidatePath("/accounts");
    return { success: true };
  } catch {
    return actionError();
  }
}

export async function deleteAccountAction(
  formData: FormData
): Promise<AccountActionState> {
  const userId = getRequiredString(formData, "userId");

  if (!userId) {
    return actionError();
  }

  try {
    if (env.STARGATE_AUTH_BACKEND === "next") {
      await nextClient().deleteAccount(userId);
    } else {
      await auth.deleteUser({ path: { userId } });
    }
    revalidatePath("/accounts");
    return { success: true };
  } catch {
    return actionError();
  }
}

export async function resetAccountPasswordAction(
  formData: FormData
): Promise<AccountActionState> {
  const userId = getRequiredString(formData, "userId");
  const newPassword = getRequiredString(formData, "newPassword");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (!(userId && newPassword && confirmPassword)) {
    return { error: "请输入并确认新密码。" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "两次输入的新密码不一致。" };
  }

  try {
    if (env.STARGATE_AUTH_BACKEND === "next") {
      await nextClient().changePassword(userId, newPassword);
    } else {
      await auth.updatePassword({ body: { newPassword }, path: { userId } });
    }
    return { success: true };
  } catch {
    return actionError();
  }
}

export async function selfChangePasswordAction(
  formData: FormData
): Promise<AccountActionState> {
  const currentPassword = getRequiredString(formData, "currentPassword");
  const newPassword = getRequiredString(formData, "newPassword");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (!(currentPassword && newPassword && confirmPassword)) {
    return { error: "请填写当前密码和新密码。" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "两次输入的新密码不一致。" };
  }
  if (env.STARGATE_AUTH_BACKEND !== "next") {
    return { error: "当前认证后端不支持自助改密。" };
  }

  const token = await getSessionTokenFromCookie(sessionCookieNames.token);
  if (!token) {
    return { error: "登录状态已失效，请重新登录。" };
  }
  const tenantId = sessionCookieNames.tenant
    ? await getTenantFromCookie(sessionCookieNames.tenant)
    : undefined;

  try {
    await nextClient().selfChangePassword(
      token,
      currentPassword,
      newPassword,
      tenantId
    );
    return { success: true };
  } catch {
    return actionError();
  }
}
