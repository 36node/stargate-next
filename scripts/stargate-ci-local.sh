#!/usr/bin/env bash

# Run core Stargate Next CI checks locally, including Docker bake and Alpine smoke.
# Does not deploy or push images to Harbor.
#
# Usage:
#   bash scripts/stargate-ci-local.sh              # check + typecheck + test + db migration + docker
#   bash scripts/stargate-ci-local.sh stargate-next
#   bash scripts/stargate-ci-local.sh --help
#
# Prerequisites:
#   - Node.js 24
#   - Docker with Buildx available
#   - PostgreSQL and Redis for integration or black-box tests (see root .env)
#   - Run `pnpm db:migrate` before service integration tests

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly -a DOCKER_APPS=(stargate-next playground db)

declare -A APP_FILTER=(
  [stargate-next]='stargate-next'
  [playground]='playground'
  [db]='@repo/db'
  [stargate-service]='@repo/stargate-service'
)

TARGET='all'
RUN_MIGRATION_TESTS=1
BUILT_CI=0

usage() {
  cat <<'EOF'
在本地执行 Stargate Next CI 的核心检查步骤，并在通过后构建、验证并清理本地 Docker 镜像。不执行部署或 Harbor 推送。

用法：
  bash scripts/stargate-ci-local.sh [目标] [--skip-migration-tests] [-h|--help]

目标：
  all               运行 check、typecheck、test、db migration tests 与全部镜像验证（默认）
  stargate-next     运行 stargate-next 测试并验证其镜像
  playground        运行 playground 测试并验证其镜像
  db                运行 @repo/db migration tests 并验证 db 镜像
  stargate-service  仅运行 @repo/stargate-service 测试

选项：
  --skip-migration-tests  跳过 packages/db migration tests
  -h, --help              显示帮助

说明：
  - 需要 Docker 与 Buildx；镜像以 stargate-ci-local/<应用>:latest 构建并在 smoke 后删除
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

is_docker_app() {
  local candidate="$1"
  local app

  for app in "${DOCKER_APPS[@]}"; do
    if [[ "$app" == "$candidate" ]]; then
      return 0
    fi
  done

  return 1
}

docker_apps_for_target() {
  if [[ "$TARGET" == 'all' ]]; then
    printf '%s\n' "${DOCKER_APPS[@]}"
    return
  fi

  if is_docker_app "$TARGET"; then
    printf '%s\n' "$TARGET"
  fi
}

run_check() {
  log_step 'pnpm check'
  pnpm check

  log_step '校验 Docker COPY 输入清单'
  FINGERPRINT_VERIFY_COPY_INPUTS_ONLY=1 FINGERPRINT_TARGET=all bash scripts/docker-image-fingerprint.sh
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

ensure_ci_build() {
  if ((BUILT_CI == 1)); then
    return
  fi

  log_step 'pnpm build:ci --summarize'
  NODE_ENV=production BUILD_STANDALONE=true pnpm build:ci --summarize
  BUILT_CI=1
}

build_image() {
  local app="$1"
  local image_tag="stargate-ci-local/${app}:latest"

  case "$app" in
    stargate-next | playground)
      log_step "准备 ${app} 的 Docker runtime artifacts"
      bash "$REPO_ROOT/scripts/prepare-docker-context.sh" "$app" pnpm
      ;;
  esac

  log_step "使用 Docker Bake 构建 ${app} 镜像（不 push）"
  docker buildx bake \
    --file "$REPO_ROOT/docker-bake.hcl" \
    --load \
    --set "${app}.platform=linux/amd64" \
    --set "${app}.tags=${image_tag}" \
    "$app"

  log_step "确认 ${app} 镜像已加载到本地 Docker"
  docker image inspect "$image_tag" >/dev/null

  log_step "验证 ${app} 的 runtime artifacts"
  bash "$REPO_ROOT/scripts/verify-docker-runtime.sh" "$app" "$image_tag"

  log_step "清理已验证的 ${app} 本地镜像"
  docker image rm "$image_tag" >/dev/null
}

run_docker_validation() {
  local apps=()
  local app
  local needs_build=0

  while IFS= read -r app; do
    [[ -n "$app" ]] && apps+=("$app")
  done < <(docker_apps_for_target)

  if ((${#apps[@]} == 0)); then
    return
  fi

  for app in "${apps[@]}"; do
    case "$app" in
      stargate-next | playground) needs_build=1 ;;
    esac
  done

  if ((needs_build == 1)); then
    ensure_ci_build
  fi

  for app in "${apps[@]}"; do
    build_image "$app"
  done
}

main() {
  parse_args "$@"

  require_command pnpm
  require_command rg
  require_command docker
  docker buildx version >/dev/null 2>&1 || fail 'Docker Buildx 不可用'

  node_major="$(node --version)"
  node_major="${node_major#v}"
  node_major="${node_major%%.*}"
  [[ "$node_major" == '24' ]] || fail "需要 Node.js 24，当前为 $(node --version)"

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
      run_docker_validation
      ;;
    db)
      run_check
      run_typecheck
      if ((RUN_MIGRATION_TESTS == 1)); then
        run_migration_tests
      fi
      run_docker_validation
      ;;
    stargate-service)
      run_check
      run_typecheck
      run_tests '@repo/stargate-service'
      ;;
    *)
      if [[ -z "${APP_FILTER[$TARGET]:-}" ]]; then
        usage >&2
        exit 2
      fi
      run_check
      run_typecheck
      run_tests "${APP_FILTER[$TARGET]}"
      run_docker_validation
      ;;
  esac

  log_step '完成'
}

main "$@"
