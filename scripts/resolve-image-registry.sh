#!/usr/bin/env bash

set -euo pipefail

provider="${IMAGE_REGISTRY_PROVIDER:-harbor}"

case "$provider" in
  harbor)
    registry="harbor.36node.com"
    project="stargate"
    ;;
  *)
    echo "Unsupported IMAGE_REGISTRY_PROVIDER: $provider (supported: harbor)" >&2
    exit 2
    ;;
esac

repository_prefix="${registry}/${project}"

emit() {
  local key="$1"
  local value="$2"

  printf '%s=%s\n' "$key" "$value"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

emit provider "$provider"
emit registry "$registry"
emit project "$project"
emit repository_prefix "$repository_prefix"
emit stargate_next_image "$repository_prefix/stargate-next"
emit playground_image "$repository_prefix/playground"
emit db_image "$repository_prefix/db"
emit chart_repository "oci://$repository_prefix"
