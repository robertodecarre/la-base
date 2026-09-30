import * as THREE from 'three'
import { buildLamp, buildRoom } from './table'
import { EYE_R, EYE_Y, TABLE_Y, TABLE_R, CARD_W, CARD_H, SHOULDER_R, SHOULDER_Y, seatAngle, polar, reachOk, playSlot, type PlayerCount } from './seats'
import { makeAvatar, type Avatar, type AvatarPose, type Sena } from './avatar'
import { makeCard, type CardView } from './cards'
import { drawBack, drawFace, toTexture, RANKS, SUITS, type Rank, type Suit } from './cardFace'
import { playPose, PLAY_DURATION } from './play'
import { makePost } from './post'
import { schedule, tickJobs, wait } from './jobs'
import { initAudio, sfx, lampBuzz, toggleMute } from './audio'
import { PALETTE, hex } from './look'

// ?n=4|6|8  ?auto=1 (you also play by yourself)  ?raw=1 (no post)  ?yaw= ?pitch=
const q = new URLSearchParams(location.search)
const parsedN = Number(q.get('n') ?? 6)
const N: PlayerCount = parsedN === 4 || parsedN === 8 ? parsedN : 6
let auto = q.has('auto')

await document.fonts.load('40px "IM Fell English SC"').catch(() => undefined)

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(1)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
document.body.prepend(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(58, 1, 0.03, 30)
scene.add(camera)
buildRoom(scene, N)
const lamp = buildLamp(scene)
const post = makePost(renderer, Number(q.get('low') ?? 720))
for (let s = 0; s < N; s++) for (let b = 0; b < 3; b++) if (!reachOk(s, N, b)) throw new Error(`seat ${s} cannot reach baza ${b}`)

// ---------- geometry helpers ----------
const yawOf = (s: number) => Math.PI / 2 - seatAngle(s, N)
const outOf = (s: number) => new THREE.Vector3(Math.cos(seatAngle(s, N)), 0, Math.sin(seatAngle(s, N)))
const rightOf = (s: number) => new THREE.Vector3(Math.sin(seatAngle(s, N)), 0, -Math.cos(seatAngle(s, N)))
const quatOf = (rx: number, yaw: number, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, roll, 'YXZ'))
const FACE_DOWN = Math.PI / 2
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const seg = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1)
const CARD_T = 0.0009 // stacked card thickness

// ---------- camera: seat 0, mouse = head ----------
const a0 = seatAngle(0, N)
const eye = polar(EYE_R, a0, EYE_Y)
const baseYaw = Math.PI / 2 - a0
// Head turn: just enough to see the adjacent players' faces (inscribed angle to the next seat + margin).
// The neighbour's face stays in frame even before your head points at it (horizontal half-FOV ≈ 45° at 16:9),
// so the head only needs to turn to ~0.2 rad short of the neighbour: N=8 ±0.98, N=6 ±0.85, N=4 ±0.59.
const YAW_MAX = (Math.PI - (2 * Math.PI) / N) / 2 - 0.2
// Mouse sensitivity (rad or m per pixel). Kept low: head and arm must feel heavy and deliberate.
const LOOK_SENS = 0.0012
const ARM_SENS = 0.0009
const PEEK_SENS = 0.0005
const PITCH_MIN = -0.8
const PITCH_MAX = 0.25
const clampYaw = (v: number) => THREE.MathUtils.clamp(v, -YAW_MAX, YAW_MAX)
const clampPitch = (v: number) => THREE.MathUtils.clamp(v, PITCH_MIN, PITCH_MAX)
let yaw = clampYaw(Number(q.get('yaw') ?? 0))
let pitch = clampPitch(Number(q.get('pitch') ?? -0.36))
let yawT = yaw
let pitchT = pitch
const mouse = new THREE.Vector2(0, 0)
let aim = 0
let lowered = 0
let aimT = 0
// Aim (right button): zoom toward the cursor (or the crosshair when pointer-locked). Aiming at the far
// half of the table (past the line through the centre, across your seat) makes YOU stand up and look
// from above. Local camera only: nobody else sees it.
interface Peek { target: THREE.Vector3; standing: boolean }
let peek: Peek | null = null
let stand = 0
const baseCam = new THREE.PerspectiveCamera(58, 1, 0.03, 30) // seated, un-zoomed view (for cursor rays)
const forward0 = new THREE.Vector3(-Math.cos(a0), 0, -Math.sin(a0)) // from your seat toward the centre
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y)
const farness = (p: THREE.Vector3) => p.clone().setY(0).dot(forward0)

