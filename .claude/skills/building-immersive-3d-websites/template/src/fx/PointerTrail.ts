import * as THREE from 'three'

/**
 * "Fluid-lite" pointer trail: a ping-pong render target at 1/4 resolution.
 * Each frame the previous state is advected by its own velocity and faded,
 * then a soft splat is stamped at the pointer carrying the pointer velocity.
 *   R = intensity (mask), GB = velocity (-1..1 remapped).
 * Sampled by the composite shader to distort / reveal / tint the image,
 * the same role Active Theory's mouse fluid plays on santionispirits.com.
 * For a real Navier-Stokes sim, see references/shader-recipes.md (fluid section).
 */
const FRAG = /* glsl */ `
uniform sampler2D tPrev;
uniform vec2 uPointer;     // 0..1
uniform vec2 uVelocity;    // uv units / frame
uniform float uAspect;
uniform float uRadius;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec4 prev = texture2D(tPrev, vUv);
  vec2 vel = prev.gb * 2.0 - 1.0;
  // self-advection: sample upstream so the trail flows in the direction of motion
  vec4 advected = texture2D(tPrev, vUv - vel * 0.01);
  float intensity = advected.r * uDissipation;
  vec2 v = (advected.gb * 2.0 - 1.0) * uDissipation;

  vec2 d = vUv - uPointer;
  d.x *= uAspect;
  float splat = exp(-dot(d, d) / uRadius) * clamp(length(uVelocity) * 40.0, 0.0, 1.0);
  intensity = clamp(intensity + splat, 0.0, 1.0);
  v = clamp(v + uVelocity * splat * 20.0, -1.0, 1.0);

  gl_FragColor = vec4(intensity, v * 0.5 + 0.5, 1.0);
}`

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

export class PointerTrail {
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private readonly material: THREE.ShaderMaterial
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly pointer = new THREE.Vector2(0.5, 0.5)
  private readonly last = new THREE.Vector2(0.5, 0.5)

  constructor(width: number, height: number) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.targets = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)]
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tPrev: { value: null },
        uPointer: { value: this.pointer },
        uVelocity: { value: new THREE.Vector2() },
        uAspect: { value: width / height },
        uRadius: { value: 0.0025 },
        uDissipation: { value: 0.96 },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material))
    this.resize(width, height)
    window.addEventListener('pointermove', this.onMove, { passive: true })
  }

  get texture(): THREE.Texture {
    return this.targets[0].texture
  }

  private onMove = (e: PointerEvent): void => {
    this.pointer.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight)
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 4))
    const h = Math.max(1, Math.round(height / 4))
    this.targets.forEach((t) => t.setSize(w, h))
    this.material.uniforms.uAspect.value = width / height
  }

  update(renderer: THREE.WebGLRenderer): void {
    const vel = this.material.uniforms.uVelocity.value as THREE.Vector2
    vel.subVectors(this.pointer, this.last)
    this.last.copy(this.pointer)

    this.material.uniforms.tPrev.value = this.targets[0].texture
    renderer.setRenderTarget(this.targets[1])
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
    this.targets.reverse()
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove)
    this.targets.forEach((t) => t.dispose())
    this.material.dispose()
  }
}
