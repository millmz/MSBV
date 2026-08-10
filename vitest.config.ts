import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: { LOG_LEVEL: "silent", MSBV_DATA_DIR: ".test-data", SEASON: "2026" },
  },
});
