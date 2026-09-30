/**
 * Device capability tiers + runtime adaptive DPR.
 * Tier decides static budgets (DPR cap, particle counts, post FX);
 * the FPS governor lowers DPR at runtime if frames drop.
 */
export type Tier = 0 | 1 | 2 // 0 = low (old mobile), 1 = mid, 2 = high (desktop GPU)

export interface QualityProfile {
  tier: Tier
  isMobile: boolean
  reducedMotion: boolean
  maxDpr: number
  particleCount: number
  postFx: boolean
}

const LOW_CORES = 4
const LOW_MEMORY_GB = 4

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

export function detectQuality(): QualityProfile {
  const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8

  let tier: Tier = 2
  if (isMobile) tier = 1
  if (cores <= LOW_CORES && memory <= LOW_MEMORY_GB) tier = 0

  const forced = new URLSearchParams(location.search).get('tier')
  if (forced === '0' || forced === '1' || forced === '2') tier = Number(forced) as Tier

  return {
    tier,
    isMobile,
    reducedMotion,
    maxDpr: [1, 1.5, 2][tier],
    particleCount: [2_000, 8_000, 30_000][tier],
    postFx: tier > 0,
  }
}

/** Drops DPR in steps when the rolling average frame time exceeds budget; raises it back when there is headroom. */
export class FpsGovernor {
  private samples: number[] = []
  private cooldown = 0
  dpr: number

  constructor(private readonly maxDpr: number, private readonly minDpr = 0.75) {
    this.dpr = Math.min(window.devicePixelRatio, maxDpr)
  }

  /** Returns true when DPR changed and the renderer must be resized. */
  tick(dtMs: number): boolean {
    this.samples.push(dtMs)
    if (this.samples.length < 60) return false
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    this.samples = []
    if (this.cooldown-- > 0) return false

    const target = Math.min(window.devicePixelRatio, this.maxDpr)
    let next = this.dpr
    if (avg > 22 && this.dpr > this.minDpr) next = Math.max(this.minDpr, this.dpr - 0.25)
    else if (avg < 14 && this.dpr < target) next = Math.min(target, this.dpr + 0.25)
    if (next === this.dpr) return false
    this.dpr = next
    this.cooldown = 3
    return true
  }
}
