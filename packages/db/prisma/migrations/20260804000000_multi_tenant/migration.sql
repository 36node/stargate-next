-- 已用 Prisma 7.3.0 migrate deploy 验证：显式 BEGIN/COMMIT 不产生嵌套事务或提前提交；
-- verify:backfill 的中段失败注入确认本文件内所有 schema/data 变更整体回滚。
BEGIN;

-- Tenant 与默认租户。
CREATE TABLE "tenants" (
    "id"         VARCHAR(200) NOT NULL,
    "name"       TEXT,
    "status"     TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_status_check"
  CHECK ("status" IN ('active', 'disabled'));

INSERT INTO "tenants" ("id", "name", "status", "created_at", "updated_at")
VALUES ('default', 'default', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Tenant API Key。
CREATE TABLE "tenant_api_keys" (
    "id"          TEXT NOT NULL,
    "tenant_id"   VARCHAR(200) NOT NULL,
    "name"        TEXT,
    "first_four"  TEXT NOT NULL,
    "hmac_key_id" TEXT NOT NULL,
    "hash"        TEXT NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,
    CONSTRAINT "tenant_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_api_keys_hmac_key_id_hash_key"
  ON "tenant_api_keys"("hmac_key_id", "hash");
CREATE INDEX "tenant_api_keys_tenant_id_created_at_idx"
  ON "tenant_api_keys"("tenant_id", "created_at");
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Account 回填及 Tenant 内唯一约束。
ALTER TABLE "accounts" ADD COLUMN "tenant_id" VARCHAR(200);
UPDATE "accounts" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "accounts" ALTER COLUMN "tenant_id" SET NOT NULL;
DROP INDEX IF EXISTS "accounts_username_key";
DROP INDEX IF EXISTS "accounts_phone_key";
DROP INDEX IF EXISTS "accounts_email_key";
CREATE UNIQUE INDEX "accounts_tenant_id_username_key" ON "accounts"("tenant_id", "username");
CREATE UNIQUE INDEX "accounts_tenant_id_phone_key" ON "accounts"("tenant_id", "phone");
CREATE UNIQUE INDEX "accounts_tenant_id_email_key" ON "accounts"("tenant_id", "email");
CREATE INDEX "accounts_tenant_id_deleted_at_created_at_idx"
  ON "accounts"("tenant_id", "deleted_at", "created_at");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Session 回填及 Tenant 查询索引。
ALTER TABLE "sessions" ADD COLUMN "tenant_id" VARCHAR(200);
UPDATE "sessions" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "tenant_id" SET NOT NULL;
DROP INDEX IF EXISTS "sessions_account_id_expires_at_idx";
CREATE INDEX "sessions_tenant_id_account_id_expires_at_idx"
  ON "sessions"("tenant_id", "account_id", "expires_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Idempotency：先清过期记录，再把主键升级为 Tenant 复合主键。
DELETE FROM "account_create_idempotency" WHERE "expires_at" <= CURRENT_TIMESTAMP;
ALTER TABLE "account_create_idempotency" ADD COLUMN "tenant_id" VARCHAR(200);
UPDATE "account_create_idempotency" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "account_create_idempotency" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "account_create_idempotency" DROP CONSTRAINT "account_create_idempotency_pkey";
ALTER TABLE "account_create_idempotency"
  ADD CONSTRAINT "account_create_idempotency_pkey" PRIMARY KEY ("tenant_id", "key");
ALTER TABLE "account_create_idempotency" ADD CONSTRAINT "account_create_idempotency_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 审计只增加 Tenant 事实，不增加外键。
ALTER TABLE "auth_audit_events" ADD COLUMN "tenant_id" VARCHAR(200);
UPDATE "auth_audit_events" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "auth_audit_events" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "auth_audit_events_tenant_id_created_at_idx"
  ON "auth_audit_events"("tenant_id", "created_at");

COMMIT;
