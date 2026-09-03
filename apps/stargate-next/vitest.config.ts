import baseConfig from "@repo/vitest-config/node";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test/**/*.spec.ts"],
    },
  })
);
