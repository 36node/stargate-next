#!/bin/bash

# Manage local development services.
# Usage:
#   scripts/dev-services.sh up
#   scripts/dev-services.sh down
#   scripts/dev-services.sh reset

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

compose() {
  (cd "$ROOT_DIR" && docker compose "$@")
}

require_docker_compose() {
  if ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not available. Please install Docker Desktop or Docker Compose."
    exit 1
  fi
}

wait_for_redis() {
  print_info "Waiting for Redis to accept connections..."

  for i in $(seq 1 "${REDIS_READY_RETRIES:-60}"); do
    response="$(compose exec -T redis redis-cli ping 2> /dev/null | tr -d '\r' || true)"
    if [ "$response" = "PONG" ]; then
      print_info "Redis is ready."
      return 0
    fi

    if [ "$i" -eq "${REDIS_READY_RETRIES:-60}" ]; then
      print_error "Redis did not become ready in time."
      return 1
    fi

    sleep 1
  done
}

wait_for_postgres() {
  print_info "Waiting for Postgres to accept connections..."

  for i in $(seq 1 "${POSTGRES_READY_RETRIES:-60}"); do
    if compose exec -T postgres pg_isready -U postgres -d stargate-next-local &> /dev/null; then
      print_info "Postgres is ready."
      return 0
    fi

    if [ "$i" -eq "${POSTGRES_READY_RETRIES:-60}" ]; then
      print_error "Postgres did not become ready in time."
      compose logs postgres || true
      return 1
    fi

    sleep 1
  done
}

start_services() {
  print_info "Starting Postgres and Redis..."
  compose up -d postgres redis

  wait_for_postgres
  wait_for_redis

  print_info "Development services are ready."
}

stop_services() {
  print_info "Stopping development services..."
  compose down
}

reset_services() {
  print_warning "Resetting development services and deleting Docker volumes..."
  compose down -v
  start_services
}

usage() {
  echo "Usage: scripts/dev-services.sh {up|down|reset}"
}

main() {
  require_docker_compose

  case "${1:-up}" in
    up)
      start_services
      ;;
    down)
      stop_services
      ;;
    reset)
      reset_services
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      print_error "Unknown command: $1"
      usage
      exit 1
      ;;
  esac
}

main "$@"
