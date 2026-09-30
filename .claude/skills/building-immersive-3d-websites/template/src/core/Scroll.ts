import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Smooth scroll (Lenis) driven by the GSAP ticker so Lenis, ScrollTrigger
 * and the WebGL render all advance in the SAME frame (no jitter between DOM and GL).
 */
export class Scroll {
  readonly lenis: Lenis
  y = 0
  velocity = 0

  constructor(reducedMotion: boolean) {
    this.lenis = new Lenis({
      autoRaf: false,
      lerp: reducedMotion ? 1 : 0.1,
      smoothWheel: !reducedMotion,
      syncTouch: false, // native touch scroll on mobile feels better and avoids iOS bugs
    })
    this.lenis.on('scroll', (l: Lenis) => {
      this.y = l.scroll
      this.velocity = l.velocity
      ScrollTrigger.update()
    })
    gsap.ticker.lagSmoothing(0)

    // Anchor links go through Lenis so they animate and stay in sync
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href')!)
        if (!target) return
        e.preventDefault()
        this.lenis.scrollTo(target as HTMLElement)
      })
    })
  }

  raf(timeMs: number): void {
    this.lenis.raf(timeMs)
  }

  stop(): void {
    this.lenis.stop()
  }

  start(): void {
    this.lenis.start()
  }
}
