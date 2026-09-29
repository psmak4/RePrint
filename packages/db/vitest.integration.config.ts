import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    // Each file starts a Postgres container; give the first image pull room.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
