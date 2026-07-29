#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/.docker/playground}"

cd "$ROOT_DIR"

test -f apps/playground/.next/standalone/apps/playground/server.js
test -d apps/playground/.next/static

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/apps/playground/.next"
cp -R apps/playground/.next/standalone/. "$OUTPUT_DIR/"
cp -R apps/playground/.next/static "$OUTPUT_DIR/apps/playground/.next/static"
rm -f "$OUTPUT_DIR"/.env* "$OUTPUT_DIR/apps/playground"/.env*
