import * as THREE from 'three'
import fragmentShader from './composite.frag'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

/** Full-screen composite pass. Scenes render into A/B targets; this mixes and finishes them. */
export class Composite {
  readonly targetA: THREE.WebGLRenderTarget
  readonly targetB: THREE.WebGLRenderTarget
  readonly material: THREE.ShaderMaterial
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(trail: THREE.Texture, samples: number) {
    const opts = { type: THREE.HalfFloatType, samples }
    this.targetA = new THREE.WebGLRenderTarget(1, 1, opts)
    this.targetB = new THREE.WebGLRenderTarget(1, 1, opts)
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms: {
        tA: { value: this.targetA.texture },
        tB: { value: this.targetB.texture },
        tTrail: { value: trail },
        uMix: { value: 0 },
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uGrain: { value: 0.35 },
        uTrailStrength: { value: 1 },
        uWipeColor: { value: new THREE.Color('#121212') },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material))
  }

  setTrail(texture: THREE.Texture): void {
    this.material.uniforms.tTrail.value = texture
  }

  resize(width: number, height: number, dpr: number): void {
    const w = Math.floor(width * dpr)
    const h = Math.floor(height * dpr)
    this.targetA.setSize(w, h)
    this.targetB.setSize(w, h)
    this.material.uniforms.uResolution.value.set(w, h)
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(null)
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.targetA.dispose()
    this.targetB.dispose()
    this.material.dispose()
  }
}
