// Headless timeline screenshots of a running session.
// Usage: node shot.mjs <url-with-query> <out-prefix> <sec> [<sec> ...]
//   e.g. node shot.mjs 'http://localhost:5199/?auto=1' /tmp/mesa 3 6 12 30
import puppeteer from 'puppeteer-core'
const [,, url, out, ...secs] = process.argv
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
})
const logs = []
const page = await browser.newPage()
page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForSelector('body[data-ready]', { timeout: 60000 })
const t0 = Date.now()
// "<sec>:<key>" presses a key at that second, then shoots 0.35 s later.
for (const [i, arg] of secs.entries()) {
  const [s, key] = arg.split(':')
  const ms = Number(s) * 1000 - (Date.now() - t0)
  if (ms > 0) await new Promise((r) => setTimeout(r, ms))
  if (key) { await page.keyboard.press(key); await new Promise((r) => setTimeout(r, 350)) }
  const file = `${out}-${String(i).padStart(2, '0')}.png`
  await page.screenshot({ path: file })
  console.log(file, '@', s, 's')
}
console.log(logs.join('\n') || 'no console errors')
await browser.close()
