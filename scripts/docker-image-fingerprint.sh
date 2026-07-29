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
    printf 'node=%s\n' "$(node --version)"
    printf 'pnpm=%s\n' "$(pnpm --version)"
    printf 'arch=%s\n' "$(uname -m)"
    for path in "$@"; do
      test -e "$path"
      printf '%s\n' "$path"
      if test -d "$path"; then
        find "$path" -type f ! -name '.env' ! -name '.env.*' -print0 \
          | LC_ALL=C sort -z \
          | xargs -0 shasum -a 256
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
    pnpm-lock.yaml \
    package.json \
    pnpm-workspace.yaml \
    apps/stargate-next/dist \
    packages/db \
    packages/redis \
    packages/services/stargate
)"

playground_sha="$(
  fingerprint \
    apps/playground/Dockerfile \
    apps/playground/.next/standalone \
    apps/playground/.next/static
)"

cat <<EOF
stargate_next_sha=$stargate_next_sha
playground_sha=$playground_sha
EOF
