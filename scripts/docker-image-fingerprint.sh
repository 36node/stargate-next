#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v sha256sum >/dev/null 2>&1; then
  sha256_cmd() {
    sha256sum "$@" | awk '{print $1}'
  }
else
  sha256_cmd() {
    shasum -a 256 "$@" | awk '{print $1}'
  }
fi

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

base_images_for() {
  local dockerfile="$1"

  awk '
    toupper($1) == "FROM" {
      image_index = 2
      while (image_index <= NF && $image_index ~ /^--/) image_index++

      image = $image_index
      if (!(image in aliases) && !(image in emitted)) {
        print image
        emitted[image] = 1
      }

      for (i = image_index + 1; i < NF; i++) {
        if (toupper($i) == "AS") aliases[$(i + 1)] = 1
      }
    }
  ' "$ROOT_DIR/$dockerfile"
}

append_base_images() {
  local manifest_file="$1"
  local dockerfile="$2"
  local image
  local manifest
  local image_count=0

  while IFS= read -r image; do
    [ -n "$image" ] || continue
    image_count=$((image_count + 1))

    if ! manifest="$(docker buildx imagetools inspect "$image" --raw)"; then
      echo "Unable to read base image manifest for $dockerfile: $image" >&2
      exit 1
    fi

    {
      printf 'base-image %s\n' "$image"
      printf '%s' "$manifest" | hash_stream
      printf '\n'
    } >> "$manifest_file"
  done < <(base_images_for "$dockerfile")

  if [ "$image_count" -eq 0 ]; then
    echo "Dockerfile has no external base image: $dockerfile" >&2
    exit 1
  fi
}

require_path() {
  local path="$1"
  local absolute_path="$ROOT_DIR/$path"

  if [ ! -e "$absolute_path" ]; then
    echo "Required fingerprint input is missing: $path" >&2
    exit 1
  fi
}

append_input_digest() {
  local manifest_file="$1"
  local label="$2"
  shift 2

  local input
  for input in "$@"; do
    require_path "$input"
  done

  {
    printf '%s\n' "$label"
    printf 'path %s\n' "$@"
    node "$ROOT_DIR/scripts/lib/hash-docker-inputs.mjs" "$ROOT_DIR" "$@"
    printf '\n'
  } >> "$manifest_file"
}

