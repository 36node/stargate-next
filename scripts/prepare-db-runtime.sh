#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/.docker/db}"

cd "$ROOT_DIR"

test -f packages/db/prisma.config.ts
test -f packages/db/studio-proxy.ts

rm -rf "$OUTPUT_DIR"
CI=true PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x" pnpm --filter @repo/db deploy --legacy "$OUTPUT_DIR"
(
  cd "$OUTPUT_DIR"
  CI=true PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x" ./node_modules/.bin/prisma generate
)
pnpm --filter @repo/db exec tsup studio-proxy.ts \
  --format esm \
  --out-dir "$OUTPUT_DIR/dist" \
  --platform node \
  --clean
pnpm --filter @repo/db exec tsup scripts/migrate-legacy-accounts.ts \
  --format cjs \
  --out-dir "$OUTPUT_DIR/dist" \
  --platform node
rm -f "$OUTPUT_DIR"/.env*

test -x "$OUTPUT_DIR/node_modules/.bin/prisma"
test -f "$OUTPUT_DIR/dist/studio-proxy.mjs"
test -f "$OUTPUT_DIR/dist/migrate-legacy-accounts.js"
test -f "$OUTPUT_DIR/prisma/schema.prisma"

node --check "$OUTPUT_DIR/dist/migrate-legacy-accounts.js"
migration_probe_output="$(
  env \
    ACCOUNT_ID_STRATEGY=derived \
    LEGACY_DATABASE_URL='mongodb://127.0.0.1:1/test?serverSelectionTimeoutMS=100' \
    MIGRATION_MODE=preflight \
    NEXT_STARGATE_DATABASE_URL='postgresql://postgres:invalid@127.0.0.1:1/stargate?schema=public' \
    STARGATE_TENANT_ID=runtime-probe \
    node "$OUTPUT_DIR/dist/migrate-legacy-accounts.js" 2>&1 || true
)"
if [[ "$migration_probe_output" != *"ECONNREFUSED 127.0.0.1:1"* ]]; then
  printf '%s\n' "$migration_probe_output" >&2
  echo "Migration runtime probe did not reach the expected MongoDB connection failure" >&2
  exit 1
fi
