import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createInkMaterial } from '../materials/InkMaterial'
import { INK, NIGHT, PAPER } from '../materials/palette'
import { contactShadow } from './soc'
import { TypingDriver, type Finger, type Side } from './typing'

/**
 * The blue-team analyst as a detailed 3D figure (MakeHuman/MPFB2 body + CC0/CC-BY clothes, posed
 * with IK so the fingertips rest on the home row — see tools/build_analyst.py) rendered in the
 * comic's ink: per-part hatching + an inverted-hull outline. Animated procedurally: touch typing
 * (see typing.ts), breathing, glances between monitors. Can dissolve in ink when the camera
 * pushes through it.
 */

const LIGHT = new THREE.Vector3(-0.55, 0.55, 0.45)
const FOG = { color: NIGHT, near: 3.5, far: 9 }
const OUTLINE = 0.0035 // metres

const ink = (color: string, highlight: string, lineFreq: number): THREE.ShaderMaterial =>
  createInkMaterial({ color, highlight, lineFreq, lightDir: LIGHT, fog: FOG })

/** Node name (from the Blender export) → ink tone. */
function inkFor(): Record<string, THREE.ShaderMaterial> {
  const fabric = ink('#3d3a35', '#a39d90', 55)
  const dark = ink('#1d1b19', '#57534c', 90)
  const skin = ink('#a89c8b', PAPER.getStyle(), 70)
  const parts = {
    Skin: skin,
    Hair: dark,
    Brows: dark,
    Lashes: dark,
    Hood: fabric,
    Hoodie: fabric,
    Jeans: ink('#34322e', '#8d897f', 70),
    Shoes: ink('#b9b2a2', PAPER.getStyle(), 80),
    HP_Shell: ink('#1b1b1b', '#77736a', 90),
    HP_Cushion: ink('#2a2926', '#6d685f', 90),
  }
  // No "boil" on the figure: hatching re-drawn at 8 fps on a body that also moves reads as
  // flicker/glitch. The room keeps its boil; the analyst stays steady.
  Object.values(parts).forEach((m) => { m.uniforms.uBoil.value = 0 })
  return parts
}

const DISSOLVE_GLSL = /* glsl */ `
uniform float uDissolve;
varying vec3 vWorldPos;
float dhash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float dnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dhash(i), dhash(i + vec2(1, 0)), u.x), mix(dhash(i + vec2(0, 1)), dhash(i + vec2(1, 1)), u.x), u.y);
}
bool dissolved() {
  float n = dnoise(vWorldPos.xy * 38.0 + vWorldPos.z * 17.0) * 0.65 + dnoise(vWorldPos.zy * 90.0) * 0.35;
  return uDissolve > 0.0 && n < uDissolve * 1.05;
}`

const FLAT_VERT = /* glsl */ `
#include <skinning_pars_vertex>
uniform float uThickness;
varying vec3 vWorldPos;
void main() {
  vec3 transformed = position + normal * uThickness;
  #ifdef USE_SKINNING
    #include <skinbase_vertex>
    #include <skinning_vertex>
  #endif
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`
const FLAT_FRAG = /* glsl */ `
uniform vec3 uColor;
${DISSOLVE_GLSL}
void main() {
  if (dissolved()) discard;
  gl_FragColor = vec4(uColor, 1.0);
}`

/** Flat colour (ink outline hulls, LED rings) that can skin and dissolve like the ink parts. */
function flat(color: THREE.Color, thickness: number, side: THREE.Side): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FLAT_VERT,
    fragmentShader: FLAT_FRAG,
    uniforms: { uThickness: { value: thickness }, uColor: { value: color }, uDissolve: { value: 0 } },
    side,
  })
}

/** Comic contour: the mesh again, pushed out along its normals, back faces only, in flat ink. */
function outline(mesh: THREE.Mesh, material: THREE.ShaderMaterial): THREE.Mesh {
  const skinned = mesh as THREE.SkinnedMesh
  if (!skinned.isSkinnedMesh) return new THREE.Mesh(mesh.geometry, material)
  // the contour must deform with the same skeleton, or it stays behind in the rest pose
  const hull = new THREE.SkinnedMesh(skinned.geometry, material)
  hull.bind(skinned.skeleton, skinned.bindMatrix)
  hull.frustumCulled = false
  return hull
}

