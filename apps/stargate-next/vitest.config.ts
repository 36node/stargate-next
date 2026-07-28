import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.spec.ts"],
  },
});
