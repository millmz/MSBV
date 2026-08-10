import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromiumPath = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:8799",
    ...(existsSync(chromiumPath) ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  webServer: {
    command: "pnpm start",
    port: 8799,
    reuseExistingServer: false,
    env: {
      PORT: "8799",
      APP_PASSWORD: "e2e-password",
      MSBV_DATA_DIR: ".e2e-data",
      LOG_LEVEL: "silent",
    },
  },
});
