import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env" });

if (!process.env.STARGATE_BASE_URL && process.env.STARGATE_ENDPOINT) {
  process.env.STARGATE_BASE_URL = process.env.STARGATE_ENDPOINT;
}

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.spec.ts"],
  },
});
