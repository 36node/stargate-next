#!/usr/bin/env bash

# Run core Stargate Next CI checks locally.
# Does not deploy, push images, or run Docker bake.
#
# Usage:
#   bash scripts/stargate-ci-local.sh              # check + typecheck + test + db migration tests
#   bash scripts/stargate-ci-local.sh stargate-next
#   bash scripts/stargate-ci-local.sh --help
#
# Prerequisites for integration or black-box tests:
#   - PostgreSQL and Redis available (see root .env / DATABASE_URL / REDIS_URL)
#   - Run `pnpm db:migrate` before service integration tests

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

declare -A APP_FILTER=(
  [stargate-next]='stargate-next'
  [playground]='playground'
  [db]='@repo/db'
  [stargate-service]='@repo/stargate-service'
)

TARGET='all'
RUN_MIGRATION_TESTS=1

usage() {
  cat <<'EOF'
在本地执行 Stargate Next CI 的核心检查步骤。不执行部署、Harbor 推送或 Docker bake。

用法：
  bash scripts/stargate-ci-local.sh [目标] [--skip-migration-tests] [-h|--help]

目标：
  all               运行 check、typecheck、test 与 db migration tests（默认）
  stargate-next     仅运行 stargate-next 包测试
  playground        仅运行 playground 包测试
  db                仅运行 @repo/db test:migration
  stargate-service  仅运行 @repo/stargate-service 测试

选项：
  --skip-migration-tests  跳过 packages/db migration tests
  -h, --help              显示帮助

说明：
  - 仅操作 pnpm workspace 内包；legacy apps/stargate 不在范围内
  - 启动 legacy 服务请使用：pnpm dev:stargate
EOF
}

log_step() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --skip-migration-tests)
        RUN_MIGRATION_TESTS=0
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      -*)
        fail "未知选项：$1"
        ;;
      *)
        if [[ -n "$TARGET" && "$TARGET" != 'all' ]]; then
          fail "只能指定一个目标"
        fi
        TARGET="$1"
        ;;
    esac
    shift
  done
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

assert_legacy_outside_workspace() {
  if pnpm list -r --depth -1 2>/dev/null | rg -q '/apps/stargate$'; then
    fail 'apps/stargate 不应出现在 pnpm workspace 中'
  fi
}

run_check() {
  log_step 'pnpm check'
  pnpm check
}

run_typecheck() {
  log_step 'pnpm typecheck'
  pnpm typecheck
}

run_tests() {
  local filter="$1"
  log_step "pnpm --filter ${filter} test"
  pnpm --filter "$filter" test
}

run_migration_tests() {
  log_step 'pnpm --filter @repo/db test:migration'
  pnpm --filter @repo/db test:migration
}

main() {
  parse_args "$@"

  require_command pnpm
  require_command rg
  cd "$REPO_ROOT"

  assert_legacy_outside_workspace

  case "$TARGET" in
    all)
      run_check
      run_typecheck
      pnpm test
      if ((RUN_MIGRATION_TESTS == 1)); then
        run_migration_tests
      fi
      ;;
    db)
      if ((RUN_MIGRATION_TESTS == 1)); then
        run_migration_tests
      fi
      ;;
    *)
      if [[ -z "${APP_FILTER[$TARGET]:-}" ]]; then
        usage >&2
        exit 2
      fi
      run_check
      run_typecheck
      run_tests "${APP_FILTER[$TARGET]}"
      ;;
  esac

  log_step '完成'
}

main "$@"
