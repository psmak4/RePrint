import netlifyReactRouter from '@netlify/vite-plugin-react-router'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Server-side variables (API_INTERNAL_URL, WEB_PORT) live in the repo-root .env.
  const env = loadEnv(mode, '../..', '')
  for (const key of [
    'API_INTERNAL_URL',
    'WEB_PORT',
    'API_ORIGIN',
    'APP_ENV',
    'LOG_LEVEL',
    'VITE_SENTRY_DSN',
  ]) {
    if (env[key] && process.env[key] === undefined) process.env[key] = env[key]
  }
  return {
    // The Netlify adapter turns the SSR build into a Netlify function. It runs only in Netlify builds
    // (which set NETLIFY), so local dev, CI e2e, and `react-router-serve` keep the plain build (D-071).
    plugins: [tailwindcss(), reactRouter(), ...(process.env.NETLIFY ? [netlifyReactRouter()] : [])],
    server: { port: Number(process.env.WEB_PORT ?? 5173) },
    envDir: '../..',
  }
})
