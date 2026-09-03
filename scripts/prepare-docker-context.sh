#!/usr/bin/env bash

set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: bash scripts/prepare-docker-context.sh <stargate-next|playground> [pnpm command...]" >&2
  exit 2
fi

shift

if (($# == 0)); then
  PNPM=(pnpm)
else
  PNPM=("$@")
fi

deploy_package() {
  local package="$1"
  local destination="$2"

  case "$destination" in
    "$ROOT_DIR"/apps/*/deploy) ;;
    *)
      echo "Refusing to replace unexpected deploy directory: $destination" >&2
      exit 1
      ;;
  esac

  rm -rf -- "$destination"
  # pnpm 11's legacy deploy performs a production install in an isolated
  # workspace. The linked @repo/db package has a postinstall that needs the
  # dev-only Prisma CLI, while Prisma Client was already generated above.
  # Skip isolated lifecycle scripts so production artifact creation remains
  # deterministic and does not fail on that postinstall.
  "${PNPM[@]}" --filter "$package" deploy --legacy --prod "$destination" \
    --config.ignore-scripts=true \
    --os=linux \
    --cpu=x64 \
    --libc=musl
}

require_path() {
  local path="$1"

  if [[ ! -e "$path" ]]; then
    echo "Required Docker runtime artifact is missing: ${path#"$ROOT_DIR"/}" >&2
    exit 1
  fi
}

require_musl_companion() {
  local virtual_store="$1"
  local gnu_pattern="$2"
  local musl_pattern="$3"
  local gnu_match

  gnu_match="$(find "$virtual_store" -mindepth 1 -maxdepth 1 -type d -name "$gnu_pattern" -print -quit)"
  if [[ -z "$gnu_match" ]]; then
    return
  fi

  if ! find "$virtual_store" -mindepth 1 -maxdepth 1 -type d -name "$musl_pattern" -print -quit | grep -q .; then
    echo "GNU native dependency has no Alpine/musl companion: ${gnu_match##*/}" >&2
    exit 1
  fi
}

verify_alpine_dependencies() {
  local deploy_dir="$1"
  local virtual_store="$deploy_dir/node_modules/.pnpm"

  require_path "$virtual_store"
  require_musl_companion "$virtual_store" '@img+sharp-linux-x64@*' '@img+sharp-linuxmusl-x64@*'
  require_musl_companion \
    "$virtual_store" \
    '@img+sharp-libvips-linux-x64@*' \
    '@img+sharp-libvips-linuxmusl-x64@*'
  require_musl_companion "$virtual_store" '@next+swc-linux-x64-gnu@*' '@next+swc-linux-x64-musl@*'
}

restore_prisma_client() {
  local deploy_dir="$1"
  local runtime_client_dir
  local runtime_prisma_dir
  local source_prisma_dir
  local prisma_version

  runtime_client_dir="$(find "$deploy_dir/node_modules/.pnpm" -path '*/node_modules/@prisma/client' -type d | head -n 1)"
  require_path "$runtime_client_dir"
  runtime_prisma_dir="$(dirname "$(dirname "$runtime_client_dir")")/.prisma"

  prisma_version="$(node -p "require('$runtime_client_dir/package.json').version")"
  source_prisma_dir="$(
    find "$ROOT_DIR/node_modules/.pnpm" \
      -path "*@prisma+client@${prisma_version}*/node_modules/.prisma/client/default.js" \
      -print \
      -quit
  )"
  require_path "$source_prisma_dir"
  source_prisma_dir="$(dirname "$(dirname "$source_prisma_dir")")"

  cp -R "$source_prisma_dir" "$runtime_prisma_dir"
  require_path "$runtime_prisma_dir/client/default.js"
}

prepare_stargate_next() {
  local deploy_dir="$ROOT_DIR/apps/stargate-next/deploy"

  require_path "$ROOT_DIR/apps/stargate-next/dist/main.js"

  deploy_package stargate-next "$deploy_dir"
  cp -R "$ROOT_DIR/apps/stargate-next/dist" "$deploy_dir/dist"
  restore_prisma_client "$deploy_dir"

  require_path "$deploy_dir/package.json"
  require_path "$deploy_dir/node_modules"
  require_path "$deploy_dir/dist/main.js"
  verify_alpine_dependencies "$deploy_dir"
}

prepare_playground() {
  local standalone_dir="$ROOT_DIR/apps/playground/.next/standalone"

  require_path "$ROOT_DIR/apps/playground/.next/standalone/apps/playground/server.js"
  require_path "$ROOT_DIR/apps/playground/.next/static"
  require_path "$ROOT_DIR/apps/playground/public"

  find "$standalone_dir" -name '.env*' -delete
  find "$standalone_dir/apps/playground" -name '.env*' -delete 2>/dev/null || true
}

cd "$ROOT_DIR"

case "$TARGET" in
  stargate-next)
    prepare_stargate_next
    ;;
  playground)
    prepare_playground
    ;;
  *)
    echo "Unsupported Docker context target: $TARGET" >&2
    exit 2
    ;;
esac