extract_copy_inputs() {
  local dockerfile="$1"

  if awk '
    toupper($1) == "COPY" && ($2 ~ /^\[/ || $NF == "\\") { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$ROOT_DIR/$dockerfile"; then
    echo "Unsupported Docker COPY syntax in $dockerfile; use one shell-form COPY statement per line" >&2
    exit 1
  fi

  awk '
    toupper($1) == "COPY" {
      source_index = 2
      internal_stage = 0

      while (source_index <= NF && $source_index ~ /^--/) {
        if ($source_index ~ /^--from(=|$)/) internal_stage = 1
        if ($source_index == "--from") source_index++
        source_index++
      }

      if (internal_stage) next

      for (i = source_index; i < NF; i++) print $i
    }
  ' "$ROOT_DIR/$dockerfile"
}

verify_copy_inputs() {
  local dockerfile="$1"
  shift

  local dockerfile_inputs
  local configured_inputs
  dockerfile_inputs="$(mktemp)"
  configured_inputs="$(mktemp)"

  extract_copy_inputs "$dockerfile" > "$dockerfile_inputs"
  printf '%s\n' "$@" > "$configured_inputs"

  if ! cmp -s "$dockerfile_inputs" "$configured_inputs"; then
    echo "Fingerprint COPY input list does not match $dockerfile" >&2
    diff -u "$dockerfile_inputs" "$configured_inputs" >&2 || true
    rm -f "$dockerfile_inputs" "$configured_inputs"
    exit 1
  fi

  rm -f "$dockerfile_inputs" "$configured_inputs"
}

context_path() {
  local context="$1"
  local path="$2"

  case "$path" in
    /* | .. | ../* | */../*)
      echo "Unsupported Docker COPY source path: $path" >&2
      exit 1
      ;;
  esac

  if [ "$context" = "." ]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$context" "$path"
  fi
}

fingerprint() {
  local target="$1"
  local context="$2"
  local dockerfile="$3"
  shift 3

  local manifest_file
  manifest_file="$(mktemp)"

  verify_copy_inputs "$dockerfile" "$@"

  {
    printf 'docker-image-fingerprint-v2\n'
    printf 'target %s\n' "$target"
    printf 'context %s\n' "$context"
    printf 'dockerfile %s\n' "$dockerfile"
  } > "$manifest_file"

  append_base_images "$manifest_file" "$dockerfile"
  append_input_digest "$manifest_file" "dockerfile-input" "$dockerfile"

  local input
  local resolved_inputs=()
  for input in "$@"; do
    resolved_inputs+=("$(context_path "$context" "$input")")
  done
  append_input_digest "$manifest_file" "copy-inputs" "${resolved_inputs[@]}"

  sha256_cmd "$manifest_file"
  rm -f "$manifest_file"
}

stargate_next_copy_inputs=(
  "deploy/package.json"
  "deploy/node_modules"
  "dist"
)

playground_copy_inputs=(
  ".next/standalone"
  ".next/static"
  "public"
)

db_copy_inputs=(
  "packages/db/docker-runtime/package.json"
  "packages/db/docker-runtime/package-lock.json"
  "packages/db/prisma"
  "packages/db/prisma.config.ts"
  "packages/db/studio-proxy.ts"
)

stargate_next_sha() {
  fingerprint \
    "stargate-next" \
    "apps/stargate-next" \
    "apps/stargate-next/Dockerfile" \
    "${stargate_next_copy_inputs[@]}"
}

playground_sha() {
  fingerprint \
    "playground" \
    "apps/playground" \
    "apps/playground/Dockerfile" \
    "${playground_copy_inputs[@]}"
}

db_sha() {
  fingerprint \
    "db" \
    "." \
    "packages/db/Dockerfile" \
    "${db_copy_inputs[@]}"
}

verify_copy_inputs_for() {
  case "$1" in
    stargate-next)
      verify_copy_inputs "apps/stargate-next/Dockerfile" "${stargate_next_copy_inputs[@]}"
      ;;
    playground)
      verify_copy_inputs "apps/playground/Dockerfile" "${playground_copy_inputs[@]}"
      ;;
    db)
      verify_copy_inputs "packages/db/Dockerfile" "${db_copy_inputs[@]}"
      ;;
    all)
      verify_copy_inputs_for stargate-next
      verify_copy_inputs_for playground
      verify_copy_inputs_for db
      ;;
    *)
      echo "Unsupported FINGERPRINT_TARGET: $1" >&2
      exit 1
      ;;
  esac
}

emit_fingerprint() {
  local target="$1"
  local sha

  case "$target" in
    stargate-next)
      sha="$(stargate_next_sha)"
      printf 'stargate_next_sha=%s\n' "$sha"
      printf 'image_sha=%s\n' "$sha"
      ;;
    playground)
      sha="$(playground_sha)"
      printf 'playground_sha=%s\n' "$sha"
      printf 'image_sha=%s\n' "$sha"
      ;;
    db)
      sha="$(db_sha)"
      printf 'db_sha=%s\n' "$sha"
      printf 'image_sha=%s\n' "$sha"
      ;;
    all)
      printf 'stargate_next_sha=%s\n' "$(stargate_next_sha)"
      printf 'playground_sha=%s\n' "$(playground_sha)"
      printf 'db_sha=%s\n' "$(db_sha)"
      ;;
    *)
      echo "Unsupported FINGERPRINT_TARGET: $target" >&2
      exit 1
      ;;
  esac
}

if [ "${FINGERPRINT_VERIFY_COPY_INPUTS_ONLY:-0}" = "1" ]; then
  verify_copy_inputs_for "${FINGERPRINT_TARGET:-all}"
else
  emit_fingerprint "${FINGERPRINT_TARGET:-all}"
fi
