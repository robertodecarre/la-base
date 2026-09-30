import * as THREE from 'three'
import { SceneBase, range, easeInOut, type FrameState } from './SceneBase'
import { createInkMaterial } from '../materials/InkMaterial'

/**
 * Chapter 1 — the hook. A hero object in comic-ink style that reacts to the pointer
 * and turns away as the user scrolls. Swap the procedural mesh for a GLB:
 *   const gltf = this.ctx.assets.models.get('hero'); gltf.scene.traverse(m => m.material = ink)
 */
export class HeroScene extends SceneBase {
  private readonly ink = createInkMaterial({ color: '#c82924', displace: 0.03 })
  private readonly group = new THREE.Group()

  init(): void {
    this.scene.background = new THREE.Color('#f3f1e9')
    this.camera.position.set(0, 0, 8)

    const model = this.ctx.assets.models.get('hero')
    if (model) {
      model.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.ink
      })
      this.group.add(model.scene)
    } else {
      this.group.add(new THREE.Mesh(new THREE.TorusKnotGeometry(1.4, 0.45, 256, 48), this.ink))
    }

    // Ground "shadow" plate in the same ink language
    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 64),
      new THREE.MeshBasicMaterial({ color: '#121212', transparent: true, opacity: 0.12 }),
    )
    plate.rotation.x = -Math.PI / 2
    plate.position.y = -2.4
    this.scene.add(this.group, plate)
  }

  update({ time, progress, pointer }: FrameState): void {
    this.ink.uniforms.uTime.value = time
    const p = easeInOut(range(progress, 0, 1))
    this.group.rotation.y = time * 0.15 + pointer.x * 0.4 + p * Math.PI
    this.group.rotation.x = pointer.y * 0.25
    this.group.position.y = Math.sin(time * 0.8) * 0.1 - p * 1.5
    this.camera.position.z = 8 + p * 4
    // Rotate the light with the object so the terminator travels across it while scrolling
    this.ink.uniforms.uLightDir.value.set(-0.6 + p * 1.2, 0.6, 0.8).normalize()
  }
}
