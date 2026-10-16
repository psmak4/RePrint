// Runs in the page (the e2e package has no DOM types): measures one page for
// specs/ui-consistency.spec.ts and returns what is off the scale (M11, D-214).
export function measureUi(frame) {
  return ((frame) => {
    const problems = []
    const sizes = {}
    const note = (kind, value) => {
      sizes[kind] ??= new Set()
      sizes[kind].add(value)
    }
    const phone = innerWidth < 768
    const px = (value) => Math.round(Number.parseFloat(value))
    const visible = (el) => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden'
    }
    const label = (el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
    const main = document.querySelector('main')
    const surface = 'rgb(255, 255, 255)'
    const isCard = (el) => {
      const style = getComputedStyle(el)
      return (
        style.backgroundColor === surface &&
        Number.parseFloat(style.borderTopWidth) > 0 &&
        style.borderTopStyle === 'solid' &&
        px(style.borderTopLeftRadius) >= 8 &&
        // A fully rounded box is a chip or an avatar, not a card.
        px(style.borderTopLeftRadius) < el.getBoundingClientRect().height / 2 - 1
      )
    }

    // Page title.
    const h1 = main.querySelector('h1')
    if (!h1) problems.push('no h1')
    else {
      const size = px(getComputedStyle(h1).fontSize)
      note('h1', `${size}px`)
      if (frame === 'band' && size !== (phone ? 32 : 44)) problems.push(`page title ${size}px`)
    }

    // The band starts with the trail from Discover.
    if (frame === 'band') {
      const trail = main.querySelector('nav[aria-label="Breadcrumb"]')
      const first = trail?.querySelector('a')
      if (!trail || first?.getAttribute('href') !== '/') problems.push('band without the trail')
      const band = trail?.parentElement
      if (band && getComputedStyle(band).backgroundColor !== 'rgb(243, 239, 232)') {
        problems.push('trail outside the band')
      }
    }

    // Section and card headings: every serif h2 is one of the two roles.
    const section = phone ? 26 : 32
    const cardTitle = phone ? 21 : 22
    for (const h2 of main.querySelectorAll('h2')) {
      const style = getComputedStyle(h2)
      if (!visible(h2) || !style.fontFamily.includes('Newsreader')) continue
      const size = px(style.fontSize)
      note(size === cardTitle ? 'card title' : 'section title', `${size}px`)
      if (size !== section && size !== cardTitle) problems.push(`heading ${size}px: ${label(h2)}`)
    }

    // Buttons and chips come from `Button` and `Chip` (marked `ui-button`, `ui-chip`); anything else
    // fully rounded and interactive is hand-built.
    const textSize = { 40: 14, 44: 15, 48: 16 }
    for (const el of document.querySelectorAll('.ui-chip')) {
      if (!visible(el)) continue
      const style = getComputedStyle(el)
      const height = Math.round(el.getBoundingClientRect().height)
      note('chip', `${height}/${px(style.fontSize)}/${style.fontWeight}`)
      if (height !== 34 || px(style.fontSize) !== 14)
        problems.push(`chip ${height}px: ${label(el)}`)
    }
    for (const el of document.querySelectorAll('.ui-button')) {
      if (!visible(el)) continue
      const style = getComputedStyle(el)
      const height = Math.round(el.getBoundingClientRect().height)
      note('button', `${height}/${px(style.fontSize)}`)
      // 36 and 44 round (icon sizes), 40 / 44 / 48 pills, and Discover's 60 px hero search.
      if (![36, 40, 44, 48, 60].includes(height)) problems.push(`button ${height}px: ${label(el)}`)
      const expectedText = textSize[height]
      if (expectedText && label(el) && px(style.fontSize) !== expectedText) {
        problems.push(`button ${height}px with ${px(style.fontSize)}px text: ${label(el)}`)
      }
    }
    for (const el of document.querySelectorAll('a, button, summary')) {
      if (!visible(el) || el.closest('.ui-button, .ui-chip')) continue
      const style = getComputedStyle(el)
      const height = el.getBoundingClientRect().height
      const pill = height >= 28 && px(style.borderTopLeftRadius) >= height / 2 - 1
      const drawn =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' || Number.parseFloat(style.borderTopWidth) > 0
      if (pill && drawn) problems.push(`hand-built pill: ${label(el)}`)
    }

    // Status badges and counts come from `Badge` and `CountBadge`; file pickers share one look.
    for (const el of document.querySelectorAll('.ui-badge')) {
      if (!visible(el)) continue
      const style = getComputedStyle(el)
      const height = Math.round(el.getBoundingClientRect().height)
      note('badge', `${height}/${px(style.fontSize)}`)
      if (px(style.fontSize) !== 12 || (height !== 24 && style.whiteSpace === 'nowrap')) {
        problems.push(`badge ${height}px: ${label(el)}`)
      }
    }
    for (const el of document.querySelectorAll('.ui-count')) {
      if (!visible(el)) continue
      const height = Math.round(el.getBoundingClientRect().height)
      note('count', `${height}/${px(getComputedStyle(el).fontSize)}`)
      if (height !== 22) problems.push(`count ${height}px: ${label(el)}`)
    }
    for (const el of main.querySelectorAll('input[type="file"]')) {
      if (visible(el) && !el.classList.contains('ui-file'))
        problems.push('file picker without the shared look')
    }

    // Dropdowns.
    for (const select of main.querySelectorAll('select')) {
      if (!visible(select) || getComputedStyle(select).opacity === '0') continue
      const height = Math.round(select.getBoundingClientRect().height)
      const size = px(getComputedStyle(select).fontSize)
      note('select', `${height}/${size}`)
      if (!((height === 40 && size === 14) || (height === 44 && size === 15))) {
        problems.push(`select ${height}px with ${size}px text`)
      }
    }

    // Cards.
    for (const el of main.querySelectorAll('div, section, article, aside, li, form')) {
      if (!visible(el) || !isCard(el)) continue
      const radius = px(getComputedStyle(el).borderTopLeftRadius)
      note('card corner', `${radius}px`)
      if (radius !== 16 && !(frame === 'auth' && radius === 24))
        problems.push(`card corner ${radius}px`)
    }

    // The tab title, and no sideways scroll.
    if (frame !== 'hero' && !document.title.endsWith(' | RePrint')) {
      problems.push(`tab title "${document.title}"`)
    }
    if (document.documentElement.scrollWidth > innerWidth) problems.push('scrolls sideways')

    return {
      path: location.pathname,
      problems,
      sizes: Object.fromEntries(
        Object.entries(sizes).map(([kind, set]) => [kind, [...set].sort()]),
      ),
    }
  })(frame)
}
