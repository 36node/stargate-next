/**
 * 在隔离数据库中验证多租户迁移的存量回填、幂等重跑与事务回滚。
 */

import "dotenv/config";

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { inspect, isDeepStrictEqual } from "node:util";

import { type DatabaseError, Pool } from "pg";

const DB_ROOT = resolve(__dirname, "..");
const PROBE_ROOT = join(DB_ROOT, ".probe");
const CURRENT_SCHEMA = join(DB_ROOT, "prisma", "schema.prisma");
const CURRENT_MIGRATION = join(
  DB_ROOT,
  "prisma",
  "migrations",
  "20260804000000_multi_tenant"
);
const LEGACY_SCHEMA = join(
  DB_ROOT,
  "scripts",
  "fixtures",
  "pre-multi-tenant",
  "schema.prisma"
);
const LEGACY_MIGRATIONS = [
  "20260727000000_auth_core",
  "20260727000001_account_status_constraint",
  "20260727000002_account_idempotency",
] as const;
const PROBE_DATABASE_PATTERN = /^probe_[a-z0-9_]+$/;

type Probe = {
  databaseName: string;
  databaseUrl: string;
  directory: string;
};

type LegacySnapshot = {
  accounts: unknown[];
  sessions: unknown[];
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureEqual(
  actual: unknown,
  expected: unknown,
  message = "values are not equal"
): void {
  ensure(
    Object.is(actual, expected),
    `${message}: expected ${inspect(expected)}, received ${inspect(actual)}`
  );
}

function ensureDeepEqual(
  actual: unknown,
  expected: unknown,
  message = "values are not deeply equal"
): void {
  ensure(
    isDeepStrictEqual(actual, expected),
    `${message}: expected ${inspect(expected)}, received ${inspect(actual)}`
  );
}

function requiredDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for verify:backfill");
  }
  return value;
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value: string): string {
  if (!PROBE_DATABASE_PATTERN.test(value)) {
    throw new Error("unsafe probe database identifier");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function assertProbeDirectory(directory: string): void {
  const resolved = resolve(directory);
  const root = `${resolve(PROBE_ROOT)}${sep}`;
  if (
    !resolved.startsWith(root) ||
    relative(PROBE_ROOT, resolved).includes("..")
  ) {
    throw new Error(
      "refusing to access a directory outside packages/db/.probe"
    );
  }
}

function createProbe(baseUrl: string, label: string): Probe {
  const id = `${label}_${randomBytes(8).toString("hex")}`;
  const databaseName = `probe_${id}`;
  const directory = join(PROBE_ROOT, id);
  assertProbeDirectory(directory);
  mkdirSync(directory, { recursive: true });
  return {
    databaseName,
    databaseUrl: databaseUrlFor(baseUrl, databaseName),
    directory,
  };
}

function writeProbeConfig(probe: Probe): void {
  const source = `/** 由 verify-backfill-migration.ts 生成的隔离 Prisma 配置。 */
import { join } from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: join(__dirname, "prisma", "schema.prisma"),
  migrations: { path: join(__dirname, "prisma", "migrations") },
  datasource: { url: process.env.DATABASE_URL! },
});
`;
  writeFileSync(join(probe.directory, "prisma.config.ts"), source, "utf8");
}

function prepareLegacyProject(probe: Probe): void {
  const prismaDirectory = join(probe.directory, "prisma");
  const migrationDirectory = join(prismaDirectory, "migrations");
  mkdirSync(migrationDirectory, { recursive: true });
  cpSync(LEGACY_SCHEMA, join(prismaDirectory, "schema.prisma"));
  for (const migration of LEGACY_MIGRATIONS) {
    cpSync(
      join(DB_ROOT, "prisma", "migrations", migration),
      join(migrationDirectory, migration),
      { recursive: true }
    );
  }
  writeProbeConfig(probe);
}

function addCurrentMigration(probe: Probe, injectFailure = false): void {
  const target = join(
    probe.directory,
    "prisma",
    "migrations",
    "20260804000000_multi_tenant"
  );
  cpSync(CURRENT_MIGRATION, target, { recursive: true });
  cpSync(CURRENT_SCHEMA, join(probe.directory, "prisma", "schema.prisma"));

  if (injectFailure) {
    const migrationPath = join(target, "migration.sql");
    const source = readFileSync(migrationPath, "utf8");
    const marker = "-- Session 回填及 Tenant 查询索引。";
    ensure(source.includes(marker), "failure injection marker is missing");
    writeFileSync(
      migrationPath,
      source.replace(marker, `SELECT 1 / 0;\n\n${marker}`),
      "utf8"
    );
  }
}

function prismaBinary(): string {
  const packagePath = require.resolve("prisma/package.json");
  const binary = join(dirname(packagePath), "build", "index.js");
  ensure(readFileSync(binary).byteLength > 0, "Prisma CLI binary is missing");
  return binary;
}

function deploy(probe: Probe): void {
  execFileSync(process.execPath, [prismaBinary(), "migrate", "deploy"], {
    cwd: probe.directory,
    env: { ...process.env, DATABASE_URL: probe.databaseUrl },
    stdio: "pipe",
  });
}

async function migrationNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ migration_name: string }>(
    `SELECT migration_name
       FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name`
  );
  return result.rows.map((row) => row.migration_name);
}

