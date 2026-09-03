ALTER TABLE "tenants"
  ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_settings_object_check"
  CHECK (jsonb_typeof("settings") = 'object');
