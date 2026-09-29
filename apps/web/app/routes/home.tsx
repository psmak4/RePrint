import { APP_NAME } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { copy } from '../copy/index.js'

export function meta() {
  return [{ title: `${APP_NAME}: ${copy.home.title}` }]
}

export default function Home() {
  return (
    <section className="mx-auto max-w-2xl py-16">
      <h1 className="text-4xl font-semibold">{copy.home.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{copy.home.lead}</p>
      <Button className="mt-8">{copy.home.cta}</Button>
    </section>
  )
}
