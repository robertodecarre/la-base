// Headless captures of the 3D table simulator (?mesa3d=sim), piece 1a.
// Port of the skill's examples/mesa/shot.mjs + test-view.mjs to the repo's Playwright (the originals
// use puppeteer-core with a Linux chromium path). Plays the local seat by short clicks through the
// real input path, and checks that cargarEstado mid-hand redraws the table identically.
//
// Usage: npm run build && npx vite preview --port 5199   (in another shell; raw captures use the
//        debug freeze + raw toggle on the SAME frame; a plain ?raw=1 URL also works there, the dev server rejects
//        ?raw=1 because Vite reads it as its own raw-import suffix)
//        node scripts/mesa3d-shot.mjs [http://localhost:5199] [screenshots/mesa3d] [name-suffix]
// Uses Chromium's new headless mode with ANGLE/D3D11 (real GPU, ~60 fps). SwiftShader gives ~6 fps,
// which breaks the timing of clicks and captures; ANGLE/GL hangs on this machine.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:5199'
const out = process.argv[3] ?? 'screenshots/mesa3d'
const suffix = process.argv[4] ?? '' // e.g. -fix
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const logs = []

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})

async function open(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${q}] ${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`[${q}] pageerror: ${e.message}`))
  await page.goto(`${base}/?mesa3d=sim&debug=1&${q}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__mesa3d && document.querySelector('[data-mesa3d-ready]'), null, { timeout: 60000 })
  return page
}
const st = (p) => p.evaluate(() => window.__mesa3d.state())
async function shot(p, name) {
  const file = `${out}/${name}${suffix}.png`
  await p.screenshot({ path: file })
  console.log(file, JSON.stringify(await st(p)))
  return file
}
// Poll until cond(state) is true; while waiting, play my own turn with a short click on a card.
async function until(p, cond, { timeout = 120000, play = true } = {}) {
  const t0 = Date.now()
  for (;;) {
    const s = await st(p)
    if (cond(s)) return s
    if (play && s.myTurn && !s.busy && s.hand > 0) await clickCard(p, Math.floor(s.hand / 2))
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting; last state ${JSON.stringify(s)}`)
    await sleep(120)
  }
}
async function clickCard(p, k) {
  const c = await p.evaluate((k) => window.__mesa3d.vmScreen(k), k)
  await p.mouse.move(c.x, c.y)
  await sleep(150)
  await p.mouse.down()
  await sleep(60)
  await p.mouse.up()
  await sleep(200)
}
const totalPiles = (s) => s.piles.reduce((a, [, n]) => a + n, 0)

// 1–5: 4 players, hand of 3 then hand of 5
const p = await open('n=4')
await until(p, (s) => s.hand === 3 && s.turn !== null, { play: false })
await sleep(300)
await p.evaluate(() => window.__mesa3d.freeze(true))
await sleep(150)
await shot(p, '01-n4-mano3-inicio')
await p.evaluate(() => window.__mesa3d.setRaw(true))
await sleep(150)
await shot(p, '08-raw-n4-mano3-inicio') // same frame as 01, no post
await p.evaluate(() => { window.__mesa3d.setRaw(false); window.__mesa3d.freeze(false) })
// mid-flight: my own quick-click play, 0.7 s into the gesture
await until(p, (s) => s.myTurn && !s.busy, { play: false })
await clickCard(p, 1)
await sleep(550) // reach phase: the card glides over the felt in my right hand
await shot(p, '02-carta-en-vuelo')
if (!(await st(p)).localPlay && (await st(p)).hand === 3) throw new Error('the short click did not start a play')
// a remote card mid-flight (seat 3 plays right after me)
await until(p, (s) => s.playing === 1 && s.turn === null && !s.localPlay && s.base === 3, { play: false })
await sleep(820) // reach phase: the card glides face-down, low over the felt
await shot(p, '02b-carta-remota-en-vuelo')
await until(p, (s) => s.base === 4 && s.baseRevealed === 4)
await until(p, (s) => s.playing === 0, { play: false }) // last card finished its flip, before the collect
await shot(p, '03-base-completa')
await until(p, (s) => s.base === 0 && totalPiles(s) === 1)
await sleep(400)
await shot(p, '04-despues-collect-pila')

// reconnection: at a quiet moment (my turn, piles on the table), redraw from the snapshot
await until(p, (s) => s.myTurn && !s.busy && totalPiles(s) >= 1, { play: false })
await sleep(300)
const before = await p.evaluate(() => window.__mesa3d.dump())
await shot(p, '07a-antes-de-reconectar')
await p.keyboard.press('r')
await sleep(700)
const after = await p.evaluate(() => window.__mesa3d.dump())
await shot(p, '07b-despues-de-reconectar')
const same = JSON.stringify(before) === JSON.stringify(after)
console.log('reconnection identical:', same, `(${before.cards.length} cards, vm "${before.vm}", fans ${before.fans}, counters ${before.counters})`)
if (!same) {
  const a = new Set(before.cards), b = new Set(after.cards)
  console.log('  only before:', before.cards.filter((x) => !b.has(x)).slice(0, 8))
  console.log('  only after :', after.cards.filter((x) => !a.has(x)).slice(0, 8))
  for (const k of ['faces', 'vm', 'fans', 'counters', 'turn']) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) console.log(`  ${k}:`, before[k], '→', after[k])
}

await until(p, (s) => s.hand === 5 && s.turn !== null, { timeout: 240000 })
await sleep(300)
await shot(p, '05-mano-de-5')
await p.close()

// 6: 8 players, two decks, hand of 10
const p8 = await open('n=8&manos=10')
await until(p8, (s) => s.hand === 10 && s.turn !== null, { play: false, timeout: 180000 })
await sleep(300)
await shot(p8, '06-n8-mano10')
const k = await p8.evaluate(() => window.__mesa3d.vmScreen(9))
await p8.mouse.move(k.x, k.y) // hover lifts the card: indices of the whole fan at a glance
await sleep(500)
await shot(p8, '06b-n8-mano10-hover')
await p8.close()

// 02c: my card being dragged by my own arm (hold on a card, push forward; released off the zone)
const pd = await open('n=4')
await until(pd, (s) => s.hand === 3 && s.turn !== null, { play: false })
const dc = await pd.evaluate(() => window.__mesa3d.vmScreen(1))
await pd.mouse.move(dc.x, dc.y); await sleep(200)
await pd.mouse.down(); await sleep(300)
for (let i = 0; i < 40; i++) { await pd.mouse.move(dc.x + i * 2, dc.y - i * 14); await sleep(30) } // out over the felt
await sleep(250)
await shot(pd, '02c-carta-arrastrada')
await pd.mouse.up(); await sleep(600)
await pd.close()

console.log(logs.join('\n') || 'no console errors')
await browser.close()
process.exit(same ? 0 : 1)