async function insertLegacyFixtures(pool: Pool): Promise<LegacySnapshot> {
  const now = Date.now();
  const future = new Date(now + 60 * 60 * 1000);
  const past = new Date(now - 60 * 1000);

  await pool.query(
    `INSERT INTO accounts
      (id, status, username, phone, email, password_algorithm, password_hash,
       password_changed_at, created_at, updated_at)
     VALUES
      ('probe-account-1', 'active', 'shared-user', '+12025550101', 'one@example.com',
       'legacy-md5', '1234567890123aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', NOW(), NOW(), NOW()),
      ('probe-account-2', 'active', 'second-user', '+12025550102', 'two@example.com',
       'legacy-md5', '1234567890123bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', NOW(), NOW(), NOW())`
  );
  await pool.query(
    `INSERT INTO sessions
      (id, account_id, refresh_key_hash, refresh_key_hmac_key_id, expires_at, created_at, updated_at)
     VALUES
      ('probe-session-1', 'probe-account-1', 'refresh-hash-1', 'primary', $1, NOW(), NOW()),
      ('probe-session-2', 'probe-account-2', 'refresh-hash-2', 'primary', $1, NOW(), NOW())`,
    [future]
  );
  await pool.query(
    `INSERT INTO account_create_idempotency
      (key, request_hash, account_id, expires_at, created_at, updated_at)
     VALUES
      ('probe-idem-live', 'request-live', 'probe-account-1', $1, NOW(), NOW()),
      ('probe-idem-expired', 'request-expired', 'probe-account-2', $2, NOW(), NOW())`,
    [future, past]
  );
  await pool.query(
    `INSERT INTO auth_audit_events
      (id, event_type, account_id, session_id, success, actor_type, actor_id,
       request_id, ip, user_agent, metadata, created_at)
     VALUES
      ('probe-audit-1', 'account.create', 'probe-account-1', NULL, TRUE, 'service', NULL,
       'request-1', '192.0.2.1', 'probe', '{"fixture":1}', NOW()),
      ('probe-audit-2', 'login.success', 'probe-account-1', 'probe-session-1', TRUE, 'account',
       'probe-account-1', 'request-2', '192.0.2.2', 'probe', '{"fixture":2}', NOW()),
      ('probe-audit-3', 'login.failure', 'probe-account-2', NULL, FALSE, 'anonymous', NULL,
       'request-3', '192.0.2.3', 'probe', '{"fixture":3}', NOW())`
  );

  const accounts = await pool.query(
    `SELECT id, username, phone, email
       FROM accounts
      ORDER BY id`
  );
  const sessions = await pool.query(
    `SELECT id, refresh_key_hash, refresh_key_hmac_key_id
       FROM sessions
      ORDER BY id`
  );
  return { accounts: accounts.rows, sessions: sessions.rows };
}

