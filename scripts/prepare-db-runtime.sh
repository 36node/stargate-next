#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/.docker/db}"

cd "$ROOT_DIR"

test -f packages/db/prisma.config.ts
test -f packages/db/studio-proxy.ts

rm -rf "$OUTPUT_DIR"
CI=true PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x" pnpm --filter @repo/db deploy --legacy "$OUTPUT_DIR"
pnpm --filter @repo/db exec tsup studio-proxy.ts \
  --format esm \
  --out-dir "$OUTPUT_DIR/dist" \
  --platform node \
  --clean
rm -f "$OUTPUT_DIR"/.env*

test -x "$OUTPUT_DIR/node_modules/.bin/prisma"
test -f "$OUTPUT_DIR/dist/studio-proxy.mjs"
test -f "$OUTPUT_DIR/prisma/schema.prisma"
