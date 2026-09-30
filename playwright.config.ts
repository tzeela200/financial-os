import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production build and the ephemeral CI Supabase (T-1). Hebrew RTL, mobile widths per 23B §93.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  retries: 0,
  use: { baseURL: "http://localhost:3000", locale: "he-IL", trace: "retain-on-failure" },
  // Intake tests write data, so they run after the empty-system tests (project dependencies).
  projects: [
    { name: "desktop", testIgnore: /intake\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-320", testIgnore: /intake\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 640 } } },
    { name: "intake-desktop", testMatch: /intake\.spec/, dependencies: ["desktop", "mobile-320"], use: { ...devices["Desktop Chrome"] } },
    { name: "intake-mobile-320", testMatch: /intake\.spec/, dependencies: ["intake-desktop"], use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 640 } } },
  ],
  webServer: { command: "npm run start", url: "http://localhost:3000/login", reuseExistingServer: false, timeout: 120_000, stdout: "pipe", stderr: "pipe" },
});
