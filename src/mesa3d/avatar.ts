import * as THREE from 'three'
import { PALETTE, hex } from './look'
import { CHAIR_R, SHOULDER_R, SHOULDER_Y, MAX_BASES, seatAngle, polar, type PlayerCount } from './seats'
import type { CardFactory, CardView } from './cards'
import type { Equipo } from './contract'

// Placeholder anatomy for the demo (boxes/cylinders read fine at 360p under heavy post).
// Production avatars: use the `modeling-3d-human-characters` skill for real arms and hands.
const UPPER = 0.32
const FORE = 0.3
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export type Sena = 'none' | 'ancho-espada' | 'ancho-basto' | 'siete-espada' | 'siete-oro' | 'tres' | 'dos' | 'falso' | 'nada'

const mat = (c: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex(c), roughness: rough })

function segment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a)
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.quaternion.setFromUnitVectors(Y_AXIS, d.normalize())
}

// Analytic two-bone IK: elbow bends toward `pole`.
function solveElbow(s: THREE.Vector3, t: THREE.Vector3, pole: THREE.Vector3) {
  const toT = t.clone().sub(s)
  const d = THREE.MathUtils.clamp(toT.length(), 0.05, UPPER + FORE - 1e-3)
  const dir = toT.normalize()
  const a = (UPPER * UPPER + d * d - FORE * FORE) / (2 * d)
  const h = Math.sqrt(Math.max(UPPER * UPPER - a * a, 0))
  const p = pole.clone().sub(s)
  const bend = p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize()
  return { elbow: s.clone().addScaledVector(dir, a).addScaledVector(bend, h), wrist: s.clone().addScaledVector(dir, d) }
}

function glove(cuff: string) {
  const g = new THREE.Group()
  const bone = mat(PALETTE.bone, 0.7)
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.08), bone)
  palm.position.z = 0.04
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.07), bone)
  fingers.position.set(0, -0.006, 0.11)
  fingers.rotation.x = 0.35
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.05), bone)
  thumb.position.set(-0.045, -0.005, 0.05)
  thumb.rotation.y = 0.5
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10), mat(cuff))
  band.rotation.x = Math.PI / 2
  g.add(palm, fingers, thumb, band)
  g.traverse((o) => (o.castShadow = true))
  return g
}

// Puppet mask: a Buckshot-style mask that is ARTICULATED so the señas still read.
// (Mask vs La Base's flat emoji face is an open decision; gesto() is a stub in piece 1a.)
function mask() {
  const head = new THREE.Group()
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(PALETTE.soot, 1))
  hood.scale.set(1, 1.15, 1)
  hood.position.z = 0.03
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(PALETTE.bone, 0.55))
  face.rotation.x = -Math.PI / 2
  face.scale.set(1, 0.55, 1.3)
  face.position.z = -0.06
  const ink = new THREE.MeshBasicMaterial({ color: hex(PALETTE.ink) })
  const eyes = [-1, 1].map((sx) => {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), ink)
    hole.position.set(sx * 0.045, 0.03, -0.132)
    hole.rotation.y = Math.PI
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), mat(PALETTE.bone, 0.55))
    lid.geometry.translate(0, -0.025, 0) // hinge at the top edge
    lid.position.set(sx * 0.045, 0.055, -0.135)
    lid.rotation.y = Math.PI
    lid.scale.y = 0.01
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.012), ink)
    brow.position.set(sx * 0.045, 0.07, -0.132)
    head.add(hole, lid, brow)
    return { lid, brow }
  })
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.014), ink)
  mouth.position.set(0, -0.05, -0.134)
  mouth.rotation.y = Math.PI
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.05), mat(PALETTE.bone, 0.55))
  jaw.position.set(0, -0.085, -0.1)
  head.add(hood, face, mouth, jaw)
  head.traverse((o) => (o.castShadow = true))

  // Each seña is a pose of lids / brows / mouth / jaw. amount 0..1 lets it flash briefly.
  function sena(s: Sena, amount: number) {
    const k = amount
    eyes[0].lid.scale.y = eyes[1].lid.scale.y = 0.01
    eyes[0].brow.position.y = eyes[1].brow.position.y = 0.07
    mouth.position.x = 0
    mouth.scale.set(1, 1, 1)
    jaw.position.y = -0.085
    if (s === 'ancho-espada') eyes.forEach((e) => (e.brow.position.y = 0.07 + 0.02 * k))
    if (s === 'ancho-basto') eyes[0].lid.scale.y = Math.max(0.01, k)
    if (s === 'siete-espada') mouth.position.x = 0.025 * k
    if (s === 'siete-oro') mouth.position.x = -0.025 * k
    if (s === 'tres') mouth.scale.set(1, 1 - 0.8 * k, 1)
    if (s === 'dos') mouth.scale.set(1 - 0.6 * k, 1 + 1.2 * k, 1)
    if (s === 'falso') jaw.position.y = -0.085 - 0.03 * k
    if (s === 'nada') eyes.forEach((e) => (e.lid.scale.y = Math.max(0.01, k)))
  }
  return { head, sena }
}

