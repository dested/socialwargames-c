import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// E2E runs against an isolated test database on a dedicated port so it never
// touches your dev DB or dev server. `bun run test:e2e` boots the app itself
// (see `webServer`) and `global-setup.ts` truncates the test DB first so screen-
// shots are deterministic. Override the DB with E2E_DATABASE_URL if needed.
const PORT = 3100
const baseURL = `http://localhost:${PORT}`

// Derive the test-DB URL from the developer's .env (the Playwright CLI doesn't
// load .env — same story as prisma.config.ts): keep host + credentials, swap
// the database name for the isolated test DB.
function defaultTestDbUrl(): string {
  try {
    const url = /DATABASE_URL="?([^"\r\n]+)"?/.exec(readFileSync('.env', 'utf8'))?.[1]
    if (url) return url.replace(/\/[^/]*$/, '/social_war_games_test')
  } catch {
    // no .env — CI provides E2E_DATABASE_URL instead
  }
  return 'postgres://postgres:postgres@localhost:5432/social_war_games_test'
}
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? defaultTestDbUrl()

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Screenshots are pixel-compared; baselines live in e2e/__screenshots__ and
  // are committed. They are OS/font specific — regenerate on the same platform
  // your CI uses (`bun run test:e2e:update`).
  snapshotPathTemplate: 'e2e/__screenshots__/{testFileName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun server.ts',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'development',
      DATABASE_URL,
      BETTER_AUTH_SECRET: 'e2e-secret-at-least-32-characters-long!!',
      BETTER_AUTH_URL: baseURL,
    },
  },
})
