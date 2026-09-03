/**
 * 把旧版 MD5 账号 fixture 幂等写入内置 default Tenant。
 */

import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "@repo/db";

import { seedDefaultTenant } from "./seed-default-tenant.js";

type LegacyFixture = {
  id: string;
  passwordAlgorithm: string;
  passwordHash: string;
  username: string;
};

async function main() {
  await seedDefaultTenant();
  const fixturePath = resolve(
    process.env.STARGATE_LEGACY_FIXTURE ??
      "../../../apps/stargate-next/test/fixtures/legacy-md5.json"
  );
  const fixtures = JSON.parse(
    await readFile(fixturePath, "utf8")
  ) as LegacyFixture[];
  const now = new Date();
  await db.$transaction(
    fixtures.map((fixture) =>
      db.account.upsert({
        create: {
          id: fixture.id,
          passwordAlgorithm: fixture.passwordAlgorithm,
          passwordChangedAt: now,
          passwordHash: fixture.passwordHash,
          status: "active",
          tenantId: "default",
          username: fixture.username,
        },
        update: {
          deletedAt: null,
          passwordAlgorithm: fixture.passwordAlgorithm,
          passwordChangedAt: now,
          passwordHash: fixture.passwordHash,
          status: "active",
        },
        where: {
          tenantId_username: {
            tenantId: "default",
            username: fixture.username,
          },
        },
      })
    )
  );
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
