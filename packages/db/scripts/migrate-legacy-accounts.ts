import "dotenv/config";

import type { Account } from "@prisma/client";
import { MongoClient } from "mongodb";

import {
  type AccountIdStrategy,
  accountId,
  assertAccountMigrationComplete,
  type LegacyUser,
  type MigratedAccount,
  type SkippedLegacyAccount,
  transformLegacyUsers,
} from "./legacy-account-migration";

const QueryBatchSize = 5000;
const WriteBatchSize = 100;
type MigrationMode = "apply" | "preflight" | "verify";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function migrationMode(): MigrationMode {
  const mode = process.env.MIGRATION_MODE ?? "preflight";
  if (mode !== "apply" && mode !== "preflight" && mode !== "verify") {
    throw new Error("MIGRATION_MODE must be preflight, apply, or verify");
  }
  return mode;
}

function verifyMigration(mode: MigrationMode, pending: number): void {
  if (mode === "verify") {
    assertAccountMigrationComplete(pending);
  }
}

function idStrategy(): AccountIdStrategy {
  const strategy = process.env.ACCOUNT_ID_STRATEGY;
  if (strategy !== "derived" && strategy !== "legacy") {
    throw new Error("ACCOUNT_ID_STRATEGY must be derived or legacy");
  }
  return strategy;
}

function batches<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function assertSkippedAccountsAbsent(
  db: typeof import("../index").db,
  skippedUsers: SkippedLegacyAccount[],
  tenantId: string,
  strategy: AccountIdStrategy
): Promise<void> {
  const skippedTargetIds = skippedUsers.flatMap(({ legacyUserId }) =>
    legacyUserId ? [accountId(legacyUserId, tenantId, strategy)] : []
  );
  for (const batch of batches(skippedTargetIds, QueryBatchSize)) {
    const existingSkippedAccounts = await db.account.findMany({
      select: { id: true },
      where: { id: { in: batch } },
    });
    if (existingSkippedAccounts.length > 0) {
      throw new Error("target contains account skipped by migration policy");
    }
  }
}

function sameAccount(
  existing: {
    deletedAt: Date | null;
    email: string | null;
    id: string;
    passwordAlgorithm: string;
    passwordChangedAt: Date;
    passwordHash: string;
    phone: string | null;
    status: string;
    tenantId: string;
    username: string;
  },
  expected: MigratedAccount
): boolean {
  return (
    existing.deletedAt === null &&
    existing.email === expected.email &&
    existing.id === expected.id &&
    existing.passwordAlgorithm === expected.passwordAlgorithm &&
    existing.passwordChangedAt.getTime() ===
      expected.passwordChangedAt.getTime() &&
    existing.passwordHash === expected.passwordHash &&
    existing.phone === expected.phone &&
    existing.status === expected.status &&
    existing.tenantId === expected.tenantId &&
    existing.username === expected.username
  );
}

async function main(): Promise<void> {
  const legacyDatabaseUrl = required("LEGACY_DATABASE_URL");
  process.env.DATABASE_URL = required("NEXT_STARGATE_DATABASE_URL");
  const tenantId = required("STARGATE_TENANT_ID");
  const mode = migrationMode();
  const strategy = idStrategy();
  const mongo = new MongoClient(legacyDatabaseUrl);
  const { db } = await import("../index");

  try {
    await mongo.connect();
    const source = await mongo
      .db()
      .collection<LegacyUser>("users")
      .find({})
      .toArray();
    const { accounts, skippedUsers } = transformLegacyUsers(
      source,
      tenantId,
      strategy
    );

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status !== "active") {
      throw new Error(`target tenant ${tenantId} is not active`);
    }

    await assertSkippedAccountsAbsent(db, skippedUsers, tenantId, strategy);

    const expectedById = new Map(
      accounts.map((account) => [account.id, account])
    );
    const existingById = new Map<string, Account>();
    const identifiersById = new Map<string, Account>();
    for (const batch of batches(accounts, QueryBatchSize)) {
      const [existingAccounts, identifierAccounts] = await Promise.all([
        db.account.findMany({
          where: { id: { in: batch.map(({ id }) => id) } },
        }),
        db.account.findMany({
          where: {
            OR: [
              { username: { in: batch.map(({ username }) => username) } },
              {
                email: {
                  in: batch.flatMap(({ email }) => (email ? [email] : [])),
                },
              },
              {
                phone: {
                  in: batch.flatMap(({ phone }) => (phone ? [phone] : [])),
                },
              },
            ],
            tenantId,
          },
        }),
      ]);
      for (const account of existingAccounts) {
        existingById.set(account.id, account);
      }
      for (const account of identifierAccounts) {
        identifiersById.set(account.id, account);
      }
    }
    for (const existing of identifiersById.values()) {
      const expected = expectedById.get(existing.id);
      if (!(expected && sameAccount(existing, expected))) {
        throw new Error(
          "target account identifier conflicts with migration data"
        );
      }
    }

    const missing = accounts.filter((account) => {
      const existing = existingById.get(account.id);
      if (!existing) {
        return true;
      }
      if (!sameAccount(existing, account)) {
        throw new Error(`target account ${account.id} differs from source`);
      }
      return false;
    });

    verifyMigration(mode, missing.length);

    if (mode === "apply") {
      for (let offset = 0; offset < missing.length; offset += WriteBatchSize) {
        await db.account.createMany({
          data: missing.slice(offset, offset + WriteBatchSize),
        });
      }
    }

    console.log(
      JSON.stringify({
        eligible: accounts.length,
        existing: accounts.length - missing.length,
        mode,
        skipped: skippedUsers.length,
        skippedLegacyUserIds: skippedUsers.flatMap(({ legacyUserId }) =>
          legacyUserId ? [legacyUserId] : []
        ),
        skippedUsers: skippedUsers.map((user) => ({
          ...user,
          scope: "account",
        })),
        source: source.length,
        toCreate: missing.length,
      })
    );
  } finally {
    await mongo.close();
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
