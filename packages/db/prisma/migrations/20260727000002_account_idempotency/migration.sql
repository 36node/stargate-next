CREATE TABLE "account_create_idempotency" (
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "account_id" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_create_idempotency_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "account_create_idempotency_expires_at_idx"
  ON "account_create_idempotency"("expires_at");

ALTER TABLE "account_create_idempotency"
  ADD CONSTRAINT "account_create_idempotency_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
