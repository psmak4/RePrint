import instrumentSansUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'
import newsreaderUrl from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteError,
  useRouteLoaderData,
} from 'react-router'
import type { Route } from './+types/root'
import { Analytics } from './components/analytics.js'
import { VerificationBanner } from './components/auth/verification-banner.js'
import { ErrorPage } from './components/error-page.js'
import { AccountMenu } from './components/shell/account-menu.js'
import { AppShell } from './components/shell/app-shell.js'
import { MainNav } from './components/shell/main-nav.js'
import { NotificationBell } from './components/shell/notification-bell.js'
import { SearchBox } from './components/shell/search-box.js'
import { analyticsConfig } from './lib/analytics.js'
import { loadSession } from './lib/auth.server.js'
import { logger } from './lib/logger.server.js'
import { loadNotifications } from './lib/notifications.server.js'
import { createRequestLogMiddleware } from './lib/request-log.server.js'
import './app.css'

// Preload the two above-the-fold font files (D-180); the browser needs `crossOrigin` for font fetches.
export const links: Route.LinksFunction = () =>
  [newsreaderUrl, instrumentSansUrl].map((href) => ({
    rel: 'preload',
    href,
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  }))

export const middleware = [createRequestLogMiddleware(logger)]

export async function loader({ request }: Route.LoaderArgs) {
  const session = await loadSession(request)
  const notifications = session.viewer ? await loadNotifications(request) : null
  // The public origin, for canonical URLs (see `pageMeta`).
  return {
    ...session,
    notifications,
    origin: new URL(request.url).origin,
    // Null (no script, no cookies) unless VITE_ANALYTICS_DOMAIN is set (D-049).
    analytics: analyticsConfig(),
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Absent when the root loader itself failed, so the error page still renders as a Visitor.
  const session = useRouteLoaderData<typeof loader>('root')
  // The verify page spends the token in its own loader, so the root loader's view of it is stale there.
  const onVerifyPage = useLocation().pathname === '/verify-email'
  const viewer = session?.viewer ?? null
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppShell
          navSlot={<MainNav viewer={viewer} />}
          searchSlot={<SearchBox />}
          accountSlot={
            <>
              {viewer ? <NotificationBell notifications={session?.notifications ?? null} /> : null}
              <AccountMenu viewer={viewer} />
            </>
          }
          bannerSlot={
            viewer && !onVerifyPage ? <VerificationBanner verified={viewer.verified} /> : null
          }
        >
          {children}
        </AppShell>
        <Analytics config={session?.analytics ?? null} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  // One client per browser session; loaders handle first loads, Query only the updates after (PRD §8).
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

export function ErrorBoundary() {
  return <ErrorPage error={useRouteError()} />
}
