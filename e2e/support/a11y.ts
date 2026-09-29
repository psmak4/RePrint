import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const BLOCKING_IMPACTS = ['serious', 'critical']

/** Fails when axe finds serious or critical issues on the current page (PRD §12: zero allowed). */
export async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((violation) => violation.impact && BLOCKING_IMPACTS.includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }))
  expect(blocking, 'serious or critical axe violations').toEqual([])
}