function beginPeek() {
  const ray = new THREE.Raycaster()
  ray.setFromCamera(document.pointerLockElement ? new THREE.Vector2(0, 0) : mouse, baseCam)
  const hit = ray.ray.intersectPlane(tablePlane, new THREE.Vector3())
  const target = hit && hit.setY(0).length() < TABLE_R ? hit.setY(TABLE_Y) : ray.ray.at(2.5, new THREE.Vector3())
  peek = { target, standing: false }
  aimT = 1
}
function panPeek(dx: number, dy: number) {
  if (!peek) return
  const dist = camera.position.distanceTo(peek.target)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
  const k = PEEK_SENS * dist
  peek.target.addScaledVector(right, dx * k).addScaledVector(fwd, -dy * k)
  if (peek.target.y <= TABLE_Y + 0.01) {
    const flat = peek.target.clone().setY(0)
    if (flat.length() > 0.95) flat.setLength(0.95)
    peek.target.set(flat.x, TABLE_Y, flat.z)
  }
}
function endPeek() {
  aimT = 0
  if (peek && document.pointerLockElement) {
    // keep looking where you were aiming (no snap back) when you steer with the locked mouse
    const d = peek.target.clone().sub(eye)
    yaw = yawT = clampYaw(Math.atan2(-d.x, -d.z) - baseYaw)
    pitch = pitchT = clampPitch(Math.atan2(d.y, Math.hypot(d.x, d.z)))
  }
  peek = null
}

addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  if (pending) pending.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
  if (drag) {
    drag.fwd = THREE.MathUtils.clamp(drag.fwd - e.movementY * ARM_SENS, HOLD_FWD, 0.8)
    drag.lat = THREE.MathUtils.clamp(drag.lat + e.movementX * ARM_SENS, -0.35, 0.35)
  } else if (peek) {
    panPeek(e.movementX, e.movementY)
  } else if (document.pointerLockElement) {
    yawT = clampYaw(yawT - e.movementX * LOOK_SENS)
    pitchT = clampPitch(pitchT - e.movementY * LOOK_SENS)
  }
})
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('pointerup', (e) => { if (e.button === 2) endPeek() })

// ---------- your own hand (viewmodel) ----------
const viewmodel = new THREE.Group()
camera.add(viewmodel)
const backTex = toTexture(drawBack())
const vm = [0, 1, 2].map((k) => {
  const mat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.25 })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat)
  m.geometry.translate(0, CARD_H * 0.45, 0) // pivot near the bottom: fan from the grip
  // held in the LEFT hand, off to the side: your own play zone must stay visible
  const base = { x: -0.15 + k * 0.03, y: -0.25, z: -0.36 + k * 0.002, rz: 0.12 - k * 0.2 }
  m.position.set(base.x, base.y, base.z)
  m.rotation.set(-0.35, 0, base.rz)
  m.visible = false
  viewmodel.add(m)
  return { mesh: m, mat, base, lift: 0 }
})
function setVmFace(k: number, id: [Suit, Rank]) {
  const tex = toTexture(drawFace(...id))
  vm[k].mat.map = tex
  vm[k].mat.emissiveMap = tex
  vm[k].mat.needsUpdate = true
}
const crosshair = document.querySelector<HTMLElement>('.dot')!

// ---------- players ----------
const avatars: Avatar[] = []
const handBaseY: number[][] = []
for (let s = 0; s < N; s++) {
  const av = makeAvatar(s, N, s === 0)
  scene.add(av.root)
  av.hand.forEach((c) => (c.root.visible = false))
  handBaseY[s] = av.hand.map((c) => c.root.position.y)
  avatars.push(av)
}
let poses: AvatarPose[] = []
let focus: THREE.Vector3 | null = null
let stareAtYou = 0 // seconds left of everyone staring at the camera (after a canto)

// ---------- cards ----------
interface Card { view: CardView; id: [Suit, Rank] | null; revealed: boolean }
const all: Card[] = Array.from({ length: 3 * N }, () => ({ view: makeCard(), id: null, revealed: false }))
all.forEach((c) => scene.add(c.view.root))
let hands: Card[][] = Array.from({ length: N }, () => [])
let played: Card[][] = Array.from({ length: N }, () => [])
let pile: Card[] = [...all]
let dealer = N / 2 // opposite you: first thing you see is the shuffle and the cards flying at you

const pileBase = (d: number) => polar(0.6, seatAngle(d, N), TABLE_Y + 0.002).addScaledVector(rightOf(d), 0.12)
const pileSlot = (d: number, i: number) => pileBase(d).add(new THREE.Vector3(0, i * CARD_T, 0))
const pileQuat = (d: number, jitter = 0) => quatOf(FACE_DOWN, yawOf(d) + jitter)
function layPile(d: number) {
  pile.forEach((c, i) => {
    c.view.root.visible = true
    c.view.root.position.copy(pileSlot(d, i))
    c.view.root.quaternion.copy(pileQuat(d))
  })
}
layPile(dealer)

// The rest of the 40-card deck, as one block next to the dealer.
const rest = new THREE.Mesh(
  new THREE.BoxGeometry(CARD_W, (40 - 3 * N) * CARD_T, CARD_H),
  [0, 1, 2, 3, 4, 5].map((i) =>
    i === 2 ? new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.85 }) : new THREE.MeshStandardMaterial({ color: hex(PALETTE.bone), roughness: 0.9 }),
  ),
)
rest.castShadow = true
scene.add(rest)
function placeRest(d: number) {
  rest.position.copy(polar(0.6, seatAngle(d, N), TABLE_Y + ((40 - 3 * N) * CARD_T) / 2 + 0.002).addScaledVector(rightOf(d), -0.13))
  rest.rotation.set(0, yawOf(d) + 0.08, 0)
}
placeRest(dealer)

