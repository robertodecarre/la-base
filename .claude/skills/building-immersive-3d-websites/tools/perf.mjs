// Perf harness: per chapter, measure real fps (rAF over 2 s) and effective render scale
// (canvas backing pixels / CSS pixels / devicePixelRatio → 1.0 = native sharpness).
// Scenarios: gpu (hardware), weak (SwiftShader software GL), phone (DPR 3 + 4x CPU throttle + mobile UA).
import puppeteer from 'puppeteer-core'
const [,, url, scenario = 'gpu'] = process.argv
const args = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
if (scenario === 'weak') args.push('--disable-gpu', '--use-angle=swiftshader')
else args.push('--use-angle=vulkan', '--enable-gpu')
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args })
const page = await browser.newPage()
if (scenario === 'phone') {
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
  const cdp = await page.createCDPSession()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
} else {
  await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: scenario === 'weak' ? 1 : 2 })
}
await page.goto(url, { waitUntil: 'load', timeout: 300000 })
await page.waitForSelector('.loader.is-ready', { timeout: 300000 })
await page.click('[data-enter="silent"]')
await page.evaluate(() => document.querySelector('[data-demo]').click())
await new Promise((r) => setTimeout(r, 5000))
const rows = []
for (const [sel, p] of [['#noche', 0.5], ['#hidra', 0.6], ['#ojos', 0.85], ['#argos', 0.5], ['#real', 0.5], ['#real', 0.97]]) {
  await page.evaluate((sel, p) => { const s = document.querySelector(sel); window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p) }, sel, p)
  await new Promise((r) => setTimeout(r, 6000))           // let the governor settle
  const m = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now()
    const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else {
      const c = document.querySelector('#gl')
      res({ fps: Math.round(n / ((performance.now() - t0) / 1000)), scale: +(c.width / c.clientWidth / devicePixelRatio).toFixed(2), dpr: devicePixelRatio })
    } }
    requestAnimationFrame(f)
  }))
  rows.push(`${sel}@${p}`.padEnd(14) + ` fps=${String(m.fps).padStart(3)}  render-scale=${m.scale} (of native, dpr ${m.dpr})`)
}
console.log(`== ${scenario} ${url}\n` + rows.join('\n'))
await browser.close()
