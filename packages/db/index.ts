/**
 * Shared Prisma database client for server-side applications.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:123456@localhost:5432/stargate-next-local?schema=public";

const createClient = () => {
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c timezone=UTC",
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

export const db = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export const DB_HEALTH_TIMEOUT_MS = 1500;

export type DbHealthCheck =
  | { ok: true; latencyMs: number }
  | { error: string; latencyMs: number; ok: false };

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function withDbHealthTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DB_HEALTH_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`db health check timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function checkDbHealth(): Promise<DbHealthCheck> {
  const startedAt = Date.now();

  try {
    await withDbHealthTimeout(db.$queryRaw`SELECT 1`);
    return { latencyMs: Date.now() - startedAt, ok: true };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      latencyMs: Date.now() - startedAt,
      ok: false,
    };
  }
}

export * from "@prisma/client";
