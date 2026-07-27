"use server";

import { auth } from "@repo/services/auth/client";
import { revalidatePath } from "next/cache";

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

export async function createAccountAction(
  formData: FormData
): Promise<AccountActionState> {
  const username = getRequiredString(formData, "username");
  const name = getRequiredString(formData, "name");
  const password = getRequiredString(formData, "password");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (!(username && name && password && confirmPassword)) {
    return { error: "请填写登录用户名、账号名称和密码。" };
  }

  if (password !== confirmPassword) {
    return { error: "两次输入的密码不一致。" };
  }

  try {
    await auth.createUser({
      body: { active: true, name, password, username },
    });
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
    await auth.updateUser({
      body: { active: active === "true" },
      path: { userId },
    });
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
    await auth.deleteUser({ path: { userId } });
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
    await auth.updatePassword({ body: { newPassword }, path: { userId } });
    return { success: true };
  } catch {
    return actionError();
  }
}