function deck(): Array<[Suit, Rank]> {
  const d: Array<[Suit, Rank]> = SUITS.flatMap((s) => RANKS.map((r) => [s, r] as [Suit, Rank]))
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

// Where a held card lives in world space (target of the deal, start of a play).
function heldPose(s: number, k: number) {
  const o = s === 0 ? vm[k].mesh : avatars[s].hand[k].root
  return { pos: o.getWorldPosition(new THREE.Vector3()), quat: o.getWorldQuaternion(new THREE.Quaternion()) }
}

// ---------- actions ----------
function shuffle() {
  const d = dealer
  const base = pileBase(d)
  const R = rightOf(d)
  const n = pile.length
  const half = Math.ceil(n / 2)
  const order = pile.map((_, i) => i)
  const inter: number[] = []
  for (let i = 0; i < half; i++) {
    inter.push(order[i])
    if (half + i < n) inter.push(order[half + i])
  }
  const rankOf = new Map(inter.map((idx, m) => [idx, m]))
  const jit = pile.map(() => (Math.random() - 0.5) * 0.25)
  sfx('shuffle', base)
  return schedule({
    dur: 1.7,
    stepped: d !== 0,
    update: (_u, t) => {
      pile.forEach((c, i) => {
        const side = i < half ? -1 : 1
        const inHalf = i < half ? i : i - half
        const split = base.clone().addScaledVector(R, side * 0.075).add(new THREE.Vector3(0, inHalf * CARD_T, 0))
        const m = rankOf.get(i)!
        const back = base.clone().add(new THREE.Vector3(0, m * CARD_T, 0))
        const sU = ease(seg(t, 0, 0.4))
        const rU = ease(seg(t, 0.45 + (m / n) * 0.55, 0.45 + (m / n) * 0.55 + 0.15))
        const p = pileSlot(d, i).lerp(split, sU).lerp(back, rU)
        p.y += Math.sin(rU * Math.PI) * 0.012
        c.view.root.position.copy(p)
        c.view.root.quaternion.copy(pileQuat(d, jit[i] * (1 - ease(seg(t, 1.2, 1.5)))))
      })
      const wob = Math.sin(t * 30) * 0.004
      poses[d].rightWrist = base.clone().addScaledVector(R, 0.08).add(new THREE.Vector3(0, 0.05 + wob, 0)).addScaledVector(outOf(d), 0.06)
      poses[d].leftWrist = base.clone().addScaledVector(R, -0.08).add(new THREE.Vector3(0, 0.05 - wob, 0)).addScaledVector(outOf(d), 0.06)
      poses[d].lean = 0.5
      poses[d].headPitch = -0.5
      focus = base
    },
    done: () => {
      pile = inter.map((i) => pile[i])
      sfx('place', base, 0.5)
    },
  })
}

function deal() {
  const d = dealer
  const ids = deck()
  hands = Array.from({ length: N }, () => [])
  const jobs: Promise<void>[] = []
  let step = 0
  for (let round = 0; round < 3; round++)
    for (let j = 1; j <= N; j++) {
      const s = (d + j) % N
      const k = round
      const card = pile.pop()!
      card.id = ids[step]
      card.revealed = false
      card.view.forget()
      hands[s][k] = card
      let from: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null
      jobs.push(
        schedule({
          delay: step * 0.14,
          dur: 0.45,
          stepped: d !== 0,
          update: (u) => {
            if (!from) {
              from = { pos: card.view.root.position.clone(), quat: card.view.root.quaternion.clone() }
              sfx('toss', from.pos, 0.7)
            }
            const to = heldPose(s, k)
            const e = ease(u)
            const p = from.pos.clone().lerp(to.pos, e)
            p.y += Math.sin(u * Math.PI) * (0.18 + from.pos.distanceTo(to.pos) * 0.12)
            card.view.root.position.copy(p)
            // keep it face-down in flight, turn to the hand pose only at the end
            const spin = quatOf(FACE_DOWN, yawOf(d) + u * Math.PI * 1.5)
            card.view.root.quaternion.copy(from.quat).slerp(spin, Math.min(1, u * 3)).slerp(to.quat, ease(seg(u, 0.7, 1)))
            const dir = to.pos.clone().sub(from.pos).setY(0).normalize()
            poses[d].rightWrist = from.pos.clone().addScaledVector(dir, 0.06 + Math.sin(u * Math.PI) * 0.08).add(new THREE.Vector3(0, 0.06, 0))
            poses[d].lean = 0.4
            focus = from.pos
          },
          done: () => {
            card.view.root.visible = false
            if (s === 0) {
              setVmFace(k, card.id!)
              vm[k].mesh.visible = true
            } else avatars[s].hand[k].root.visible = true
            sfx('toHand', heldPose(s, k).pos)
          },
        }),
      )
      step++
    }
  return Promise.all(jobs).then(() => placeRest(d))
}

interface HeldPose { pos: THREE.Vector3; quat: THREE.Quaternion }
interface GestureOpts {
  dur: number
  map: (t: number) => number // gesture time → time on the play timeline (playPose)
  reveal: boolean
  from?: HeldPose // start from where the card really is (local drag)
  blend?: number
}

// One card gesture on the shared play timeline. A real play maps t→t; a feint goes out and back.
function gesture(s: number, k: number, baza: number, o: GestureOpts) {
  const card = hands[s][k]
  const hold = heldPose(s, k)
  const start = o.from ?? hold
  if (s === 0) vm[k].mesh.visible = false
  else avatars[s].hand[k].root.visible = false
  card.view.root.visible = true
  card.view.root.position.copy(start.pos)
  card.view.root.quaternion.copy(start.quat)
  let lastPt = o.map(0)
  return schedule({
    dur: o.dur,
    stepped: s !== 0,
    update: (_u, t) => {
      const pt = o.map(t)
      const pose = playPose(s, N, baza, pt, hold.pos)
      const b = ease(seg(t, 0, o.blend ?? 0.3)) // blend out of the exact spot it was
      card.view.root.position.copy(start.pos.clone().lerp(pose.cardPos, b))
      card.view.root.quaternion.copy(start.quat.clone().slerp(new THREE.Quaternion().setFromEuler(pose.cardRot), b))
      poses[s].rightWrist = pose.wrist
      poses[s].lean = pose.lean
      poses[s].headPitch = pose.headPitch
      focus = card.view.root.position
      // identity is attached only when the reveal starts (server-timed in the real game)
      if (o.reveal && pose.faceVisible && !card.revealed) {
        card.view.setIdentity(...card.id!)
        card.revealed = true
      }
      const at = card.view.root.position
      const crossed = (edge: number) => lastPt < edge && pt >= edge
      if (crossed(0.02)) sfx('pick', at)
      if (crossed(0.6)) sfx('slide', at, 0.8)
      if (o.reveal && crossed(1.12)) sfx('place', at)
      if (o.reveal && crossed(1.32)) sfx('flip', at)
      lastPt = pt
    },
  })
}

function playCard(s: number, k: number, baza: number) {
  played[s][baza] = hands[s][k]
  return gesture(s, k, baza, { dur: PLAY_DURATION, map: (t) => t, reveal: true })
}

// Feint (amague): the card goes out face-down toward the zone and comes back to the hand.
async function feint(s: number, k: number, baza: number) {
  const dur = 1.1 + Math.random() * 0.6
  const depth = 0.8 + Math.random() * 0.25 // how far along the reach it gets
  await gesture(s, k, baza, { dur, map: (t) => depth * Math.sin((t / dur) * Math.PI), reveal: false })
  hands[s][k].view.root.visible = false
  avatars[s].hand[k].root.visible = true
}

// Remote players hesitate: finger a card, sometimes feint with it, then commit.
async function remoteTurn(s: number, baza: number) {
  const left = [0, 1, 2].filter((k) => !played[s].includes(hands[s][k]))
  const pick = left[Math.floor(Math.random() * left.length)]
  const tease = Math.random() < 0.35 ? left[Math.floor(Math.random() * left.length)] : pick
  for (const k of tease !== pick ? [tease, pick] : [pick]) {
    await schedule({
      dur: 0.3 + Math.random() * 0.25,
      stepped: true,
      update: (u) => {
        avatars[s].hand.forEach((c, i) => (c.root.position.y = handBaseY[s][i] + (i === k ? Math.sin(u * Math.PI) * 0.018 : 0)))
      },
    })
  }
  if (Math.random() < 0.3) await feint(s, left[Math.floor(Math.random() * left.length)], baza)
  await playCard(s, pick, baza)
}

// ---------- your arm: hold click on a card, drag to reach, release on the zone to play ----------
let turn: { baza: number; resolve: () => void } | null = null
let busy = false // a local commit/return animation is running
interface Drag { k: number; fwd: number; lat: number; from: HeldPose; t0: number; lastSound: THREE.Vector3 | null }
let drag: Drag | null = null
const HOLD_FWD = -0.35 // "fwd" = metres past your table edge; negative = back toward your chest
const REACH = 0.78
const shoulder0 = polar(SHOULDER_R, a0, SHOULDER_Y).addScaledVector(rightOf(0), 0.19)
const edge0 = polar(TABLE_R, a0, 0)
const HOVER_Y = TABLE_Y + 0.025

function dragPose(d: Drag): HeldPose {
  const hold = heldPose(0, d.k)
  const R = rightOf(0)
  const inward = outOf(0).negate()
  const over = edge0.clone().addScaledVector(inward, Math.max(0, d.fwd)).addScaledVector(R, d.lat).setY(HOVER_Y)
  // reach limit, measured from the shoulder (and fed back so the input can't run away)
  const v = over.clone().sub(shoulder0)
  const dy = v.y
  const maxH = Math.sqrt(Math.max(REACH * REACH - dy * dy, 0))
  const h = Math.hypot(v.x, v.z)
  if (h > maxH) {
    over.set(shoulder0.x + (v.x * maxH) / h, HOVER_Y, shoulder0.z + (v.z * maxH) / h)
    const rel = over.clone().sub(edge0)
    d.fwd = rel.dot(inward)
    d.lat = rel.dot(R)
  }
  const down = quatOf(FACE_DOWN, yawOf(0), THREE.MathUtils.clamp(-d.lat * 0.4, -0.2, 0.2))
  if (d.fwd >= 0) return { pos: over, quat: down }
  const u = ease(THREE.MathUtils.clamp(d.fwd / HOLD_FWD, 0, 1)) // 0 at the edge, 1 at the chest
  return { pos: over.lerp(hold.pos, u), quat: down.slerp(hold.quat, u) }
}

function zoneOf(baza: number) {
  return playSlot(0, N, baza).pos
}
function inZone(pos: THREE.Vector3, baza: number) {
  const d = pos.clone().sub(zoneOf(baza))
  return Math.abs(d.dot(rightOf(0))) < CARD_W / 2 + 0.03 && Math.abs(d.dot(outOf(0))) < CARD_H / 2 + 0.05 && pos.y < TABLE_Y + 0.06
}

function startDrag(k: number) {
  if (drag || busy || !hands[0][k] || played[0].includes(hands[0][k])) return
  const from = heldPose(0, k)
  vm[k].mesh.visible = false
  const c = hands[0][k].view.root
  c.visible = true
  c.position.copy(from.pos)
  c.quaternion.copy(from.quat)
  drag = { k, fwd: HOLD_FWD, lat: 0, from, t0: performance.now() / 1000, lastSound: null }
  sfx('pick', from.pos)
}

function releaseDrag() {
  if (!drag) return
  const d = drag
  drag = null
  const card = hands[0][d.k]
  const now = { pos: card.view.root.position.clone(), quat: card.view.root.quaternion.clone() }
  busy = true
  if (turn && inZone(now.pos, turn.baza)) {
    const { baza, resolve } = turn
    turn = null
    zoneFx.visible = false
    played[0][baza] = card
    hud('')
    // continue the shared timeline from "set": touch down, reveal toward the table, retract
    gesture(0, d.k, baza, { dur: PLAY_DURATION - 1.1, map: (t) => 1.1 + t, reveal: true, from: now, blend: 0.12 }).then(() => {
      busy = false
      resolve()
    })
    return
  }
  // not a play: the card goes back to your hand (that was a feint, or it's not your turn)
  if (!turn && now.pos.y < TABLE_Y + 0.06) hud('no es tu turno')
  schedule({
    dur: 0.32,
    stepped: false,
    update: (u) => {
      const hold = heldPose(0, d.k)
      const e = ease(u)
      card.view.root.position.copy(now.pos.clone().lerp(hold.pos, e))
      card.view.root.quaternion.copy(now.quat.clone().slerp(hold.quat, e))
      poses[0].rightWrist = card.view.root.position.clone().add(new THREE.Vector3(0, -0.05, 0))
    },
    done: () => {
      card.view.root.visible = false
      vm[d.k].mesh.visible = true
      busy = false
      sfx('toHand', heldPose(0, d.k).pos)
    },
  })
}

function updateDrag(time: number) {
  if (!drag) return
  const target = dragPose(drag)
  const b = ease(THREE.MathUtils.clamp((time - drag.t0) / 0.15, 0, 1))
  const c = hands[0][drag.k].view.root
  c.position.copy(drag.from.pos.clone().lerp(target.pos, b))
  c.quaternion.copy(drag.from.quat.clone().slerp(target.quat, b))
  const reach = THREE.MathUtils.clamp(drag.fwd / 0.55, 0, 1)
  poses[0].rightWrist =
    drag.fwd > -0.15 ? c.position.clone().addScaledVector(outOf(0), 0.075).add(new THREE.Vector3(0, 0.03, 0)) : c.position.clone().add(new THREE.Vector3(0, -0.06, 0))
  poses[0].lean = reach * 0.9
  focus = c.position
  // felt friction: a slide sound every few cm while the card skims the table
  if (drag.fwd >= 0) {
    if (!drag.lastSound || drag.lastSound.distanceTo(c.position) > 0.09) {
      if (drag.lastSound) sfx('slide', c.position, 0.45)
      drag.lastSound = c.position.clone()
    }
  } else drag.lastSound = null
}

// Short click on a card: the whole gesture plays by itself (same timeline as everyone else's).
function quickPlay(k: number) {
  if (!turn || busy || drag || !hands[0][k] || played[0].includes(hands[0][k])) return false
  const { baza, resolve } = turn
  turn = null
  zoneFx.visible = false
  hud('')
  busy = true
  playCard(0, k, baza).then(() => {
    busy = false
    resolve()
  })
  return true
}

// Click shorter than this (and without moving) = play; longer or moved = your arm takes the card.
const HOLD_SEC = 0.18
const HOLD_PX = 6
let pending: { k: number; t0: number; moved: number } | null = null
function updatePending() {
  const time = performance.now() / 1000
  if (pending && (time - pending.t0 > HOLD_SEC || pending.moved > HOLD_PX)) {
    const k = pending.k
    pending = null
    renderer.domElement.style.cursor = 'none'
    startDrag(k)
  }
}

function localTurn(baza: number) {
  return new Promise<void>((resolve) => {
    turn = { baza, resolve }
    hud('tu turno — click en una carta para jugarla, o mantené para moverla vos')
    if (auto) {
      wait(0.7).then(() => {
        if (turn?.resolve !== resolve || drag || busy) return
        const left = [0, 1, 2].filter((k) => !played[0].includes(hands[0][k]))
        quickPlay(left[Math.floor(Math.random() * left.length)])
      })
    }
  })
}

// The dotted box glows while it's your turn; brighter when the card is over it.
const zoneFx = (() => {
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 192
  const g = cv.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 6
  g.setLineDash([14, 10])
  g.strokeRect(6, 6, 116, 180)
  const tex = new THREE.CanvasTexture(cv)
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 0.06, CARD_H + 0.1),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(hex(PALETTE.chalk)).multiplyScalar(1.6), transparent: true, depthWrite: false }),
  )
  m.visible = false
  scene.add(m)
  return m
})()
function updateZone(time: number) {
  zoneFx.visible = !!turn
  if (!turn) return
  zoneFx.position.copy(zoneOf(turn.baza)).setY(TABLE_Y + 0.002)
  zoneFx.quaternion.copy(quatOf(-Math.PI / 2, yawOf(0)))
  const over = drag && inZone(hands[0][drag.k].view.root.position, turn.baza)
  ;(zoneFx.material as THREE.MeshBasicMaterial).opacity = over ? 1 : 0.25 + 0.15 * Math.sin(time * 4)
}