function chair(material: THREE.ShaderMaterial): THREE.Group {
  const g = new THREE.Group()
  const box = (w: number, h: number, d: number, r: number): THREE.Mesh => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material)
  const back = box(0.48, 0.58, 0.07, 0.03)
  back.position.set(0, 0.86, -0.3)
  back.rotation.x = -0.08
  const seat = box(0.5, 0.08, 0.48, 0.03)
  seat.position.set(0, 0.46, -0.05)
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 16), material)
  column.position.set(0, 0.24, -0.05)
  const spine = box(0.06, 0.4, 0.04, 0.01)
  spine.position.set(0, 0.62, -0.32)
  g.add(back, seat, column, spine)
  ;[-1, 1].forEach((s) => {
    const post = box(0.04, 0.2, 0.04, 0.01)
    post.position.set(s * 0.27, 0.58, -0.08)
    const pad = box(0.07, 0.03, 0.26, 0.01)
    pad.position.set(s * 0.27, 0.69, -0.02)
    g.add(post, pad)
  })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = box(0.3, 0.03, 0.045, 0.01)
    leg.position.set(Math.cos(a) * 0.15, 0.07, -0.05 + Math.sin(a) * 0.15)
    leg.rotation.y = -a
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), material)
    wheel.position.set(Math.cos(a) * 0.29, 0.028, -0.05 + Math.sin(a) * 0.29)
    g.add(leg, wheel)
  }
  return g
}

export interface Analyst3D {
  group: THREE.Group
  inks: THREE.ShaderMaterial[]
  /** Advance the animation. `intensity` 0..1 speeds up the typing (the hunt is on). */
  animate: (time: number, delta: number, intensity: number) => void
  /** Keycaps currently pressed by the fingers, for the keyboard to show. */
  pressedKeys: () => { c: number; r: number; amount: number }[]
  /** Move the figure so its home-row anchor lands on `target` (world). */
  alignTo: (target: THREE.Vector3) => void
  headWorld: (out: THREE.Vector3) => THREE.Vector3
  /** 0 solid .. 1 gone (ink-burn). */
  setDissolve: (amount: number) => void
}

/**
 * Wraps the loaded GLB. The figure faces +Z in the file; the returned group faces -Z (the monitor).
 * `accent` is shared by reference so the headset LEDs follow the visitor's choice.
 */
export function buildAnalyst3D(gltf: GLTF, accent: THREE.Color): Analyst3D {
  const inks = inkFor()
  const chairInk = ink('#2a2926', '#8d897f', 40)
  chairInk.uniforms.uBoil.value = 0
  const hullMat = flat(INK, OUTLINE, THREE.BackSide)
  const ledMat = flat(accent, 0, THREE.FrontSide)
  const allInks = [...new Set([...Object.values(inks), chairInk])]

  const figure = gltf.scene
  const meshes: THREE.Mesh[] = []
  figure.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  meshes.forEach((mesh) => {
    mesh.frustumCulled = false
    if (mesh.name === 'HP_LED') {
      mesh.material = ledMat
      return
    }
    mesh.material = inks[mesh.name] ?? inks.Hoodie
    if (mesh.name !== 'Lashes' && mesh.name !== 'Brows') mesh.add(outline(mesh, hullMat))
  })

  const group = new THREE.Group()
  const turned = new THREE.Group().add(figure, chair(chairInk))
  turned.rotation.y = Math.PI
  const shadow = contactShadow(0.95, 0.8, 0.6)
  shadow.position.y = 0.002
  group.add(shadow, turned)

  const rig = new AnalystRig(figure)
  const anchor = figure.getObjectByName('KeyAnchor')
  const head = figure.getObjectByName('mixamorigHead')
  const tmp = new THREE.Vector3()
  return {
    group,
    inks: allInks,
    animate: (t, dt, k) => rig.update(t, dt, k),
    pressedKeys: () => rig.typing.pressedKeys,
    alignTo: (target) => {
      if (!anchor) return
      group.updateMatrixWorld(true)
      anchor.getWorldPosition(tmp)
      group.position.x += target.x - tmp.x
      group.position.z += target.z - tmp.z
    },
    headWorld: (out) => (head ? head.getWorldPosition(out) : out.set(0, 1.35, 0.7)),
    setDissolve: (v) => {
      allInks.forEach((m) => { m.uniforms.uDissolve.value = v })
      hullMat.uniforms.uDissolve.value = v
      ledMat.uniforms.uDissolve.value = v
      group.visible = v < 0.999
      shadow.visible = v < 0.5
    },
  }
}

