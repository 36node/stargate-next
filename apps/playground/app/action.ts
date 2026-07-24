"use server";

import { signOut } from "../stargate";

export async function logoutAction() {
  await signOut();
}
