import type { SceneBase } from '../scenes/SceneBase'

type Chapter = { el: HTMLElement; scene: SceneBase; top: number; height: number }

export type StoryFrame = {
  current: SceneBase
  next: SceneBase | null
  progress: number      // progress of `current` (0..1 while its sticky content is pinned)
  nextProgress: number  // progress of `next` (usually 0 during the transition)
  mix: number           // 0..1 transition current -> next
}

/**
 * Maps DOM sections ([data-scene]) to GL scenes and turns scrollY into
 * (current, next, progress, mix). DOM defines length; GL just reads numbers.
 *
 * Timeline for chapter i with DOM section [top, top+height]:
 *   scrollY in [top, top+height-vh]      -> sticky content pinned, progress 0..1
 *   scrollY in [top+height-vh, top+height] -> next section slides in, mix 0..1
 */
export class Story {
  private chapters: Chapter[] = []

  constructor(registry: Record<string, SceneBase>) {
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => {
      const scene = registry[el.dataset.scene!]
      if (!scene) {
        console.warn(`[story] no GL scene registered for data-scene="${el.dataset.scene}"`)
        return
      }
      const vh = Number(el.dataset.height ?? 1)
      el.style.height = `${vh * 100}svh`
      this.chapters.push({ el, scene, top: 0, height: 0 })
    })
    this.measure()
  }

  get scenes(): SceneBase[] {
    return this.chapters.map((c) => c.scene)
  }

  /** Call on resize and after fonts/images load (layout shifts change offsets). */
  measure(): void {
    const scrollY = window.scrollY
    this.chapters.forEach((c) => {
      const r = c.el.getBoundingClientRect()
      c.top = r.top + scrollY
      c.height = r.height
    })
  }

  frame(scrollY: number): StoryFrame {
    const vh = window.innerHeight
    const last = this.chapters.length - 1
    let i = this.chapters.findIndex((c) => scrollY < c.top + c.height)
    if (i === -1) i = last
    const c = this.chapters[i]
    const pinnedLength = Math.max(1, c.height - vh)
    const progress = clamp01((scrollY - c.top) / pinnedLength)
    const next = i < last ? this.chapters[i + 1] : null
    const mix = next ? clamp01((scrollY - (c.top + c.height - vh)) / vh) : 0
    return { current: c.scene, next: next?.scene ?? null, progress, nextProgress: 0, mix }
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
