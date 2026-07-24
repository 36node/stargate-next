#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

fingerprint() {
  (
    cd "$ROOT_DIR"
    for path in "$@"; do
      test -e "$path"
      printf '%s\n' "$path"
      if test -d "$path"; then
        rg --files -uu "$path" | LC_ALL=C sort | while IFS= read -r file; do
          printf '%s\n' "$file"
          shasum -a 256 "$file"
        done
      else
        shasum -a 256 "$path"
      fi
    done
  ) | sha256
}

stargate_next_sha="$(
  fingerprint \
    apps/stargate-next/Dockerfile \
    apps/stargate-next/package.json \
    apps/stargate-next/dist
)"

playground_sha="$(
  fingerprint \
    apps/playground/Dockerfile \
    apps/playground/.next/standalone \
    apps/playground/.next/static \
    apps/playground/data
)"

cat <<EOF
stargate_next_sha=$stargate_next_sha
playground_sha=$playground_sha
EOF
