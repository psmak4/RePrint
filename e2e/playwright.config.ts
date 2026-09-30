import { defineConfig, devices } from '@playwright/test'

// Local domains follow docs/DECISIONS.md D-013. `*.localhost` resolves to loopback in Chromium
// and WebKit; override E2E_WEB_ORIGIN / E2E_API_ORIGIN to point at another stack.
const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://www.reprint.localhost:5173'
const apiOrigin = process.env.E2E_API_ORIGIN ?? 'http://api.reprint.localhost:3000'
const webPort = new URL(webOrigin).port || '80'
const apiPort = new URL(apiOrigin).port || '80'

const stackEnv = {
  NODE_ENV: 'production',
  APP_ENV: 'local',
  LOG_LEVEL: 'warn',
  WEB_ORIGIN: webOrigin,
  API_ORIGIN: apiOrigin,
  WEB_ORIGINS: webOrigin,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://reprint:reprint@localhost:5432/reprint',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  SOURCE_MODE: 'stub',
  // Accounts specs: open signups, no HIBP lookups, per-test client IPs, and emails sent by an
  // in-process worker to Mailpit (docker compose).
  PUBLIC_SIGNUPS: 'true',
  HIBP_MODE: 'off',
  TRUST_PROXY: 'true',
  WORKER_IN_PROCESS: 'true',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: process.env.SMTP_PORT ?? '1025',
  API_INTERNAL_URL: `http://localhost:${apiPort}`,
}

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Both apps run from their production builds (`pnpm build` first). The Docker services
  // (Postgres, Redis, Mailpit) come from `docker compose up -d --wait`.
  webServer: [
    {
      name: 'api',
      command: 'node apps/api/dist/server.js',
      cwd: '..',
      env: { ...stackEnv, PORT: apiPort, HOST: '0.0.0.0' },
      url: `http://localhost:${apiPort}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      name: 'web',
      // Run node directly: a pnpm wrapper leaves the server orphaned, holding the output pipe open
      // so the CI step never finishes.
      command: 'node node_modules/@react-router/serve/bin.cjs build/server/index.js',
      cwd: '../apps/web',
      env: { ...stackEnv, PORT: webPort, HOST: '0.0.0.0' },
      url: `http://localhost:${webPort}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