export interface Avatar {
  root: THREE.Group
  seat: number
  hand: CardView[] // face-down cards held at the chest (identity unknown to others); pool of MAX_BASES
  layoutHand(total: number): void // lay out `total` fan slots (visibility is up to the caller)
  head: THREE.Group
  sena(s: Sena, amount: number): void
  // Pose in WORLD space; the avatar converts to local and solves IK.
  pose(p: AvatarPose): void
}

export interface AvatarPose {
  rightWrist?: THREE.Vector3
  leftWrist?: THREE.Vector3
  lean: number
  headYaw: number
  headPitch: number
}

export function makeAvatar(seat: number, n: PlayerCount, equipo: Equipo, cards: CardFactory, firstPerson = false): Avatar {
  const a = seatAngle(seat, n)
  const root = new THREE.Group()
  root.position.copy(polar(CHAIR_R, a, 0))
  root.rotation.y = Math.PI / 2 - a // local -Z faces the table centre
  const cuff = equipo === 'visitante' ? PALETTE.teal : PALETTE.rose // absolute team, never viewer-relative

  const torso = new THREE.Group()
  root.add(torso)
  const coat = new THREE.Mesh(
    new THREE.LatheGeometry([0, 0.2, 0.24, 0.23, 0.2, 0.08].map((r, i) => new THREE.Vector2(r + 0.001, 0.5 + [0, 0.02, 0.3, 0.52, 0.6, 0.66][i])), 14),
    mat(PALETTE.soot, 1),
  )
  coat.scale.z = 0.7
  coat.castShadow = true
  torso.add(coat)
  const { head, sena } = mask()
  head.position.set(0, 1.3, -0.04)
  torso.add(head)

  const armMat = mat(PALETTE.soot, 1)
  const mk = () => new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 1, 8), armMat)
  const arms = [-1, 1].map((sx) => ({ sx, upper: mk(), fore: mk(), glove: glove(cuff) }))
  arms.forEach((r) => {
    r.upper.scale.y = UPPER
    r.fore.scale.y = FORE
    r.upper.castShadow = r.fore.castShadow = true
    root.add(r.upper, r.fore, r.glove)
  })

  // Held fan: backs toward the table, tight against the chest. La Base hands go from 1 to 10 cards,
  // so the fan spreads with the count (and tightens past 3 so it stays on the chest).
  const hand = Array.from({ length: MAX_BASES }, () => {
    const c = cards.makeCard()
    c.root.visible = false
    root.add(c.root)
    return c
  })
  function layoutHand(total: number) {
    const step = total > 1 ? Math.min(0.018, 0.13 / (total - 1)) : 0
    const rot = total > 1 ? Math.min(0.12, 0.75 / (total - 1)) : 0
    hand.forEach((c, k) => {
      const d = k - (total - 1) / 2
      c.root.position.set(d * step, 1.0 - Math.abs(d) * 0.004, -0.33 + k * 0.0012)
      c.root.rotation.set(0.35, 0, d * -rot, 'YXZ') // face toward the owner, back toward the table
    })
  }
  layoutHand(3)

  const chestHold = new THREE.Vector3(0, 0.95, -0.34)
  const shoulderLocal = (sx: number, lean: number) => new THREE.Vector3(sx * 0.19, SHOULDER_Y - lean * 0.05, -(CHAIR_R - SHOULDER_R) - lean * 0.1)

  // First person: only the arms exist (the camera lives where the head would be).
  if (firstPerson) {
    torso.visible = false
    hand.forEach((c) => (c.root.visible = false))
  }

  function pose(p: AvatarPose) {
    torso.position.z = -p.lean * 0.1
    torso.rotation.x = -p.lean * 0.25
    head.rotation.set(p.headPitch, p.headYaw, 0, 'YXZ')
    for (const r of arms) {
      const s = shoulderLocal(r.sx, p.lean)
      const wristWorld = r.sx > 0 ? p.rightWrist : p.leftWrist
      const target = wristWorld ? root.worldToLocal(wristWorld.clone()) : chestHold.clone().setX(r.sx * 0.05)
      const pole = s.clone().add(new THREE.Vector3(r.sx * 0.4, -0.5, 0.1))
      const { elbow, wrist } = solveElbow(s, target, pole)
      segment(r.upper, s, elbow)
      segment(r.fore, elbow, wrist)
      r.glove.position.copy(wrist)
      r.glove.lookAt(root.localToWorld(wrist.clone().add(wrist.clone().sub(elbow))))
    }
  }
  return { root, seat, hand, layoutHand, head, sena, pose }
}
