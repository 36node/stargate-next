CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_algorithm" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "refresh_key_hash" TEXT NOT NULL,
    "refresh_key_hmac_key_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_audit_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "account_id" TEXT,
    "session_id" TEXT,
    "success" BOOLEAN NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "request_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_username_key" ON "accounts"("username");
CREATE UNIQUE INDEX "accounts_phone_key" ON "accounts"("phone");
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");
CREATE UNIQUE INDEX "sessions_refresh_key_hmac_key_id_refresh_key_hash_key"
  ON "sessions"("refresh_key_hmac_key_id", "refresh_key_hash");
CREATE INDEX "sessions_account_id_expires_at_idx" ON "sessions"("account_id", "expires_at");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
