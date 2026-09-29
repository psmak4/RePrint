import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from 'react-router'
import { ErrorPage } from './components/error-page.js'
import { AppShell } from './components/shell/app-shell.js'
import './app.css'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppShell>{children}</AppShell>
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
