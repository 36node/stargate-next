ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_status_check"
  CHECK ("status" IN ('active', 'disabled'));
