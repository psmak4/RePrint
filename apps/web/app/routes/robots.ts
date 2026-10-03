import { renderRobots } from '../lib/sitemap.js'
import type { Route } from './+types/robots'

/** Resource route: `robots.txt` keeps crawlers out of admin and settings and points at the sitemap. */
export function loader({ request }: Route.LoaderArgs) {
  return new Response(renderRobots(new URL(request.url).origin), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
