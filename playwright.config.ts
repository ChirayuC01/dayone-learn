import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on its own database. Playwright starts the web
// server first, then global-setup resets and seeds the database before any test runs.
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E = {
  baseURL: `http://localhost:${PORT}`,
  databaseUrl: process.env.E2E_DATABASE_URL ?? "postgresql://dayone:dayone@localhost:5432/dayone_e2e?schema=public",
  ingestToken: "e2e-ingest-token",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000, // reading a lesson takes a real minute
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E.baseURL,
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // e.g. a preinstalled Chromium in a sandbox; CI uses `npx playwright install chromium`
        ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${E2E.baseURL}/signin`, // no database access, so the server is "up" before global-setup builds the DB
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: E2E.databaseUrl,
      APP_URL: E2E.baseURL,
      AUTH_SECRET: "e2e-auth-secret-not-for-production-use-0000",
      AUTH_TRUST_HOST: "true",
      AUTH_TEST_PROVIDER: "1",
      INGEST_TOKEN: E2E.ingestToken,
      CRON_SECRET: "e2e-cron-secret",
      RESEND_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