// Everyone grabs their own cards, squares them face-down and tosses them to the next dealer.
function gather(next: number) {
  const jobs: Promise<void>[] = []
  let pileIdx = 0
  for (let j = 0; j < N; j++) {
    const s = (dealer + 1 + j) % N
    const mine = played[s].filter(Boolean)
    const firstIdx = pileIdx
    pileIdx += mine.length
    const stackAt = playSlot(s, N, 0).pos
    let from: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion }> | null = null
    const jitter = (Math.random() - 0.5) * 0.5
    jobs.push(
      schedule({
        delay: j * 0.3,
        dur: 1.15,
        stepped: s !== 0,
        update: (_u, t) => {
          if (!from) from = mine.map((c) => ({ pos: c.view.root.position.clone(), quat: c.view.root.quaternion.clone() }))
          const squareU = ease(seg(t, 0, 0.35))
          const liftU = ease(seg(t, 0.35, 0.5))
          const tossU = seg(t, 0.5, 1.05)
          const landing = pileSlot(next, firstIdx)
          let wrist: THREE.Vector3 | undefined
          mine.forEach((c, i) => {
            const stacked = stackAt.clone().add(new THREE.Vector3(0, i * CARD_T + 0.001, 0))
            const lifted = stacked.clone().addScaledVector(outOf(s), 0.06).add(new THREE.Vector3(0, 0.08, 0))
            let p = from![i].pos.clone().lerp(stacked, squareU).lerp(lifted, liftU)
            if (tossU > 0) {
              const e = ease(tossU)
              p = lifted.clone().lerp(landing.clone().add(new THREE.Vector3(0, i * CARD_T, 0)), e)
              p.y += Math.sin(tossU * Math.PI) * (0.2 + lifted.distanceTo(landing) * 0.15)
            }
            c.view.root.position.copy(p)
            const flat = quatOf(FACE_DOWN, yawOf(s))
            const inAir = quatOf(FACE_DOWN, yawOf(s) + ease(tossU) * (yawOf(next) - yawOf(s) + jitter))
            c.view.root.quaternion.copy(from![i].quat).slerp(flat, squareU).slerp(inAir, tossU > 0 ? 1 : 0)
            if (i === 0) wrist = p.clone().addScaledVector(outOf(s), 0.07).add(new THREE.Vector3(0, 0.03, 0))
          })
          poses[s].rightWrist = t < 0.62 ? wrist : undefined
          poses[s].lean = Math.sin(seg(t, 0, 0.6) * Math.PI) * 0.8
          poses[next].leftWrist = pileBase(next).addScaledVector(outOf(next), 0.08).add(new THREE.Vector3(0, 0.05, 0))
          focus = tossU > 0 ? mine[0]?.view.root.position ?? null : stackAt
        },
        done: () => {
          mine.forEach((c) => {
            c.view.forget()
            c.revealed = false
          })
          sfx('place', pileBase(next), 0.8)
        },
      }),
    )
  }
  return Promise.all(jobs).then(() => {
    pile = Array.from({ length: N }, (_, j) => played[(dealer + 1 + j) % N]).flat().filter(Boolean)
    played = Array.from({ length: N }, () => [])
  })
}

