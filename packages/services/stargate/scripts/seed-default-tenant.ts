/**
 * 幂等创建内置 default Tenant，不覆盖其后续人工状态变更。
 */

import "dotenv/config";

import { fileURLToPath } from "node:url";

import { db } from "@repo/db";

export async function seedDefaultTenant(): Promise<{ created: boolean }> {
  const existing = await db.tenant.findUnique({ where: { id: "default" } });
  if (existing) {
    return { created: false };
  }

  try {
    await db.tenant.create({
      data: { id: "default", name: "default", status: "active" },
    });
    return { created: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { created: false };
    }
    throw error;
  }
}

async function main(): Promise<void> {
  await seedDefaultTenant();
  await db.$disconnect();
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
