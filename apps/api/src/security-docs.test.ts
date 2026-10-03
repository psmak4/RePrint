import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
// A proof is written as `path/to/file.test.ts` "start of an it(...) title".
const PROOF = /`([^`\s]+\.test\.tsx?)`\s+"([^"]+)"/g

/** Keeps docs/security/asvs-l2.md honest: every test it cites must still exist. */
describe('docs/security/asvs-l2.md', () => {
  it('cites tests that exist', async () => {
    const doc = await readFile(`${REPO_ROOT}docs/security/asvs-l2.md`, 'utf8')
    const proofs = [...doc.matchAll(PROOF)]
    expect(proofs.length).toBeGreaterThan(30)
    const missing: string[] = []
    for (const [, file, title] of proofs) {
      if (!file || !title) continue
      const source = await readFile(`${REPO_ROOT}${file}`, 'utf8').catch(() => null)
      if (source === null) missing.push(`${file} (file not found)`)
      else if (!source.includes(title)) missing.push(`${file} "${title}"`)
    }
    expect(missing).toEqual([])
  })
})