async function mano() {
  await shuffle()
  await deal()
  await wait(0.4)
  const first = (dealer + 1) % N
  for (let baza = 0; baza < 3; baza++) {
    for (let j = 0; j < N; j++) {
      const s = (first + j) % N
      if (s === 0 && !auto) await localTurn(baza)
      else await remoteTurn(s, baza)
      await wait(0.05)
    }
    await wait(0.6)
  }
  hud('juntando…')
  await wait(1.2)
  const next = (dealer + 1) % N
  await gather(next)
  dealer = next
  hud('')
}

// ---------- cantos: stamp + duotone + everyone stares at you ----------
const stamp = document.querySelector<HTMLElement>('.stamp')!
let duo: { name: 'truco' | 'envido'; t0: number } | null = null
function canto(name: 'truco' | 'envido', text: string) {
  stamp.textContent = text
  stamp.classList.remove('on')
  void stamp.offsetWidth
  stamp.classList.add('on')
  duo = { name, t0: performance.now() / 1000 }
  stareAtYou = 1.6
  sfx('knock', polar(TABLE_R - 0.1, a0, TABLE_Y), 1)
}

// ---------- input ----------
const raycaster = new THREE.Raycaster()
let hovered = -1
function updateHover() {
  raycaster.setFromCamera(document.pointerLockElement ? new THREE.Vector2(0, 0) : mouse, camera)
  const hit = drag || busy || peek ? undefined : raycaster.intersectObjects(vm.filter((v) => v.mesh.visible).map((v) => v.mesh))[0]
  hovered = hit ? vm.findIndex((v) => v.mesh === hit.object) : -1
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  initAudio(camera)
  if (e.button === 2) { if (!drag) beginPeek(); return }
  if (e.button !== 0) return
  if (hovered >= 0) {
    renderer.domElement.setPointerCapture(e.pointerId)
    pending = { k: hovered, t0: performance.now() / 1000, moved: 0 }
  } else if (document.pointerLockElement) document.exitPointerLock() // the same click that took the view releases it
  else renderer.domElement.requestPointerLock?.()
})
const endDrag = () => {
  renderer.domElement.style.cursor = ''
  if (pending) {
    const k = pending.k
    pending = null
    if (!quickPlay(k)) {
      hud(turn ? '' : 'no es tu turno')
      vm[k].lift = 1.6 // a small nudge: the card rises and settles back
    }
    return
  }
  releaseDrag()
}
renderer.domElement.addEventListener('pointerup', (e) => { if (e.button === 0) endDrag() })
renderer.domElement.addEventListener('pointercancel', endDrag)
addEventListener('keydown', (e) => {
  initAudio(camera)
  const key = e.key.toLowerCase()
  if (key === 't') canto('truco', '¡TRUCO!')
  if (key === 'e') canto('envido', 'ENVIDO')
  if (key === 'm') hud(toggleMute() ? 'sonido apagado' : '')
  if (key === 'a') {
    auto = !auto
    hud(auto ? 'automático' : '')
  }
})
const hudEl = document.querySelector<HTMLElement>('.turn')!
function hud(text: string) { hudEl.textContent = text }

