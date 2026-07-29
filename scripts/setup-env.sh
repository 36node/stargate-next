#!/bin/bash

# Setup .env symlinks for all apps and selected packages.
# Links root .env into each apps/{app}/.env and packages/{pkg}/.env.
# Usage: scripts/setup-env.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

if [ "${CI:-}" = "true" ]; then
  print_info "CI environment detected; skipping .env setup"
  exit 0
fi

ROOT_ENV=".env"
ROOT_ENV_EXAMPLE=".env.example"

if [ ! -f "$ROOT_ENV" ]; then
  if [ -f "$ROOT_ENV_EXAMPLE" ]; then
    cp "$ROOT_ENV_EXAMPLE" "$ROOT_ENV"
    print_info "Created '$ROOT_ENV' from '$ROOT_ENV_EXAMPLE'. Please review and fill in actual values."
  else
    print_error "Neither '$ROOT_ENV' nor '$ROOT_ENV_EXAMPLE' found."
    exit 1
  fi
fi

dirs=()
for dir in apps/*/; do
  [ -d "$dir" ] || continue
  [ "${dir%/}" = "apps/stargate" ] && continue
  dirs+=("${dir%/}")
done

packages=(packages/db)
for pkg in "${packages[@]}"; do
  [ -d "$pkg" ] && dirs+=("$pkg")
done

if [ ${#dirs[@]} -eq 0 ]; then
  print_warning "No target directories found"
  exit 0
fi

print_info "Linking root .env..."

for dir in "${dirs[@]}"; do
  link="$dir/.env"
  depth=$(echo "$dir" | tr '/' '\n' | wc -l | tr -d ' ')
  target=$(printf '../%.0s' $(seq 1 "$depth"))".env"

  if [ -L "$link" ]; then
    print_info "  ✓ $link -> $(readlink "$link") (already exists)"
    continue
  fi

  if [ -f "$link" ]; then
    print_warning "  ⚠ $link is a real file, skipping (remove it manually to replace with a symlink)"
    continue
  fi

  ln -s "$target" "$link"
  print_info "  ✓ $link -> $target (created)"
done

print_info "Done!"
