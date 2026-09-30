import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";

/**
 * Wireframe "membrane" that ripples where the hand pierces it — the
 * equivalent of Santioni's red water, in grid style.
 *
 * Santioni pipeline (InteractiveWaterHeightmap.fs):
 *   1. the hand is rendered into a "HandInfo" RT that marks the band where
 *      it cuts the plane (fringe),
 *   2. a 2D wave sim (Hugo Elias) in ping-pong: x = current height,
 *      y = previous height; newH = (N+S+E+W)*0.5 - prev, *viscosity,
 *      + fringe as the source,
 *   3. the plane's shader reads the heightmap (here: displaces vertices
 *      and brightens the lines).
 */
const SIM_SIZE = 256;
export const MEMBRANE_SIZE = 3.2;

const HEIGHTMAP_FS = /* glsl */ `
uniform sampler2D tHand;
uniform float uViscosity;
void main() {
  vec2 cell = 1.0 / resolution.xy;
  vec2 uv = gl_FragCoord.xy * cell;
  vec4 h = texture2D(heightmap, uv);
  float n = texture2D(heightmap, uv + vec2(0.0, cell.y)).x;
  float s = texture2D(heightmap, uv - vec2(0.0, cell.y)).x;
  float e = texture2D(heightmap, uv + vec2(cell.x, 0.0)).x;
  float w = texture2D(heightmap, uv - vec2(cell.x, 0.0)).x;
  float next = ((n + s + e + w) * 0.5 - h.y) * uViscosity;
  next += texture2D(tHand, uv).r * 0.3;
  next = clamp(next, -2.0, 2.0);
  gl_FragColor = vec4(next, h.x, 0.0, 1.0);
}
`;

const MEMBRANE_VS = /* glsl */ `
uniform sampler2D tHeight;
uniform float uAmplitude;
varying vec2 vUv;
varying float vHeight;
void main() {
  vUv = uv;
  float h = texture2D(tHeight, uv).x;
  vHeight = h;
  vec3 p = position;
  p.z += h * uAmplitude;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const MEMBRANE_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uCells;
varying vec2 vUv;
varying float vHeight;
void main() {
  vec2 p = vUv * uCells;
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec2 c = vUv - 0.5;
  float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(c.x), abs(c.y)));
  float a = line * (0.28 + min(abs(vHeight) * 4.0, 1.5)) * edge;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export class Membrane {
  readonly mesh: THREE.Mesh;
  readonly handTarget: THREE.WebGLRenderTarget;
  /** Orthographic camera aligned with the plane: the HandInfo pass renders in plane space. */
  readonly infoCamera: THREE.OrthographicCamera;
  private readonly gpu: GPUComputationRenderer;
  private readonly height: Variable;
  private readonly material: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, z: number) {
    this.handTarget = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, { type: THREE.HalfFloatType });
    const half = MEMBRANE_SIZE / 2;
    this.infoCamera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 4);
    this.infoCamera.position.set(0, 0, z + 2);
    this.infoCamera.lookAt(0, 0, z);

    this.gpu = new GPUComputationRenderer(SIM_SIZE, SIM_SIZE, renderer);
    this.height = this.gpu.addVariable("heightmap", HEIGHTMAP_FS, this.gpu.createTexture());
    this.gpu.setVariableDependencies(this.height, [this.height]);
    Object.assign(this.height.material.uniforms, {
      tHand: { value: this.handTarget.texture },
      uViscosity: { value: 0.985 },
    });
    const error = this.gpu.init();
    if (error) throw new Error(error);

    this.material = new THREE.ShaderMaterial({
      vertexShader: MEMBRANE_VS,
      fragmentShader: MEMBRANE_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        tHeight: { value: null },
        uAmplitude: { value: 0.08 },
        uCells: { value: 48 },
        uColor: { value: new THREE.Color("#3fd0ff") },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(MEMBRANE_SIZE, MEMBRANE_SIZE, 128, 128), this.material);
    this.mesh.position.z = z;
  }

  /** Plane equation (world) for the hand shaders: n·p + d. */
  plane(target: THREE.Vector4): THREE.Vector4 {
    return target.set(0, 0, 1, -this.mesh.position.z);
  }

  update(): void {
    this.gpu.compute();
    this.material.uniforms.tHeight.value = this.gpu.getCurrentRenderTarget(this.height).texture;
  }
}