// ---------- frame ----------
const senas: Sena[] = ['ancho-espada', 'ancho-basto', 'siete-espada', 'siete-oro', 'tres', 'dos', 'falso', 'nada']
const tmp = new THREE.Vector3()
const camWorld = new THREE.Vector3()

function frame(time: number, dt: number) {
  poses = avatars.map(() => ({ lean: 0, headYaw: 0, headPitch: -0.15 }))
  // your hands hold your fan by default
  poses[0].leftWrist = viewmodel.localToWorld(new THREE.Vector3(-0.16, -0.29, -0.33))
  // right forearm rests on the table edge (out of the centre of your view) until you grab a card
  poses[0].rightWrist = polar(TABLE_R - 0.04, a0, TABLE_Y + 0.03).addScaledVector(rightOf(0), 0.2)
  focus = null
  tickJobs(time)
  updatePending()
  updateDrag(time)
  updateZone(time)
  if (lamp.update(time)) lampBuzz(new THREE.Vector3(0, 1.67, 0))

  const ts = Math.floor(time * 15) / 15
  camera.getWorldPosition(camWorld)
  stareAtYou = Math.max(0, stareAtYou - dt)
  for (const av of avatars) {
    if (av.seat === 0) {
      av.pose(poses[0])
      continue
    }
    const p = poses[av.seat]
    // who do they look at: a canto → you; otherwise the action; sometimes, just you.
    const creepy = Math.sin(ts * 0.21 + av.seat * 2.3) > 0.93
    const target = stareAtYou > 0 || (!focus && creepy) ? camWorld : focus
    if (target) {
      av.head.getWorldPosition(tmp)
      const d = av.root.worldToLocal(target.clone()).sub(av.root.worldToLocal(tmp.clone()))
      p.headYaw = THREE.MathUtils.clamp(Math.atan2(-d.x, -d.z), -1.3, 1.3)
      p.headPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
    } else p.headYaw = Math.sin(ts * 0.3 + av.seat) * 0.35
    av.pose(p)
    const cycle = (ts + av.seat * 1.7) % 11 // a seña every ~11 s, 0.8 s long
    av.sena(cycle < 0.8 ? senas[av.seat % senas.length] : 'none', Math.sin((cycle / 0.8) * Math.PI))
  }

  // camera: seated, leans in with your own reach
  yaw += (yawT - yaw) * 0.15
  // while your arm moves a card, your eyes follow it (you look at what you're placing)
  if (drag && drag.fwd > -0.05) {
    const c = hands[0][drag.k].view.root.getWorldPosition(new THREE.Vector3()).sub(eye)
    const want = clampPitch(Math.atan2(c.y, Math.hypot(c.x, c.z)) + 0.14)
    pitchT += (want - pitchT) * 0.08
  }
  pitch += (pitchT - pitch) * 0.15
  aim += (aimT - aim) * 0.12
  updateCamera()

  updateHover()
  crosshair.style.opacity = document.pointerLockElement ? '0.7' : '0'
  vm.forEach((v, k) => {
    v.lift += ((k === hovered ? 1 : 0) - v.lift) * 0.25
    v.mesh.position.set(v.base.x, v.base.y + v.lift * 0.02, v.base.z + v.lift * 0.02)
    v.mesh.rotation.z = v.base.rz * (1 - v.lift * 0.6)
  })
  lowered += ((drag || busy || stand > 0.1 ? 1 : 0) - lowered) * 0.12 // the fan drops out of the way while you play
  viewmodel.position.set(Math.sin(time * 1.3) * 0.003 - 0.04 * lowered, Math.sin(time * 2.1) * 0.002 - 0.12 * aim - 0.09 * lowered, 0)

  if (duo) {
    const u = (performance.now() / 1000 - duo.t0) / 1.6
    post.duotone(duo.name, u < 1 ? Math.sin(Math.min(u * 4, 1) * Math.PI * 0.5) * (1 - Math.max(0, (u - 0.6) / 0.4)) : 0)
    if (u >= 1) duo = null
  } else post.duotone(null, 0)

  if (q.get('raw')) {
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
  } else post.render(scene, camera, time)
}