async function expectPostgresCode(
  action: () => Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await action();
  } catch (error) {
    ensureEqual((error as DatabaseError).code, code);
    return;
  }
  throw new Error(`expected PostgreSQL error ${code}`);
}

async function assertNotNullColumns(pool: Pool): Promise<void> {
  const expected = [
    ["accounts", "tenant_id"],
    ["sessions", "tenant_id"],
    ["account_create_idempotency", "tenant_id"],
    ["auth_audit_events", "tenant_id"],
  ];
  for (const [tableName, columnName] of expected) {
    const result = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tableName, columnName]
    );
    ensureEqual(result.rows[0]?.is_nullable, "NO");
  }
}

async function assertMigratedState(
  pool: Pool,
  legacy: LegacySnapshot
): Promise<void> {
  const tenants = await pool.query(
    "SELECT id, name, status FROM tenants ORDER BY id"
  );
  ensureEqual(tenants.rows.length, 1);
  ensureDeepEqual(tenants.rows[0], {
    id: "default",
    name: "default",
    status: "active",
  });

  for (const table of ["accounts", "sessions", "auth_audit_events"]) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id <> 'default'`
    );
    ensureEqual(result.rows[0]?.count, 0);
  }
  await assertNotNullColumns(pool);

  const idempotency = await pool.query(
    `SELECT key, tenant_id
       FROM account_create_idempotency
      ORDER BY key`
  );
  ensureDeepEqual(idempotency.rows, [
    { key: "probe-idem-live", tenant_id: "default" },
  ]);

  const accounts = await pool.query(
    `SELECT id, username, phone, email
       FROM accounts
      WHERE id IN ('probe-account-1', 'probe-account-2')
      ORDER BY id`
  );
  ensureDeepEqual(accounts.rows, legacy.accounts);
  const sessions = await pool.query(
    `SELECT id, refresh_key_hash, refresh_key_hmac_key_id
       FROM sessions
      ORDER BY id`
  );
  ensureDeepEqual(sessions.rows, legacy.sessions);

  const oldIndexes = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])`,
    [["accounts_username_key", "accounts_phone_key", "accounts_email_key"]]
  );
  ensureEqual(oldIndexes.rows[0]?.count, 0);
}

async function assertTenantConstraints(pool: Pool): Promise<void> {
  await expectPostgresCode(
    () =>
      pool.query(
        `INSERT INTO tenants (id, name, status, created_at, updated_at)
         VALUES ('invalid-status', NULL, 'paused', NOW(), NOW())`
      ),
    "23514"
  );

  await pool.query(
    `INSERT INTO tenants (id, name, status, created_at, updated_at)
     VALUES ('test', 'test', 'active', NOW(), NOW())`
  );
  await expectPostgresCode(
    () =>
      pool.query(
        `INSERT INTO accounts
          (id, tenant_id, status, username, password_algorithm, password_hash,
           password_changed_at, created_at, updated_at)
         VALUES
          ('probe-duplicate-default', 'default', 'active', 'shared-user', 'legacy-md5',
           '1234567890123cccccccccccccccccccccccccccccccc', NOW(), NOW(), NOW())`
      ),
    "23505"
  );
  await pool.query(
    `INSERT INTO accounts
      (id, tenant_id, status, username, password_algorithm, password_hash,
       password_changed_at, created_at, updated_at)
     VALUES
      ('probe-cross-tenant', 'test', 'active', 'shared-user', 'legacy-md5',
       '1234567890123dddddddddddddddddddddddddddddddd', NOW(), NOW(), NOW())`
  );
}

