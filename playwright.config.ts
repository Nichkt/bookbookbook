import { defineConfig, devices } from "@playwright/test"

// Its own port, so a dev server you already have running on 5173 is left alone.
const PORT = 5174
// The production build, for what only it has: the service worker (e2e/pwa.spec.ts). `npm run preview` uses 4173.
const PREVIEW_PORT = 4174

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      testIgnore: /pwa\.spec\.ts/,
      // The installed Chrome; `npx playwright install chromium` and drop `channel` to use Playwright's build.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "pwa",
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Builds afresh each run. A server already running would be serving an older build, so one is never reused.
      command: `node e2e/preview.ts ${PREVIEW_PORT}`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
