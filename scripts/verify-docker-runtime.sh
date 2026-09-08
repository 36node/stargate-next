#!/usr/bin/env bash

set -euo pipefail

readonly TARGET="${1:-}"
readonly IMAGE="${2:-}"

if [[ -z "$TARGET" || -z "$IMAGE" ]]; then
  echo "Usage: bash scripts/verify-docker-runtime.sh <stargate-next|playground|db> <image>" >&2
  exit 2
fi

verify_node_runtime() {
  local entry_file="$1"
  local runtime_module="$2"

  docker run --rm --entrypoint node "$IMAGE" \
    --import tsx \
    --input-type=module \
    --eval "
      import { access } from 'node:fs/promises';
      if (process.platform !== 'linux' || process.arch !== 'x64') {
        throw new Error(\`Unexpected runtime platform: \${process.platform}/\${process.arch}\`);
      }
      await access('$entry_file');
      await import('$runtime_module');
    "
}

verify_db_runtime() {
  docker run --rm --workdir /app --entrypoint node "$IMAGE" -e '
    const fs = require("fs");
    for (const path of ["prisma/schema.prisma", "prisma.config.ts", "studio-proxy.ts"]) {
      fs.accessSync(path);
    }
  '
  docker run --rm --network none --workdir /app --entrypoint prisma "$IMAGE" --version
}

case "$TARGET" in
  stargate-next)
    verify_node_runtime './dist/main.js' '@repo/stargate-service'
    ;;
  playground)
    docker run --rm --entrypoint node "$IMAGE" \
      --input-type=module \
      --eval "
        import { access } from 'node:fs/promises';
        if (process.platform !== 'linux' || process.arch !== 'x64') {
          throw new Error(\`Unexpected runtime platform: \${process.platform}/\${process.arch}\`);
        }
        await access('apps/playground/server.js');
      "
    ;;
  db)
    verify_db_runtime
    ;;
  *)
    echo "Unsupported Docker runtime target: $TARGET" >&2
    exit 2
    ;;
esac
