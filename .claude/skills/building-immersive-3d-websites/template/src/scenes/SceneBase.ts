import * as THREE from 'three'
import type { Assets } from '../core/Assets'
import type { QualityProfile } from '../core/Quality'

export type FrameState = {
  time: number        // seconds since start
  delta: number       // seconds since last frame (clamped)
  progress: number    // 0..1 progress of THIS scene's DOM section (sticky duration)
  pointer: THREE.Vector2 // -1..1, damped
  scrollVelocity: number
}

export type SceneContext = {
  assets: Assets
  quality: QualityProfile
}

/**
 * One chapter of the story. Owns its own THREE.Scene + camera so chapters can have
 * completely different looks, and only visible chapters cost GPU time.
 * Everything animated must be a pure function of `progress` (scrubbable, reversible)
 * plus optional ambient motion from `time`.
 */
export abstract class SceneBase {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera

  constructor(protected readonly ctx: SceneContext, fov = 35) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100)
  }

  /** Build meshes. Called once after assets load. */
  abstract init(): void | Promise<void>

  abstract update(state: FrameState): void

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    // Keep subjects framed on portrait screens: widen FOV instead of cropping.
    this.camera.fov = width < height ? 50 : 35
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      mats.forEach((m) => m.dispose())
    })
  }
}

/** Remap v from [a,b] to [0,1], clamped. The workhorse of scroll choreography. */
export const range = (v: number, a: number, b: number): number => Math.min(1, Math.max(0, (v - a) / (b - a)))
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  THREE.MathUtils.damp(current, target, lambda, dt)