// ---------------------------------------------------------------- procedural animation

const X = new THREE.Vector3(1, 0, 0) // figure space: +X = the analyst's left, +Y up, +Z toward the screen
const Y = new THREE.Vector3(0, 1, 0)
const FINGERS: Finger[] = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']
const SIDES: Side[] = ['Left', 'Right']
/** Neighbours that move a little with a striking finger (shared tendons), and how much. */
const SYMPATHY: Partial<Record<Finger, [Finger, number][]>> = {
  Ring: [['Middle', 0.22], ['Pinky', 0.3]],
  Pinky: [['Ring', 0.25]],
  Middle: [['Ring', 0.12]],
}

/** `spreadSign`: +1 if rotating about `spread` moves the fingertip toward higher key columns (world +x = figure −x). */
interface FingerAxes { flex: THREE.Vector3[]; spread: THREE.Vector3; spreadSign: number }

/**
 * Drives the skinned figure with small rotations about ANATOMICAL axes measured on the model
 * (figure space): each finger joint flexes about cross(segment, palm normal) — the rule from the
 * skill's hand rig — and spreads about the palm normal. Bone-local axes are never guessed.
 * Keystroke = lift a few mm, strike (key travel), settle back onto the key; all eased, no snapping.
 */
class AnalystRig {
  readonly typing = new TypingDriver()
  private readonly rest = new Map<THREE.Object3D, THREE.Quaternion>()
  private readonly bones = new Map<string, THREE.Object3D>()
  private readonly axes = new Map<string, FingerAxes>()
  private readonly handAxis: Record<Side, THREE.Vector3> = { Left: new THREE.Vector3(), Right: new THREE.Vector3() }
  private readonly figureQ = new THREE.Quaternion()
  private readonly parentQ = new THREE.Quaternion()
  private readonly d = new THREE.Quaternion()
  private readonly tmp = new THREE.Quaternion()
  private readonly axis = new THREE.Vector3()
  private clock = 0
  private speed = 1
  private glance = 0
  private glanceTarget = 0
  private nextGlance = 2
  private readonly wrist: Record<Side, number> = { Left: 0, Right: 0 }
  private readonly reachCol: Record<Side, number> = { Left: 0, Right: 0 }
  private readonly handYaw: Record<Side, number> = { Left: 0, Right: 0 }

