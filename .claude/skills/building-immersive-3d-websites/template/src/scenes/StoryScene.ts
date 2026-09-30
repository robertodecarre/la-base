import * as THREE from 'three'
import { SceneBase, easeInOut, type FrameState } from './SceneBase'
import { createInkMaterial } from '../materials/InkMaterial'

const MIN_ROCKS = 240

/**
 * Chapter 2 — the journey. The camera flies along a CatmullRom path through a tunnel of
 * instanced ink rocks. Rocks AHEAD of the camera rise from below and lock into place as the
 * camera approaches, so there is always something assembling in frame.
 * One InstancedMesh = one draw call for hundreds of objects.
 */
export class StoryScene extends SceneBase {
  private readonly ink = createInkMaterial({ color: '#8a6d3b', highlight: '#f3f1e9', lineFreq: 14 })
  private mesh!: THREE.InstancedMesh
  private readonly path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 20),
    new THREE.Vector3(4, 1, 8),
    new THREE.Vector3(-3, -1, -4),
    new THREE.Vector3(2, 0.5, -16),
    new THREE.Vector3(0, 0, -28),
  ])
  private readonly lookTarget = new THREE.Vector3()
  private readonly rocks: { t: number; home: THREE.Vector3; from: THREE.Vector3; scale: number; spin: number }[] = []
  private readonly dummy = new THREE.Object3D()

  init(): void {
    this.scene.background = new THREE.Color('#e9e3d3')
    const count = Math.max(MIN_ROCKS, Math.round(this.ctx.quality.particleCount / 20))
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), this.ink, count)

    const tangent = new THREE.Vector3()
    const side = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < count; i++) {
      const t = Math.random()
      const onPath = this.path.getPointAt(t)
      this.path.getTangentAt(t, tangent)
      side.crossVectors(tangent, up).normalize()
      // place on a ring around the path, leaving the center free for the camera
      const angle = Math.random() * Math.PI * 2
      const radius = 2.5 + Math.random() * 4
      const home = onPath.clone()
        .addScaledVector(side, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius * 0.6)
      const from = home.clone().add(new THREE.Vector3(0, -8 - Math.random() * 6, 0))
      this.rocks.push({ t, home, from, scale: 0.4 + Math.random() * 1.4, spin: Math.random() * 6 })
    }
    this.scene.add(this.mesh)
  }

  update({ time, progress }: FrameState): void {
    this.ink.uniforms.uTime.value = time
    const camT = Math.min(easeInOut(progress) * 0.9, 0.9)
    this.path.getPointAt(camT, this.camera.position)
    this.path.getPointAt(Math.min(camT + 0.06, 1), this.lookTarget)
    this.camera.lookAt(this.lookTarget)

    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i]
      // assemble while the rock is 25%..5% of the path ahead of the camera
      const ahead = r.t - camT
      const land = 1 - THREE.MathUtils.smoothstep(ahead, 0.05, 0.25)
      const k = easeInOut(land)
      this.dummy.position.lerpVectors(r.from, r.home, k)
      this.dummy.rotation.set(r.spin + (1 - k) * 3 + time * 0.1, r.spin, 0)
      this.dummy.scale.setScalar(r.scale * (0.2 + 0.8 * k))
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
