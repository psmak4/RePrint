import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Server-side variables (API_INTERNAL_URL, WEB_PORT) live in the repo-root .env.
  const env = loadEnv(mode, '../..', '')
  for (const key of ['API_INTERNAL_URL', 'WEB_PORT']) {
    if (env[key] && process.env[key] === undefined) process.env[key] = env[key]
  }
  return {
    plugins: [tailwindcss(), reactRouter()],
    server: { port: Number(process.env.WEB_PORT ?? 5173) },
    envDir: '../..',
  }
})
