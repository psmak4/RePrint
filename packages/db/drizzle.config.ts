import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  // DRIZZLE_OUT lets db:check generate into a scratch folder.
  out: process.env.DRIZZLE_OUT ?? './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://reprint:reprint@localhost:5432/reprint',
  },
  strict: true,
  verbose: true,
})
