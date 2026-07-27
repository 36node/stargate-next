#!/bin/bash

# Start the legacy Stargate service with local development defaults.
# Usage:
#   scripts/dev-stargate-legacy.sh

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LEGACY_DIR="$ROOT_DIR/apps/stargate"

require_command() {
  if ! command -v "$1" &> /dev/null; then
    print_error "$1 is not available. Please install it first."
    exit 1
  fi
}

install_dependencies() {
  if [ -x "$LEGACY_DIR/node_modules/.bin/nest" ]; then
    print_info "Legacy Stargate dependencies already installed."
    return
  fi

  print_info "Installing legacy Stargate dependencies..."
  (
    cd "$LEGACY_DIR"
    CI=true pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
  )
}

start_legacy_stargate() {
  export MONGO_URL="${MONGO_URL:-mongodb://localhost:27017/auth-dev}"
  export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
  export API_KEY="${API_KEY:-playground-dev-api-key}"
  export JWT_SECRET_KEY="${JWT_SECRET_KEY:-playground-dev-jwt-secret}"
  export PORT="${PORT:-9527}"

  print_info "Starting legacy Stargate on port $PORT..."
  (
    cd "$LEGACY_DIR"
    exec pnpm dev
  )
}

main() {
  require_command pnpm

  install_dependencies
  start_legacy_stargate
}

main "$@"
