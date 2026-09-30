import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { SceneBase, range, easeInOut, type FrameState } from './SceneBase'

/**
 * Chapter 3 — the product. Realistic PBR (glass + liquid) lit by a PMREM environment,
 * contrasting with the stylized chapters. Scroll rotates it into a hero pose;
 * the pointer tilts it. Replace the lathe bottle with the client's GLB.
 */
export class ProductScene extends SceneBase {
  private readonly group = new THREE.Group()
  private pmrem?: THREE.PMREMGenerator

  constructor(ctx: ConstructorParameters<typeof SceneBase>[0], private readonly renderer: THREE.WebGLRenderer) {
    super(ctx)
  }

  init(): void {
    this.scene.background = new THREE.Color('#121212')
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.camera.position.set(0, 0.3, 7)

    const model = this.ctx.assets.models.get('product')
    if (model) {
      this.group.add(model.scene)
    } else {
      this.group.add(this.buildBottle())
    }

    const key = new THREE.SpotLight('#ffffff', 60, 20, Math.PI / 6, 0.5)
    key.position.set(3, 5, 4)
    const rim = new THREE.PointLight('#c82924', 25, 10)
    rim.position.set(-3, 1, -2)
    this.scene.add(this.group, key, rim)
  }

  private buildBottle(): THREE.Group {
    const profile = [
      [0, -1.6], [0.75, -1.6], [0.8, -1.5], [0.8, 0.4], [0.7, 0.8], [0.3, 1.1], [0.28, 1.7], [0.32, 1.75], [0, 1.75],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', transmission: 1, thickness: 0.6, roughness: 0.05, ior: 1.5,
      clearcoat: 1, attenuationColor: new THREE.Color('#ffe9d6'), attenuationDistance: 2,
    })
    const liquid = new THREE.MeshPhysicalMaterial({
      color: '#c82924', transmission: 0.6, thickness: 1.2, roughness: 0.15, ior: 1.33,
    })
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), glass)
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.8, 64), liquid)
    fill.position.y = -0.65
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.35, 48),
      new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.9, roughness: 0.3 }),
    )
    cap.position.y = 1.9
    return new THREE.Group().add(fill, bottle, cap)
  }

  update({ time, progress, pointer }: FrameState): void {
    const p = easeInOut(range(progress, 0, 0.8))
    this.group.rotation.y = -Math.PI * 0.75 + p * Math.PI * 0.75 + pointer.x * 0.3 + Math.sin(time * 0.5) * 0.05
    this.group.rotation.z = pointer.x * -0.05
    this.group.rotation.x = pointer.y * 0.1
    this.group.position.y = -0.5 + p * 0.5
    this.camera.position.z = 9 - p * 2
  }

  dispose(): void {
    super.dispose()
    this.scene.environment?.dispose()
    this.pmrem?.dispose()
  }
}
