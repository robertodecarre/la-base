import * as THREE from 'three'
import { gsap } from 'gsap'
import { Assets, type Manifest } from './Assets'
import { Scroll } from './Scroll'
import { Story } from './Story'
import { FpsGovernor, type QualityProfile } from './Quality'
import { Composite } from '../post/Composite'
import { PointerTrail } from '../fx/PointerTrail'
import type { SceneBase, SceneContext } from '../scenes/SceneBase'

const MAX_DELTA = 1 / 20 // clamp dt so tab-switches don't teleport animations

export type SceneFactory = (ctx: SceneContext, renderer: THREE.WebGLRenderer) => Record<string, SceneBase>

/**
 * Owns renderer, loop, scroll, pointer and the scene story.
 * Render order per frame: trail -> scene A (-> scene B if transitioning) -> composite to screen.
 */
export class Experience {
  readonly renderer: THREE.WebGLRenderer
  private readonly assets: Assets
  private readonly scroll: Scroll
  private readonly governor: FpsGovernor
  private story!: Story
  private composite!: Composite
  private trail!: PointerTrail
  private readonly pointer = new THREE.Vector2()
  private readonly pointerTarget = new THREE.Vector2()
  private readonly timer = new THREE.Timer()
  private running = false
  private visible = true

  constructor(
    canvas: HTMLCanvasElement,
    private readonly quality: QualityProfile,
    onProgress: (p: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA happens on the render targets instead
      powerPreference: 'high-performance',
      alpha: false,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.governor = new FpsGovernor(quality.maxDpr)
    this.assets = new Assets(this.renderer, onProgress)
    this.scroll = new Scroll(quality.reducedMotion)

    window.addEventListener('pointermove', (e) => {
      this.pointerTarget.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    }, { passive: true })
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden })
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.running = false
      document.documentElement.classList.add('no-webgl') // DOM content stays usable
    })
  }

  async init(manifest: Manifest, factory: SceneFactory): Promise<void> {
    await this.assets.load(manifest)
    const ctx: SceneContext = { assets: this.assets, quality: this.quality }
    this.story = new Story(factory(ctx, this.renderer))
    await Promise.all(this.story.scenes.map((s) => s.init()))

    this.trail = new PointerTrail(innerWidth, innerHeight)
    this.composite = new Composite(this.trail.texture, this.quality.tier === 2 ? 4 : 0)
    if (!this.quality.postFx || this.quality.reducedMotion) this.composite.material.uniforms.uTrailStrength.value = 0

    this.onResize()
    // Precompile every material now so the first scroll into a chapter doesn't hitch.
    this.story.scenes.forEach((s) => this.renderer.compile(s.scene, s.camera))
    document.fonts?.ready.then(() => this.story.measure())
  }

  start(): void {
    this.running = true
    gsap.ticker.add(this.tick)
  }

  private onResize = (): void => {
    const w = innerWidth
    const h = innerHeight
    this.renderer.setPixelRatio(this.governor.dpr)
    this.renderer.setSize(w, h, false)
    this.story?.measure()
    this.story?.scenes.forEach((s) => s.resize(w, h))
    this.composite?.resize(w, h, this.governor.dpr)
    this.trail?.resize(w, h)
  }

  private tick = (timeSec: number): void => {
    this.scroll.raf(timeSec * 1000)
    if (!this.running || !this.visible) return

    this.timer.update(timeSec * 1000)
    const delta = Math.min(this.timer.getDelta(), MAX_DELTA)
    const time = this.timer.getElapsed()
    if (this.governor.tick(delta * 1000)) this.onResize()

    this.pointer.x = THREE.MathUtils.damp(this.pointer.x, this.pointerTarget.x, 4, delta)
    this.pointer.y = THREE.MathUtils.damp(this.pointer.y, this.pointerTarget.y, 4, delta)

    const f = this.story.frame(this.scroll.y)
    const base = { time, delta, pointer: this.pointer, scrollVelocity: this.scroll.velocity }

    this.trail.update(this.renderer)
    this.composite.setTrail(this.trail.texture)

    f.current.update({ ...base, progress: f.progress })
    this.renderer.setRenderTarget(this.composite.targetA)
    this.renderer.render(f.current.scene, f.current.camera)

    if (f.next && f.mix > 0) {
      f.next.update({ ...base, progress: f.nextProgress })
      this.renderer.setRenderTarget(this.composite.targetB)
      this.renderer.render(f.next.scene, f.next.camera)
    }

    const u = this.composite.material.uniforms
    u.uMix.value = f.next ? f.mix : 0
    u.uTime.value = time
    u.uScroll.value = this.scroll.y / innerHeight
    this.composite.render(this.renderer)
  }

  dispose(): void {
    gsap.ticker.remove(this.tick)
    window.removeEventListener('resize', this.onResize)
    this.story.scenes.forEach((s) => s.dispose())
    this.composite.dispose()
    this.trail.dispose()
    this.renderer.dispose()
  }
}
