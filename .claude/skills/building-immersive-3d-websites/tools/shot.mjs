// Headless QA screenshots of a WebGL scroll site (works when the visible Chrome window is occluded,
// which pauses rAF and makes extension screenshots time out / render black).
// Usage: node shot.mjs <url> <out-prefix> '#section:0.5' '#section:0.97' ...
// Needs: npm i puppeteer-core ; a local chromium. Adapt the "enter"/"skip gates" clicks to the site.
import puppeteer from 'puppeteer-core'
const [,, url, out, ...stops] = process.argv
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
const logs = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForSelector('.loader.is-ready', { timeout: 60000 })
await page.click('[data-enter="silent"]')
await page.evaluate(() => document.querySelector('[data-demo]').click())
await new Promise((r) => setTimeout(r, 4000))
for (const stop of stops) {
  const [sel, p] = stop.split(':')
  await page.evaluate((sel, p) => {
    const s = document.querySelector(sel)
    window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * Number(p))
  }, sel, p)
  await new Promise((r) => setTimeout(r, 3500))
  await page.screenshot({ path: `${out}-${sel.replace('#', '')}-${p}.png` })
}
console.log(logs.join('\n') || 'no console errors')
await browser.close()
