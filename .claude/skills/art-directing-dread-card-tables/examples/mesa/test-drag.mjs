// Headless interaction test: grab a card, feint, pull back, then drop it on the zone.
// Usage: node test-drag.mjs <url> <out-prefix>
import puppeteer from 'puppeteer-core'
const [,, url, out] = process.argv
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
})
const page = await browser.newPage()
const logs = []
page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
await page.goto(url, { waitUntil: 'networkidle0' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const state = () => page.evaluate(() => window.__mesa.state())
const shot = async (name) => { await page.screenshot({ path: `${out}-${name}.png` }); console.log('shot', name, JSON.stringify(await state())) }
await page.waitForFunction(() => window.__mesa?.state().turn, { timeout: 90000, polling: 200 })
await sleep(400)
const c = await page.evaluate(() => window.__mesa.vmScreen(1))
await page.mouse.move(c.x, c.y)
await sleep(300)
await shot('0-hover')
await page.mouse.down()
let y = c.y
const moveBy = async (dy, dx = 0, steps = 20) => { for (let i = 0; i < steps; i++) { y += dy / steps; await page.mouse.move(c.x + dx, y); await sleep(16) } }
await moveBy(-120)                      // lift out of the hand
await shot('1-lift')
await moveBy(-260)                      // reach far (feint)
await shot('2-feint-reach')
await moveBy(250)                       // pull back
await shot('3-pulled-back')
for (let i = 0; i < 60 && !(await state()).overZone; i++) await moveBy(-12, 0, 2) // creep onto the zone
await sleep(150)
await shot('4-over-zone')
await page.mouse.up()
await sleep(450)
await shot('5-reveal')
await sleep(1200)
await shot('6-after')
console.log(logs.join('\n') || 'no console errors')
await browser.close()
