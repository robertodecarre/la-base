import './style.css'
import { detectQuality, hasWebGL2 } from './core/Quality'
import { Experience } from './core/Experience'
import { Scroll } from './core/Scroll'
import { revealHeadings } from './core/splitText'
import { HeroScene } from './scenes/HeroScene'
import { StoryScene } from './scenes/StoryScene'
import { ProductScene } from './scenes/ProductScene'
import { OutroScene } from './scenes/OutroScene'
import type { Manifest } from './core/Assets'

/**
 * Asset manifest. Keys are read by scenes via ctx.assets.models.get(key).
 * Missing files are logged and scenes fall back to procedural geometry.
 * Run `npm run optimize:models` to compress source GLBs (meshopt + KTX2).
 */
const MANIFEST: Manifest = {
  models: {
    // hero: '/models/hero.glb',
    // product: '/models/product.glb',
  },
}

const quality = detectQuality()
const fill = document.querySelector<HTMLElement>('.loader__fill')
const setProgress = (p: number): void => fill?.style.setProperty('--progress', String(p))
const finishLoading = (): void => document.body.classList.remove('is-loading')

async function boot(): Promise<void> {
  revealHeadings(quality.reducedMotion)

  if (!hasWebGL2()) {
    // Progressive enhancement: the DOM story is complete without GL.
    document.documentElement.classList.add('no-webgl')
    const scroll = new Scroll(quality.reducedMotion)
    const loop = (t: number): void => { scroll.raf(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    finishLoading()
    return
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#gl')!
  const experience = new Experience(canvas, quality, setProgress)
  await experience.init(MANIFEST, (ctx, renderer) => ({
    hero: new HeroScene(ctx),
    story: new StoryScene(ctx),
    product: new ProductScene(ctx, renderer),
    outro: new OutroScene(ctx),
  }))
  experience.start()
  setProgress(1)
  finishLoading()

  if (new URLSearchParams(location.search).has('debug')) {
    const { default: GUI } = await import('lil-gui')
    const gui = new GUI()
    gui.add(quality, 'tier').disable()
    gui.add({ dpr: experience.renderer.getPixelRatio() }, 'dpr').disable()
  }
}

boot().catch((err) => {
  console.error('[boot] failed, falling back to DOM-only', err)
  document.documentElement.classList.add('no-webgl')
  finishLoading()
})