// Seated view (yaw/pitch) → blended toward the aim target; standing up when peeking at the far half.
const lookTarget = new THREE.Vector3()
const lookMat = new THREE.Matrix4()
const Y_UP = new THREE.Vector3(0, 1, 0)
function updateCamera() {
  if (peek) {
    lookTarget.copy(peek.target)
    const onTable = peek.target.y <= TABLE_Y + 0.01
    const f = farness(peek.target)
    if (!peek.standing && onTable && f > 0.02) peek.standing = true
    else if (peek.standing && (f < -0.05 || !onTable)) peek.standing = false
  }
  stand += ((peek?.standing ? 1 : 0) - stand) * 0.08
  const st = ease(THREE.MathUtils.clamp(stand, 0, 1))

  const seated = eye.clone().addScaledVector(outOf(0), -poses[0].lean * 0.06)
  seated.y -= poses[0].lean * 0.03
  baseCam.position.copy(seated)
  baseCam.rotation.set(pitch, baseYaw + yaw, 0, 'YXZ')
  baseCam.aspect = camera.aspect
  baseCam.updateProjectionMatrix()
  baseCam.updateMatrixWorld()

  const standing = eye.clone().addScaledVector(forward0, 0.32).add(new THREE.Vector3(0, 0.48, 0)) // up and over the table
  camera.position.copy(seated).lerp(standing, st)
  const look = Math.max(aim, st)
  camera.quaternion.copy(baseCam.quaternion)
  if (look > 0.001) {
    lookMat.lookAt(camera.position, lookTarget, Y_UP)
    camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(lookMat), look)
  }
  camera.fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(58, 24, aim), 20, st)
  camera.updateProjectionMatrix()
}

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  post.resize(innerWidth, innerHeight)
}
addEventListener('resize', resize)
resize()

