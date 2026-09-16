/**
 * Run axe against the app, both empty and with a photo loaded.
 *
 * Most of the controls only mount once an image exists, so the second pass
 * feeds a generated PNG through the file input to reach them.
 */
import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { chromium, type Page } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/'

const PHOTO = process.argv[3] ?? 'scripts/fixtures/room.png'

const scan = async (page: Page, label: string) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  console.log(`\n=== ${label}: ${violations.length} violation(s) ===`)
  for (const v of violations) {
    console.log(`\n[${v.impact}] ${v.id} — ${v.help}`)
    for (const node of v.nodes.slice(0, 4)) {
      console.log(`  ${node.target.join(' ')}`)
      const detail = [...node.any, ...node.all].map((c) => c.message).join('; ')
      if (detail) console.log(`    ${detail}`)
    }
    if (v.nodes.length > 4) console.log(`  …and ${v.nodes.length - 4} more`)
  }
  return violations.length
}

const run = async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  console.log(`Loading ${URL}`)
  await page.goto(URL, { waitUntil: 'networkidle' })

  let total = await scan(page, 'Landing (no photo)')

  console.log('\nLoading a photo to reach the editor controls…')
  await page.setInputFiles('input[type="file"]', {
    name: 'room.png',
    mimeType: 'image/png',
    buffer: readFileSync(PHOTO),
  })
  await page.waitForSelector('canvas', { timeout: 10000 })
  await page.waitForTimeout(500)

  total += await scan(page, 'Editor (photo loaded)')

  // Results and the preview dialog only exist after a generate, so axe never
  // reaches them from the editor state alone.
  console.log('\nSelecting a wall and generating variants…')
  const canvas = page.locator('canvas').first()
  await canvas.click({ position: { x: 40, y: 40 } })
  // The colour list starts empty, so Generate stays disabled until one is added.
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: /^Generate/ }).click()
  await page.waitForSelector('figure canvas', { timeout: 15000 })
  total += await scan(page, 'Results grid')

  await page.locator('figure button').first().click()
  await page.waitForSelector('dialog[open]', { timeout: 5000 })
  total += await scan(page, 'Enlarged preview dialog')

  await browser.close()
  console.log(`\nTotal: ${total} violation(s)`)
  process.exit(total > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(2)
})
