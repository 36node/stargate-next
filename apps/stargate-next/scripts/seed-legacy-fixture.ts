import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "@repo/db";

type LegacyFixture = {
  id: string;
  passwordAlgorithm: string;
  passwordHash: string;
  username: string;
};

async function main() {
  const fixtures = JSON.parse(
    await readFile(
      resolve(process.cwd(), "test/fixtures/legacy-md5.json"),
      "utf8"
    )
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
          username: fixture.username,
        },
        update: {
          deletedAt: null,
          passwordAlgorithm: fixture.passwordAlgorithm,
          passwordChangedAt: now,
          passwordHash: fixture.passwordHash,
          status: "active",
        },
        where: { username: fixture.username },
      })
    )
  );
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