const timer = new THREE.Timer()
renderer.setAnimationLoop((t) => {
  timer.update(t)
  frame(timer.getElapsed(), timer.getDelta())
  document.body.dataset.ready = '1'
})

;(async () => {
  await wait(1.0)
  for (;;) await mano()
})()

// ?debug: hooks for the headless interaction test (test-drag.mjs)
if (q.has('debug')) {
  Object.assign(window, {
    __mesa: {
      vmScreen(k: number) {
        const p = vm[k].mesh.localToWorld(new THREE.Vector3(0, CARD_H * 0.45, 0)).project(camera) // visual centre
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, visible: vm[k].mesh.visible }
      },
      // screen position of seat s's baza-0 play zone (for aiming tests)
      zoneScreen(seat: number) {
        const p = playSlot(seat, N, 0).pos.project(camera)
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight }
      },
      state: () => ({
        turn: !!turn,
        dragging: !!drag,
        fwd: drag?.fwd ?? null,
        overZone: !!(drag && turn && inZone(hands[0][drag.k].view.root.position, turn.baza)),
        played: played[0].filter(Boolean).length,
        aim: Number(aim.toFixed(2)),
        standing: !!peek?.standing,
        stand: Number(stand.toFixed(2)),
        yaw: Number(yaw.toFixed(2)),
        yawMax: Number(YAW_MAX.toFixed(2)),
        hovered,
      }),
    },
  })
}