async function databaseSnapshot(pool: Pool): Promise<unknown> {
  const tables = [
    "tenants",
    "accounts",
    "sessions",
    "account_create_idempotency",
    "auth_audit_events",
    "tenant_api_keys",
  ];
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    const rows = await pool.query(
      `SELECT to_jsonb(value) AS value FROM (SELECT * FROM ${table} ORDER BY 1) AS value`
    );
    result[table] = rows.rows.map((row) => row.value);
  }
  result.migrations = await migrationNames(pool);
  return result;
}

async function assertFailureRollback(pool: Pool): Promise<void> {
  const tenantTable = await pool.query<{ table_name: string | null }>(
    `SELECT to_regclass('public.tenants')::text AS table_name`
  );
  ensureEqual(tenantTable.rows[0]?.table_name, null);

  const tenantColumn = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'tenant_id'`
  );
  ensureEqual(tenantColumn.rows[0]?.count, 0);

  const oldIndex = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'accounts_username_key'`
  );
  ensureEqual(oldIndex.rows[0]?.count, 1);
}

async function createDatabase(maintenance: Pool, probe: Probe): Promise<void> {
  await maintenance.query(
    `CREATE DATABASE ${quoteIdentifier(probe.databaseName)}`
  );
}

async function cleanupProbe(maintenance: Pool, probe: Probe): Promise<void> {
  await maintenance.query(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(probe.databaseName)}`
  );
  assertProbeDirectory(probe.directory);
  rmSync(probe.directory, { force: true, recursive: true });
}

async function verifySuccessfulMigration(
  maintenance: Pool,
  baseUrl: string
): Promise<void> {
  const probe = createProbe(baseUrl, "success");
  let pool: Pool | undefined;
  try {
    await createDatabase(maintenance, probe);
    prepareLegacyProject(probe);
    deploy(probe);

    pool = new Pool({ connectionString: probe.databaseUrl });
    ensureDeepEqual(await migrationNames(pool), [...LEGACY_MIGRATIONS]);
    const legacy = await insertLegacyFixtures(pool);

    addCurrentMigration(probe);
    deploy(probe);
    ensureDeepEqual(await migrationNames(pool), [
      ...LEGACY_MIGRATIONS,
      "20260804000000_multi_tenant",
    ]);
    await assertMigratedState(pool, legacy);
    await assertTenantConstraints(pool);

    const beforeNoOp = await databaseSnapshot(pool);
    deploy(probe);
    const afterNoOp = await databaseSnapshot(pool);
    ensureDeepEqual(afterNoOp, beforeNoOp);
  } finally {
    await pool?.end();
    await cleanupProbe(maintenance, probe);
  }
}

async function verifyFailureRollback(
  maintenance: Pool,
  baseUrl: string
): Promise<void> {
  const probe = createProbe(baseUrl, "failure");
  let pool: Pool | undefined;
  try {
    await createDatabase(maintenance, probe);
    prepareLegacyProject(probe);
    deploy(probe);
    addCurrentMigration(probe, true);

    let failed = false;
    try {
      deploy(probe);
    } catch {
      failed = true;
    }
    ensureEqual(failed, true, "failure-injected migration unexpectedly passed");

    pool = new Pool({ connectionString: probe.databaseUrl });
    await assertFailureRollback(pool);
  } finally {
    await pool?.end();
    await cleanupProbe(maintenance, probe);
  }
}

async function main(): Promise<void> {
  const databaseUrl = requiredDatabaseUrl();
  const maintenance = new Pool({ connectionString: databaseUrl, max: 1 });
  mkdirSync(PROBE_ROOT, { recursive: true });
  try {
    await verifySuccessfulMigration(maintenance, databaseUrl);
    await verifyFailureRollback(maintenance, databaseUrl);
    console.log("multi-tenant backfill migration verified");
  } finally {
    await maintenance.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
