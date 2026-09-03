#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/.docker/stargate-next}"

cd "$ROOT_DIR"

if [ ! -f apps/stargate-next/dist/src/main.js ]; then
  echo "error: expected nest build output at apps/stargate-next/dist/src/main.js" >&2
  ls -la apps/stargate-next/dist 2>/dev/null || true
  ls -la apps/stargate-next/dist/src 2>/dev/null || true
  exit 1
fi
test -d packages/services/stargate/dist
test -d packages/db/dist
test -d packages/redis/dist

rm -rf "$OUTPUT_DIR"
pnpm --filter stargate-next deploy --prod --legacy "$OUTPUT_DIR"

# pnpm deploy follows npm pack rules, which can omit ignored build artifacts.
# Restore the workspace build outputs required by the production entry point.
cp -R apps/stargate-next/dist "$OUTPUT_DIR/dist"

# `prisma generate` runs during the full workspace build, but pnpm deploy
# does not run the db package's postinstall hook. Copy its generated client
# into the deployed virtual store so @prisma/client can resolve `.prisma`.
source_client_dir="$(realpath node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client)"
runtime_client_dir="$(realpath "$OUTPUT_DIR"/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client)"
source_prisma_dir="$(dirname "$(dirname "$source_client_dir")")/.prisma"
runtime_prisma_dir="$(dirname "$(dirname "$runtime_client_dir")")/.prisma"

test -f "$source_prisma_dir/client/default.js"
cp -R "$source_prisma_dir" "$runtime_prisma_dir"
test -f "$runtime_prisma_dir/client/default.js"
