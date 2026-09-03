import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/packages/ui": path.resolve(root, "packages/ui/index.tsx"),
      "@/packages/next-stargate": path.resolve(
        root,
        "packages/next-stargate/src"
      ),
      "@/packages/lib": path.resolve(root, "packages/lib"),
      "@/packages/services": path.resolve(root, "packages/services"),
      "@": root,
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/.next/**", "**/deploy/**"],
  },
});
