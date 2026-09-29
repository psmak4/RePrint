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
import { VerificationBanner } from './components/auth/verification-banner.js'
import { ErrorPage } from './components/error-page.js'
import { AccountMenu } from './components/shell/account-menu.js'
import { AppShell } from './components/shell/app-shell.js'
import { loadSession } from './lib/auth.server.js'
import { logger } from './lib/logger.server.js'
import { createRequestLogMiddleware } from './lib/request-log.server.js'
import './app.css'

export const middleware = [createRequestLogMiddleware(logger)]

export async function loader({ request }: Route.LoaderArgs) {
  return loadSession(request)
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
          accountSlot={<AccountMenu viewer={viewer} />}
          bannerSlot={
            viewer && !onVerifyPage ? <VerificationBanner verified={viewer.verified} /> : null
          }
        >
          {children}
        </AppShell>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  return <ErrorPage error={useRouteError()} />
}
