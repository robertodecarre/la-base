import * as THREE from 'three'
import { SceneBase, type FrameState } from './SceneBase'

/** Chapter 4 — calm landing for the CTA. Low cost: a flat color so the DOM CTA owns attention. */
export class OutroScene extends SceneBase {
  init(): void {
    this.scene.background = new THREE.Color('#f3f1e9')
  }

  update(_state: FrameState): void {}
}
