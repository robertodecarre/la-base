// Headless test: quick-click play, zoom to cursor (neighbour), stand-up peek (far half), yaw clamp.
// Usage: node test-view.mjs <base-url> <out-prefix>
import puppeteer from 'puppeteer-core'
const [,, base, out] = process.argv
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
})
const logs = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(q) {
  const page = await browser.newPage()
  page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
  await page.goto(`${base}?${q}`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => window.__mesa, { timeout: 60000 })
  return page
}
const st = (p) => p.evaluate(() => window.__mesa.state())
const shot = async (p, name) => { await p.screenshot({ path: `${out}-${name}.png` }); console.log(name, JSON.stringify(await st(p))) }

// yaw clamp
const p0 = await open('n=8&debug=1&yaw=3')
await sleep(800)
await shot(p0, 'a-yaw-clamped')
await p0.close()

const p = await open('n=4&debug=1')
await p.waitForFunction(() => window.__mesa.state().turn, { timeout: 90000, polling: 200 })
await sleep(400)
const c = await p.evaluate(() => window.__mesa.vmScreen(1))
await p.mouse.move(c.x, c.y)
await sleep(200)
await p.mouse.down(); await sleep(60); await p.mouse.up()   // quick click
await sleep(700)
await shot(p, 'b-quickclick-midplay')
await sleep(6500)                                          // let seats 1 and 2 play
await shot(p, 'c-table')
// zoom to cursor on the neighbour's card (seat 1)
let z = await p.evaluate(() => window.__mesa.zoneScreen(1))
await p.mouse.move(z.x, z.y)
await p.mouse.down({ button: 'right' }); await sleep(1100)
await shot(p, 'd-zoom-neighbour')
await p.mouse.up({ button: 'right' }); await sleep(900)
// stand-up peek at the opposite card (seat 2)
z = await p.evaluate(() => window.__mesa.zoneScreen(2))
await p.mouse.move(z.x, z.y)
await p.mouse.down({ button: 'right' }); await sleep(1400)
await shot(p, 'e-stand-far')
for (let i = 0; i < 15; i++) { await p.mouse.move(z.x + i * 8, z.y); await sleep(16) } // pan while standing
await sleep(400)
await shot(p, 'f-stand-pan')
await p.mouse.up({ button: 'right' }); await sleep(1300)
await shot(p, 'g-back-seated')
console.log(logs.join('\n') || 'no console errors')
await browser.close()