  constructor(private readonly figure: THREE.Object3D) {
    figure.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return
      this.rest.set(o, o.quaternion.clone())
      this.bones.set(o.name.replace('mixamorig', ''), o)
    })
    this.measureAxes()
  }

  /** Figure-space position of a bone's head in the rest (typing) pose. */
  private at(name: string): THREE.Vector3 {
    const b = this.bones.get(name)
    const v = new THREE.Vector3()
    if (!b) return v
    b.getWorldPosition(v)
    return this.figure.worldToLocal(v)
  }

  private measureAxes(): void {
    this.figure.updateWorldMatrix(true, true)
    SIDES.forEach((side) => {
      const hand = this.at(`${side}Hand`)
      const knuckles = this.at(`${side}HandPinky1`).sub(this.at(`${side}HandIndex1`))
      const handDir = this.at(`${side}HandMiddle1`).sub(hand).normalize()
      const palm = new THREE.Vector3().crossVectors(knuckles, handDir).normalize()
      if (palm.y > 0) palm.negate() // palm faces the keys (down)
      this.handAxis[side].copy(knuckles).normalize()
      FINGERS.forEach((finger) => {
        const p = [1, 2, 3].map((i) => this.at(`${side}Hand${finger}${i}`))
        const segs = [p[1].clone().sub(p[0]), p[2].clone().sub(p[1]), p[2].clone().sub(p[1])].map((v) => v.normalize())
        // a small rotation φ about the palm normal moves the segment by φ·(palm × seg)
        const sideways = new THREE.Vector3().crossVectors(palm, segs[0])
        this.axes.set(side + finger, {
          flex: segs.map((sg) => new THREE.Vector3().crossVectors(sg, palm).normalize()),
          spread: palm.clone(),
          spreadSign: sideways.x < 0 ? 1 : -1,
        })
      })
    })
  }

  /** Rotate a bone by `angle` around a figure-space axis, on top of its current pose. */
  private turn(name: string, figureAxis: THREE.Vector3, angle: number): void {
    const b = this.bones.get(name)
    if (!b || !b.parent || Math.abs(angle) < 1e-5) return
    this.axis.copy(figureAxis).applyQuaternion(this.figureQ)
    b.parent.getWorldQuaternion(this.parentQ)
    this.d.setFromAxisAngle(this.axis, angle)
    // local = parentWorld^-1 * D * parentWorld * local
    this.tmp.copy(this.parentQ).invert().multiply(this.d).multiply(this.parentQ).multiply(b.quaternion)
    b.quaternion.copy(this.tmp)
  }

  update(t: number, dt: number, intensity: number): void {
    this.rest.forEach((q, b) => b.quaternion.copy(q))
    this.figure.getWorldQuaternion(this.figureQ)

    // breathing, kept tiny: the arms hang from the spine and any sway shifts their hatching
    const breath = Math.sin(t * 1.3)
    this.turn('Spine1', X, breath * 0.004)
    this.turn('Spine2', X, breath * 0.003)

    // glances: mostly the centre monitor, sometimes the side screens (damped, never snapping)
    if (t > this.nextGlance) {
      const r = Math.random()
      this.glanceTarget = r < 0.6 ? 0 : r < 0.8 ? 0.28 : -0.26
      this.nextGlance = t + 1.8 + Math.random() * 3.2
    }
    this.glance = THREE.MathUtils.damp(this.glance, this.glanceTarget, 4, dt)
    this.turn('Neck', Y, this.glance * 0.4)
    this.turn('Head', Y, this.glance * 0.6)
    this.turn('Head', X, 0.025 * Math.sin(t * 0.6) + 0.03 * intensity)

    // touch typing: accumulated clock so a speed change never jumps the schedule
    this.speed = THREE.MathUtils.damp(this.speed, 1 + intensity * 0.45, 2, dt)
    this.clock += dt * this.speed
    this.typing.sample(this.clock)

    SIDES.forEach((side) => {
      // the whole hand dips ~1 deg while that hand is typing (wrist stays neutral)
      this.wrist[side] = THREE.MathUtils.damp(this.wrist[side], this.typing.handActivity[side], 8, dt)
      this.turn(`${side}Hand`, this.handAxis[side], (side === 'Left' ? 1 : -1) * 0.02 * this.wrist[side])
      this.reachCol[side] = 0
      FINGERS.forEach((finger) => this.pose(side, finger))
      // the whole hand slides toward the column being reached (small yaw about the palm normal)
      this.handYaw[side] = THREE.MathUtils.damp(this.handYaw[side], this.reachCol[side], 12, dt)
      const palm = this.axes.get(side + 'Index')
      if (palm) this.turn(`${side}Hand`, palm.spread, this.handYaw[side] * 0.05 * palm.spreadSign)
    })
  }

  /** Lift → strike → settle, plus reaching to another row/column, about the finger's own axes. */
  private pose(side: Side, finger: Finger): void {
    const ax = this.axes.get(side + finger)
    if (!ax) return
    const s = this.typing.finger(side, finger)
    const lift = s.reach * (1 - s.press)                  // raise before the strike
    const far = Math.max(0, -s.dRow) * s.reach           // row further away: extend
    const near = Math.max(0, s.dRow) * s.reach           // row closer: curl
    let sympathy = 0
    for (const [other, k] of SYMPATHY[finger] ?? []) sympathy += this.typing.finger(side, other).press * k
    const base = `${side}Hand${finger}`
    if (finger === 'Thumb') {
      this.turn(`${base}1`, ax.flex[0], -0.06 * lift + 0.12 * s.press)
      return
    }
    // Sideways reach is mostly the hand/wrist; the knuckle itself spreads little (a big MCP
    // abduction makes the index knuckle bulge like a bunion), ≤ ~5° for the index.
    const spread = finger === 'Index' ? 0.08 : 0.12
    this.turn(`${base}1`, ax.spread, s.dCol * s.reach * spread * ax.spreadSign)
    this.reachCol[side] += s.dCol * s.reach
    this.turn(`${base}1`, ax.flex[0], -0.12 * lift + 0.06 * s.press + 0.08 * near - 0.06 * far + 0.05 * sympathy)
    this.turn(`${base}2`, ax.flex[1], 0.04 * s.press + 0.2 * near - 0.3 * far + 0.03 * sympathy)
    this.turn(`${base}3`, ax.flex[2], 0.02 * s.press + 0.06 * near - 0.12 * far)
  }
}
