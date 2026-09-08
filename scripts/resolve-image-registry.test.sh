#!/usr/bin/env bash

set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly RESOLVER="$ROOT_DIR/scripts/resolve-image-registry.sh"

assert_contains() {
  local output="$1"
  local expected="$2"

  if [[ "$output" != *"$expected"* ]]; then
    echo "Expected registry output to contain: $expected" >&2
    echo "$output" >&2
    exit 1
  fi
}

default_output="$(env -u IMAGE_REGISTRY_PROVIDER bash "$RESOLVER")"
assert_contains "$default_output" "provider=harbor"
assert_contains "$default_output" "stargate_next_image=harbor.36node.com/stargate/stargate-next"
assert_contains "$default_output" "chart_repository=oci://harbor.36node.com/stargate"

harbor_output="$(IMAGE_REGISTRY_PROVIDER=harbor bash "$RESOLVER")"
if [[ "$harbor_output" != "$default_output" ]]; then
  echo "Explicit harbor output differs from the default output" >&2
  exit 1
fi

invalid_log="$(mktemp)"
trap 'rm -f "$invalid_log"' EXIT
set +e
IMAGE_REGISTRY_PROVIDER=dockerhub bash "$RESOLVER" >"$invalid_log" 2>&1
invalid_status=$?
set -e
if [[ "$invalid_status" -eq 0 ]]; then
  echo "Unsupported registry provider unexpectedly succeeded" >&2
  exit 1
fi
if [[ "$invalid_status" -ne 2 ]]; then
  echo "Unsupported registry provider exited with $invalid_status instead of 2" >&2
  exit 1
fi
assert_contains "$(<"$invalid_log")" "Unsupported IMAGE_REGISTRY_PROVIDER: dockerhub"

echo "Image registry provider tests passed"
