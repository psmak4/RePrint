import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests do not load the React Router plugin.
export default defineConfig({
  test: { include: ['app/**/*.test.{ts,tsx}'] },
})
