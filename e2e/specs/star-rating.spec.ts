import { expect, test } from '@playwright/test'

// jsdom has no layout, so the phone-width regression (M9-T09, D-186) is checked in a real browser.
// The markup reuses the classes `StarRating` and `RatingBreakdown` emit, placed on a page that
// loads the app's stylesheet; the fill is measured against the stars' own box.

test.use({ viewport: { width: 390, height: 800 } })

for (const [average, share] of [
  [3, 0.6],
  [3.5, 0.7],
] as const) {
  test(`a ${average.toFixed(1)} average fills ${share * 100}% of the stars at phone width`, async ({
    page,
  }) => {
    await page.goto('/about')
    const fillClass = `w-[${Math.round(share * 100)}%]`
    const stars = '★★★★★'
    const markup = `<div class="flex flex-col gap-1"><span role="img" id="stars" class="relative inline-block w-max text-base leading-none tracking-wider"><span aria-hidden="true">${stars}</span><span id="fill" aria-hidden="true" class="absolute top-0 left-0 overflow-hidden whitespace-nowrap ${fillClass}">${stars}</span></span><p class="text-sm">12 reviews</p></div>`
    const widths = (await page.evaluate(`(() => {
      const host = document.createElement('section')
      host.className = 'flex flex-col gap-4 sm:flex-row sm:gap-8'
      host.innerHTML = ${JSON.stringify(markup)}
      document.body.append(host)
      const width = (id) => document.getElementById(id).getBoundingClientRect().width
      return { box: width('stars'), fill: width('fill'), column: host.getBoundingClientRect().width }
    })()`)) as { box: number; fill: number; column: number }
    expect(widths.box).toBeLessThan(widths.column / 2)
    expect(widths.fill / widths.box).toBeCloseTo(share, 1)
  })
}
