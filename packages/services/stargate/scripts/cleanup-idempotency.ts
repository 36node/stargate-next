import { db } from "@repo/db";

async function main() {
  const result = await db.accountCreateIdempotency.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  console.log(`deleted ${result.count} expired idempotency records`);
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
