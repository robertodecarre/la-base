import * as THREE from 'three'
import type { MesaScene, MesaEvents, Snapshot, Carta, Asiento, Equipo, Jugador, Sentido } from './contract'
import { buildLamp, buildRoom, setupAtmosphere } from './table'
import {
  EYE_R, EYE_Y, TABLE_Y, TABLE_R, CARD_W, CARD_H, CARD_Y, CARD_T, SHOULDER_R, SHOULDER_Y, CHAIR_R, MAX_BASES,
  seatAngle, polar, outOf as outOfN, rightOf as rightOfN, yawOf as yawOfN, playSlot, pileSpot, pileTwist, deckSpot,
  reachProblems, type PlayerCount,
} from './seats'
import { makeAvatar, type Avatar, type AvatarPose } from './avatar'
import { makeCardFactory, type CardView } from './cards'
import { playPose, PLAY_DURATION, PHASES } from './play'
import { makePost } from './post'
import { makeScheduler } from './jobs'
import { makeAudio } from './audio'
import { PALETTE, hex } from './look'

// La Base 3D table — PURE VIEW (piece 1a).
// The scene knows no rules, no deck order, no turns: it obeys MesaScene orders and reports the local
// player's intentions through MesaEvents. See .claude/skills/art-directing-dread-card-tables/
// references/la-base.md (rules that override the demo) and mesa-contract.ts (the contract).
// Rendering, look, post, audio, card faces and play choreography come from the skill's demo
// (examples/mesa); its game logic (bots, local shuffle, 3 fixed cards, bazas left on the felt,
// cantos, ?auto) was removed.

export interface MesaOpciones {
  raw?: boolean // no post-processing (comparison captures)
  lowHeight?: number // height of the low-res look pass (default 720)
  yaw?: number
  pitch?: number
  debug?: boolean // exposes window.__mesa3d for headless tests
}

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=VT323&display=swap'
const FACE_DOWN = Math.PI / 2
const FACE_UP = Math.PI * 1.5
const CONFIRM_TIMEOUT = 4 // s without jugarCarta(miAsiento) → the dropped card goes back to the hand
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const seg = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1)
const quatOf = (rx: number, yaw: number, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, roll, 'YXZ'))
const cartaKey = (c: Carta) => `${c.palo}-${c.valor}-${c.copia}`
const mismaCarta = (a: Carta | null, b: Carta) => !!a && a.palo === b.palo && a.valor === b.valor && a.copia === b.copia

interface Card {
  view: CardView
  carta: Carta | null // only ever known for the local hand, or after revelar
  held: boolean // sitting in its owner's fan (the world object is hidden, the fan shows it)
}
interface HeldPose { pos: THREE.Vector3; quat: THREE.Quaternion }
interface LocalPlay {
  card: Card
  confirmed: boolean
  confirm: () => void
}

function loadFonts(): { ready: Promise<void>; link: HTMLLinkElement | null } {
  let link = document.querySelector<HTMLLinkElement>(`link[href="${FONT_HREF}"]`)
  let added: HTMLLinkElement | null = null
  let sheet: Promise<unknown> = Promise.resolve()
  if (!link) {
    link = added = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    sheet = new Promise((res) => {
      link!.onload = res
      link!.onerror = res
    })
    document.head.appendChild(link)
  }
  const fonts = sheet.then(() => Promise.all([document.fonts.load('40px "IM Fell English SC"'), document.fonts.load('20px "VT323"')]))
  const timeout = new Promise((res) => setTimeout(res, 5000)) // offline: fall back to Georgia, don't hang
  return { ready: Promise.race([fonts, timeout]).then(() => undefined, () => undefined), link: added }
}

export function crearMesa(contenedor: HTMLElement, eventos: MesaEvents, opciones: MesaOpciones = {}): MesaScene {
  const fontLoad = loadFonts()
  const sched = makeScheduler()
  const audio = makeAudio()
  const cardsF = makeCardFactory()

  // ---------- DOM ----------
  const prevPosition = contenedor.style.position
  if (getComputedStyle(contenedor).position === 'static') contenedor.style.position = 'relative'
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const canvas = renderer.domElement
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', cursor: 'crosshair' })
  contenedor.prepend(canvas)
  const overlay = document.createElement('div')
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' })
  overlay.innerHTML = `
    <div data-m="turn" style="position:absolute;left:50%;top:14px;transform:translateX(-50%);font:24px 'VT323',monospace;color:${PALETTE.chalk};text-shadow:0 0 6px #000;white-space:nowrap"></div>
    <div data-m="msg" style="position:absolute;left:50%;top:44px;transform:translateX(-50%);font:20px 'VT323',monospace;color:${PALETTE.chalk};opacity:.75;text-shadow:0 0 6px #000;white-space:nowrap"></div>
    <div data-m="help" style="position:absolute;left:16px;bottom:12px;right:16px;font:18px/1.25 'VT323',monospace;color:${PALETTE.chalk};opacity:.5">click en carta: jugar · mantené click: mover el brazo y amagar (soltá en el recuadro) · clic der: zoom al cursor (en la mitad lejana te parás) · click en la mesa: mirar / soltar la vista · M: sonido</div>
    <div data-m="dot" style="position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:${PALETTE.chalk};opacity:0"></div>`
  contenedor.appendChild(overlay)
  const el = (k: string) => overlay.querySelector<HTMLElement>(`[data-m="${k}"]`)!
  const turnHud = el('turn')
  const msgHud = el('msg')
  const crosshair = el('dot')
  let msgUntil = 0
  function hud(text: string, secs = 2.2) {
    msgHud.textContent = text
    msgUntil = performance.now() / 1000 + secs
  }

  // ---------- renderer / scene (layout-independent) ----------
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(58, 1, 0.03, 30)
  scene.add(camera)
  setupAtmosphere(scene)
  const lamp = buildLamp(scene)
  const post = makePost(renderer, opciones.lowHeight ?? 720)
  let width = 1
  let height = 1

  // ---------- layout (depends on N / miAsiento / teams: built by cargarEstado) ----------
  let N: PlayerCount = 4
  let mi = 0
  let jugadores: Jugador[] = []
  let layoutKey = ''
  let room: THREE.Group | null = null
  let avatars: Avatar[] = []
  let counters: { sprite: THREE.Sprite; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; shown: number }[] = []
  const pool: Card[] = [] // every card object ever made; reused across layouts
  const toView = (a: Asiento) => (((a - mi) % N) + N) % N
  const toAbs = (v: number) => (v + mi) % N
  const outOf = (s: number) => outOfN(s, N)
  const rightOf = (s: number) => rightOfN(s, N)
  const yawOf = (s: number) => yawOfN(s, N)

  // game view state (what is on the table right now) — indices are VIEW seats (0 = me)
  let deck: Card[] = []
  let dealer = 0
  let hands: Card[][] = []
  let base: { v: number; card: Card }[] = []
  let piles: Card[][][] = []
  let turnSeat: number | null = null
  const playing = new Set<number>()
  let poses: AvatarPose[] = []
  let focus: THREE.Vector3 | null = null

  function disposeTree(root: THREE.Object3D) {
    const shared = cardsF.isShared
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry && !shared(m.geometry)) m.geometry.dispose()
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []
      for (const mat of mats) {
        if (shared(mat)) continue
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !shared(v)) v.dispose()
        mat.dispose()
      }
    })
  }

  function buildLayout(n: PlayerCount, miAsiento: Asiento, js: Jugador[]) {
    const teams: Equipo[] = []
    for (let v = 0; v < n; v++) teams[v] = js.find((j) => j.asiento === (v + miAsiento) % n)?.equipo ?? ((v + miAsiento) % 2 ? 'visitante' : 'local')
    const key = `${n}|${miAsiento}|${teams.join(',')}`
    N = n
    mi = miAsiento
    jugadores = js
    if (key === layoutKey) return
    layoutKey = key
    const problems = reachProblems(n)
    if (problems.length) throw new Error(`mesa3d: geometry out of reach — ${problems.join('; ')}`)
    if (room) {
      scene.remove(room)
      disposeTree(room)
    }
    avatars.forEach((a) => {
      scene.remove(a.root)
      disposeTree(a.root)
    })
    counters.forEach((c) => {
      scene.remove(c.sprite)
      c.tex.dispose()
      c.sprite.material.dispose()
    })
    room = buildRoom(n, teams)
    scene.add(room)
    avatars = []
    for (let s = 0; s < n; s++) {
      const av = makeAvatar(s, n, teams[s], cardsF, s === 0)
      scene.add(av.root)
      avatars.push(av)
    }
    counters = Array.from({ length: n }, (_, s) => makeCounter(s))
    fanCount = []
    setupCamera()
  }

  // Won-bases counter: a small LED-green number over each pile. A sprite always faces the viewer,
  // so the count reads from every seat (it is central game information).
  function makeCounter(s: number) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, depthWrite: false, fog: false }))
    sprite.scale.set(0.065, 0.065, 1)
    sprite.position.copy(pileSpot(s, N, 0)).addScaledVector(rightOf(s), 0.07).addScaledVector(outOf(s), -0.07).setY(TABLE_Y + 0.07)
    sprite.visible = false
    scene.add(sprite)
    return { sprite, tex, cv, shown: -1 }
  }
  function updateCounters() {
    counters.forEach((c, s) => {
      const count = piles[s]?.length ?? 0
      c.sprite.visible = count > 0
      if (count === c.shown) return
      c.shown = count
      const g = c.cv.getContext('2d')!
      g.clearRect(0, 0, 64, 64)
      g.fillStyle = 'rgba(11,9,8,0.75)'
      g.fillRect(6, 6, 52, 52)
      g.strokeStyle = PALETTE.led
      g.lineWidth = 2
      g.strokeRect(6, 6, 52, 52)
      g.fillStyle = PALETTE.led
      g.font = '48px "VT323", monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(count), 32, 34)
      c.tex.needsUpdate = true
    })
  }

  function takeCard(): Card {
    const free = pool.find((c) => !inUse.has(c))
    const card = free ?? { view: cardsF.makeCard(), carta: null, held: false }
    if (!free) {
      pool.push(card)
      scene.add(card.view.root)
    }
    inUse.add(card)
    return card
  }
  const inUse = new Set<Card>()

  // ---------- camera: my seat, mouse = head ----------
  let a0 = seatAngle(0, 4)
  let eye = new THREE.Vector3()
  let baseYaw = 0
  let YAW_MAX = 0.5
  let forward0 = new THREE.Vector3()
  let shoulder0 = new THREE.Vector3()
  let edge0 = new THREE.Vector3()
  const LOOK_SENS = 0.0012
  const ARM_SENS = 0.0009
  const PEEK_SENS = 0.0005
  const PITCH_MIN = -0.8
  const PITCH_MAX = 0.25
  const clampYaw = (v: number) => THREE.MathUtils.clamp(v, -YAW_MAX, YAW_MAX)
  const clampPitch = (v: number) => THREE.MathUtils.clamp(v, PITCH_MIN, PITCH_MAX)
  let yaw = 0
  let pitch = clampPitch(opciones.pitch ?? -0.36)
  let yawT = 0
  let pitchT = pitch
  function setupCamera() {
    a0 = seatAngle(0, N)
    eye = polar(EYE_R, a0, EYE_Y)
    baseYaw = Math.PI / 2 - a0
    // Head turn: just enough to see the adjacent players' faces (see table-avatars-camera.md).
    YAW_MAX = (Math.PI - (2 * Math.PI) / N) / 2 - 0.2
    yaw = yawT = clampYaw(opciones.yaw ?? yaw)
    forward0 = new THREE.Vector3(-Math.cos(a0), 0, -Math.sin(a0))
    shoulder0 = polar(SHOULDER_R, a0, SHOULDER_Y).addScaledVector(rightOf(0), 0.19)
    edge0 = polar(TABLE_R, a0, 0)
  }
  const mouse = new THREE.Vector2(0, 0)
  let aim = 0
  let lowered = 0
  let aimT = 0
  interface Peek { target: THREE.Vector3; standing: boolean }
  let peek: Peek | null = null
  let stand = 0
  const baseCam = new THREE.PerspectiveCamera(58, 1, 0.03, 30)
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y)
  const farness = (p: THREE.Vector3) => p.clone().setY(0).dot(forward0)
  const locked = () => document.pointerLockElement === canvas

  function beginPeek() {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(locked() ? new THREE.Vector2(0, 0) : mouse, baseCam)
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
    if (peek && locked()) {
      const d = peek.target.clone().sub(eye)
      yaw = yawT = clampYaw(Math.atan2(-d.x, -d.z) - baseYaw)
      pitch = pitchT = clampPitch(Math.atan2(d.y, Math.hypot(d.x, d.z)))
    }
    peek = null
  }

  // ---------- my own hand (viewmodel): 1..10 cards, held in the LEFT hand, off to the side ----------
  const viewmodel = new THREE.Group()
  camera.add(viewmodel)
  const vmGeo = new THREE.PlaneGeometry(CARD_W, CARD_H)
  vmGeo.translate(0, CARD_H * 0.45, 0) // pivot near the bottom: fan from the grip
  const vm = Array.from({ length: MAX_BASES }, () => {
    const mat = new THREE.MeshStandardMaterial({ map: cardsF.backTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: cardsF.backTex, emissiveIntensity: 0.25 })
    const m = new THREE.Mesh(vmGeo, mat)
    m.visible = false
    viewmodel.add(m)
    return { mesh: m, mat, face: '', base: { x: 0, y: 0, z: 0, rz: 0 }, lift: 0, placed: false }
  })
  // Fan geometry for c cards: spread and twist shrink as the hand grows so every index stays visible,
  // and big hands shift further left so the fan never covers my own play zone (checked at 10 cards).
  function vmBase(k: number, c: number) {
    const d = k - (c - 1) / 2
    const xStep = c > 1 ? Math.min(0.03, 0.17 / (c - 1)) : 0
    const rStep = c > 1 ? Math.min(0.2, 0.8 / (c - 1)) : 0
    const cx = -0.13 - 0.012 * Math.max(0, c - 3)
    return { x: cx + d * xStep, y: -0.25 - Math.abs(d) * 0.002, z: -0.36 + k * 0.002, rz: -0.08 - d * rStep }
  }
  function setVmFace(k: number, c: Carta) {
    const key = `${c.palo}${c.valor}` // both copies render identically
    if (vm[k].face === key) return
    const tex = cardsF.faceTexture(c.palo, c.valor)
    vm[k].mat.map = tex
    vm[k].mat.emissiveMap = tex
    vm[k].mat.needsUpdate = true
    vm[k].face = key
  }
  function layoutVm(snap: boolean) {
    const hand = hands[0] ?? []
    vm.forEach((v, k) => {
      const card = hand[k]
      v.mesh.visible = !!card && card.held
      if (!card) return
      if (card.carta) setVmFace(k, card.carta)
      v.base = vmBase(k, hand.length)
      if (snap || !v.placed) {
        v.mesh.position.set(v.base.x, v.base.y, v.base.z)
        v.mesh.rotation.set(-0.35, 0, v.base.rz)
        v.placed = true
      }
    })
  }

  // ---------- held poses / fans ----------
  let fanCount: number[] = []
  function syncFans() {
    for (let s = 1; s < N; s++) {
      const av = avatars[s]
      if (!av) continue
      const hand = hands[s] ?? []
      if (fanCount[s] !== hand.length) {
        av.layoutHand(Math.max(1, hand.length))
        fanCount[s] = hand.length
      }
      av.hand.forEach((c, k) => (c.root.visible = !!hand[k]?.held))
    }
  }
  // Where a held card lives in world space (target of the deal, start of a play).
  function heldPose(s: number, k: number): HeldPose {
    if (s === 0) syncFans()
    const o = s === 0 ? vm[Math.min(k, MAX_BASES - 1)].mesh : avatars[s].hand[Math.min(k, MAX_BASES - 1)].root
    o.updateWorldMatrix(true, false)
    return { pos: o.getWorldPosition(new THREE.Vector3()), quat: o.getWorldQuaternion(new THREE.Quaternion()) }
  }
  const cardPose = (c: Card): HeldPose => ({ pos: c.view.root.position.clone(), quat: c.view.root.quaternion.clone() })
  function place(c: Card, pos: THREE.Vector3, quat: THREE.Quaternion) {
    c.view.root.visible = true
    c.view.root.position.copy(pos)
    c.view.root.quaternion.copy(quat)
  }

  const deckSlot = (d: number, i: number) => deckSpot(d, N).add(new THREE.Vector3(0, i * CARD_T, 0))
  const deckQuat = (d: number, jitter = 0) => quatOf(FACE_DOWN, yawOf(d) + jitter)
  const pileSlot = (s: number, b: number, i: number) => pileSpot(s, N, b).add(new THREE.Vector3(0, i * CARD_T, 0))
  const pileQuat = (s: number, b: number) => quatOf(FACE_DOWN, yawOf(s) + pileTwist(b))
  // Final resting pose of a played card (end of the shared play timeline): cargarEstado uses the
  // SAME function, so a reconnect draws the base exactly where the animation left it.
  function restedPose(s: number): HeldPose {
    const p = playPose(s, N, PLAY_DURATION)
    return { pos: p.cardPos, quat: new THREE.Quaternion().setFromEuler(p.cardRot) }
  }

  // ---------- order queue ----------
  // Orders animate one after another (barajar → repartir → jugadas → ganaBase…). cargarEstado
  // abandons the whole queue and every running animation and redraws from the snapshot.
  let loaded = false
  let tail: Promise<unknown> = fontLoad.ready
  let epoch = 0
  // My own drop runs outside the queue (it starts on my click, before the server answers); orders
  // queued behind it (next turno, ganaBase…) wait until it has finished.
  let localDone: Promise<void> = Promise.resolve()
  function enqueue(name: string, fn: () => Promise<void> | void) {
    const my = epoch
    tail = tail
      .then(() => localDone)
      .then(() => {
        if (my !== epoch || destroyed) return
        if (!loaded) return console.warn(`mesa3d: ${name} ignored before cargarEstado`)
        return fn()
      })
      .catch((e) => console.error(`mesa3d: ${name} failed`, e))
  }
  // revelar() is NOT queued: the play waiting for it is what's running.
  const revealWaiters = new Map<number, (c: Carta) => void>()
  const earlyReveals = new Map<number, Carta>()
  function revealFor(v: number, card: Card): Promise<Carta> {
    const early = earlyReveals.get(v)
    if (early) {
      earlyReveals.delete(v)
      return Promise.resolve(early)
    }
    // keep the hand on the face-down card while the server decides (no arm snapping back)
    const stop = sched.loop((/*t*/) => {
      const p = playPose(v, N, PHASES.reveal[0])
      poses[v].rightWrist = card.view.root.position.clone().addScaledVector(outOf(v), 0.075).add(new THREE.Vector3(0, 0.03, 0))
      poses[v].lean = 0.6
      poses[v].headPitch = p.headPitch
      focus = card.view.root.position
    }, v !== 0)
    return new Promise((res) =>
      revealWaiters.set(v, (c) => {
        stop()
        res(c)
      }),
    )
  }

  // ---------- card gestures (shared play timeline, pure function of t) ----------
  interface GestureOpts {
    dur: number
    map: (t: number) => number // gesture time → time on the play timeline (playPose)
    from?: HeldPose // start from where the card really is (local drag)
    blend?: number
    hold: THREE.Vector3
    reveal?: Carta // identity to show once the face turns toward the table
  }
  function gesture(s: number, card: Card, o: GestureOpts) {
    const start = o.from ?? cardPose(card)
    place(card, start.pos, start.quat)
    let lastPt = o.map(0)
    return sched.schedule({
      dur: o.dur,
      stepped: s !== 0,
      update: (_u, t) => {
        const pt = o.map(t)
        const pose = playPose(s, N, pt, o.hold)
        const b = ease(seg(t, 0, o.blend ?? 0.3)) // blend out of the exact spot it was
        card.view.root.position.copy(start.pos.clone().lerp(pose.cardPos, b))
        card.view.root.quaternion.copy(start.quat.clone().slerp(new THREE.Quaternion().setFromEuler(pose.cardRot), b))
        poses[s].rightWrist = pose.wrist
        poses[s].lean = pose.lean
        poses[s].headPitch = pose.headPitch
        focus = card.view.root.position
        // identity only once the server revealed it AND the face turns up
        if (o.reveal && pose.faceVisible && !card.carta) {
          card.carta = o.reveal
          card.view.setIdentity(o.reveal.palo, o.reveal.valor)
        }
        const at = card.view.root.position
        const crossed = (edge: number) => lastPt < edge && pt >= edge
        if (crossed(0.02)) audio.sfx('pick', at)
        if (crossed(0.6)) audio.sfx('slide', at, 0.8)
        if (crossed(1.12)) audio.sfx('place', at)
        if (o.reveal && crossed(1.32)) audio.sfx('flip', at)
        lastPt = pt
      },
    })
  }

  // Second half of any play: wait for revelar, flip toward the centre, retract.
  async function finishPlay(s: number, card: Card, hold: THREE.Vector3) {
    const carta = await revealFor(s, card)
    if (s === 0) card.carta = null // own card: the world object shows the face only on the reveal too
    await gesture(s, card, { dur: PLAY_DURATION - PHASES.reveal[0], map: (t) => PHASES.reveal[0] + t, hold, reveal: carta, blend: 0.01 })
    playing.delete(s)
  }

  // Another seat (or me, without a pending drop) plays: the card leaves the fan face-down, SIN identidad.
  async function playFromHand(s: number) {
    const hand = hands[s]
    if (!hand?.length) return console.warn(`mesa3d: jugarCarta(${toAbs(s)}) but that hand is empty`)
    let k = Math.floor((hand.length - 1) / 2)
    if (s === 0 && lastIntent) {
      const i = hand.findIndex((c) => mismaCarta(c.carta, lastIntent!))
      if (i >= 0) k = i
    }
    const from = heldPose(s, k)
    const card = hand[k]
    hand.splice(k, 1)
    card.held = false
    const known = card.carta
    card.carta = null
    card.view.forget()
    base.push({ v: s, card })
    playing.add(s)
    if (s === turnSeat) turnSeat = null
    await gesture(s, card, { dur: PHASES.reveal[0], map: (t) => t, from, hold: from.pos, blend: 0.05 })
    if (s === 0 && known) {
      // my own card: if the server revealed another one of my cards, swap which fan card left
      const carta = await revealFor(0, card)
      const other = hands[0].find((c) => mismaCarta(c.carta, carta))
      if (other && !mismaCarta(known, carta)) other.carta = known
      earlyReveals.set(0, carta)
    }
    await finishPlay(s, card, from.pos)
  }

  // ---------- my arm: hold click on a card, drag to reach, release on the zone to play ----------
  let localPlay: LocalPlay | null = null
  let lastIntent: Carta | null = null
  let busy = false // a local drop / return animation is running
  interface Drag { k: number; card: Card; fwd: number; lat: number; from: HeldPose; t0: number; lastSound: THREE.Vector3 | null }
  let drag: Drag | null = null
  const HOLD_FWD = -0.35 // "fwd" = metres past your table edge; negative = back toward your chest
  const REACH = 0.78
  const HOVER_Y = TABLE_Y + 0.025
  const myTurn = () => turnSeat === 0 && !localPlay && !playing.has(0)

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
  const zonePos = () => playSlot(0, N).pos
  function inZone(pos: THREE.Vector3) {
    const d = pos.clone().sub(zonePos())
    return Math.abs(d.dot(rightOf(0))) < CARD_W / 2 + 0.03 && Math.abs(d.dot(outOf(0))) < CARD_H / 2 + 0.05 && pos.y < TABLE_Y + 0.06
  }

  function startDrag(k: number) {
    const card = hands[0]?.[k]
    if (drag || busy || localPlay || !card?.held) return
    const from = heldPose(0, k)
    card.held = false
    place(card, from.pos, from.quat)
    drag = { k, card, fwd: HOLD_FWD, lat: 0, from, t0: performance.now() / 1000, lastSound: null }
    audio.sfx('pick', from.pos)
  }

  // Intention sent; the card waits on the zone, face-down, until the server confirms (jugarCarta)
  // or not (timeout / someone else's turn → back to the hand).
  async function dropAndWait(k: number, card: Card, first: Promise<void>) {
    const carta = card.carta!
    lastIntent = carta
    let confirmResolve = () => {}
    const confirmed = new Promise<void>((res) => (confirmResolve = res))
    const lp: LocalPlay = { card, confirmed: false, confirm: () => { lp.confirmed = true; confirmResolve() } }
    localPlay = lp
    eventos.alSoltarCarta({ ...carta })
    await first
    const my = epoch
    const timedOut = await Promise.race([confirmed.then(() => false), sched.wait(CONFIRM_TIMEOUT).then(() => true)])
    if (my !== epoch || localPlay !== lp) return
    localPlay = null
    busy = false
    if (timedOut && !lp.confirmed) return returnToHand(card)
    // confirmed: the card leaves the hand for good and joins the base
    const i = hands[0].indexOf(card)
    if (i >= 0) hands[0].splice(i, 1)
    card.carta = null
    card.view.forget()
    base.push({ v: 0, card })
    playing.add(0)
    if (turnSeat === 0) turnSeat = null
    await finishPlay(0, card, heldPose(0, Math.max(0, Math.min(k, hands[0].length - 1))).pos)
  }

  function returnToHand(card: Card, msg = '') {
    if (msg) hud(msg)
    const now = cardPose(card)
    busy = true
    sched.schedule({
      dur: 0.32,
      stepped: false,
      update: (u) => {
        const k = Math.max(0, hands[0].indexOf(card))
        const hold = heldPose(0, k)
        const e = ease(u)
        card.view.root.position.copy(now.pos.clone().lerp(hold.pos, e))
        card.view.root.quaternion.copy(now.quat.clone().slerp(hold.quat, e))
        poses[0].rightWrist = card.view.root.position.clone().add(new THREE.Vector3(0, -0.05, 0))
      },
      done: () => {
        card.view.root.visible = false
        if (hands[0].includes(card)) card.held = true
        busy = false
        audio.sfx('toHand', card.view.root.position)
      },
    })
  }

  function releaseDrag() {
    if (!drag) return
    const d = drag
    drag = null
    const now = cardPose(d.card)
    if (myTurn() && inZone(now.pos) && d.card.carta) {
      busy = true
      // continue the shared timeline from "set": touch down face-down, then wait for the server
      const first = gesture(0, d.card, { dur: PHASES.reveal[0] - PHASES.set[0], map: (t) => PHASES.set[0] + t, from: now, blend: 0.12, hold: d.from.pos })
      localDone = dropAndWait(d.k, d.card, first)
      return
    }
    // not a play: the card goes back to your hand (that was a feint, or it's not your turn)
    returnToHand(d.card, turnSeat !== 0 && now.pos.y < TABLE_Y + 0.06 ? 'no es tu turno' : '')
  }

  function updateDrag(time: number) {
    if (!drag) return
    const target = dragPose(drag)
    const b = ease(THREE.MathUtils.clamp((time - drag.t0) / 0.15, 0, 1))
    const c = drag.card.view.root
    c.position.copy(drag.from.pos.clone().lerp(target.pos, b))
    c.quaternion.copy(drag.from.quat.clone().slerp(target.quat, b))
    const reach = THREE.MathUtils.clamp(drag.fwd / 0.55, 0, 1)
    poses[0].rightWrist =
      drag.fwd > -0.15 ? c.position.clone().addScaledVector(outOf(0), 0.075).add(new THREE.Vector3(0, 0.03, 0)) : c.position.clone().add(new THREE.Vector3(0, -0.06, 0))
    poses[0].lean = reach * 0.9
    focus = c.position
    presence.arm(drag.fwd, drag.lat)
    // felt friction: a slide sound every few cm while the card skims the table
    if (drag.fwd >= 0) {
      if (!drag.lastSound || drag.lastSound.distanceTo(c.position) > 0.09) {
        if (drag.lastSound) audio.sfx('slide', c.position, 0.45)
        drag.lastSound = c.position.clone()
      }
    } else drag.lastSound = null
  }

  // Short click on a card: the gesture runs by itself (same timeline as everyone else's) up to the
  // point where the card rests face-down on the zone; the server's jugarCarta lets it continue.
  function quickPlay(k: number) {
    const card = hands[0]?.[k]
    if (!myTurn() || busy || drag || !card?.held || !card.carta) return false
    const from = heldPose(0, k)
    card.held = false
    busy = true
    const first = gesture(0, card, { dur: PHASES.reveal[0], map: (t) => t, from, hold: from.pos, blend: 0.05 })
    localDone = dropAndWait(k, card, first)
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
      canvas.style.cursor = 'none'
      startDrag(k)
    }
  }

  // The dotted box glows on the seat whose turn it is; brighter when it's mine and the card is over it.
  const zoneTex = (() => {
    const cv = document.createElement('canvas')
    cv.width = 128
    cv.height = 192
    const g = cv.getContext('2d')!
    g.strokeStyle = '#fff'
    g.lineWidth = 6
    g.setLineDash([14, 10])
    g.strokeRect(6, 6, 116, 180)
    return new THREE.CanvasTexture(cv)
  })()
  const zoneFx = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 0.06, CARD_H + 0.1),
    new THREE.MeshBasicMaterial({ map: zoneTex, color: new THREE.Color(hex(PALETTE.chalk)).multiplyScalar(1.6), transparent: true, depthWrite: false }),
  )
  zoneFx.visible = false
  scene.add(zoneFx)
  const chalkGlow = new THREE.Color(hex(PALETTE.chalk)).multiplyScalar(1.6)
  const turnGlow = new THREE.Color(hex(PALETTE.chalk)).multiplyScalar(2.6) // > 1 linear: blooms a little
  function updateTurn(time: number) {
    const s = turnSeat
    const show = s !== null && !playing.has(s) && !(s === 0 && localPlay)
    zoneFx.visible = show
    if (show) {
      zoneFx.position.copy(playSlot(s!, N).pos).setY(TABLE_Y + 0.002)
      zoneFx.quaternion.copy(quatOf(-Math.PI / 2, yawOf(s!)))
      const over = s === 0 && drag && inZone(drag.card.view.root.position)
      // someone else's turn: a larger box around their chalk box, bright enough to read across the table
      zoneFx.scale.setScalar(s === 0 ? 1 : 1.18)
      ;(zoneFx.material as THREE.MeshBasicMaterial).color.copy(s === 0 ? chalkGlow : turnGlow)
      ;(zoneFx.material as THREE.MeshBasicMaterial).opacity = over ? 1 : s === 0 ? 0.3 + 0.2 * Math.sin(time * 4) : 0.6 + 0.25 * Math.sin(time * 3)
    }
    // Always-visible turn line (HUD, VT323): whose turn, named.
    const txt = !show ? '' : s === 0 ? 'tu turno' : `turno: ${nameOf(s!)}`
    if (turnHud.textContent !== txt) turnHud.textContent = txt
    if (msgUntil && performance.now() / 1000 > msgUntil) {
      msgHud.textContent = ''
      msgUntil = 0
    }
  }
  const nameOf = (v: number) => jugadores.find((j) => j.asiento === toAbs(v))?.nombre ?? `asiento ${toAbs(v)}`

  // ---------- table orders ----------
  // Everything off the deck (won piles, a stray base, leftover hands) goes back to the dealer, one
  // toss per seat, before the shuffle. (The demo did this per mano with its own gather.)
  function gatherTo(d: number) {
    const jobs: Promise<void>[] = []
    let next = deck.length
    let j = 0
    for (let k = 0; k < N; k++) {
      const s = (d - 1 - k + N * 2) % N
      const mine: Card[] = [...(piles[s] ?? []).flat(), ...base.filter((b) => b.v === s).map((b) => b.card), ...(hands[s] ?? [])]
      if (!mine.length) continue
      mine.forEach((c, i) => {
        if (c.held) {
          const h = heldPose(s, i)
          place(c, h.pos, h.quat)
          c.held = false
        }
      })
      const firstIdx = next
      next += mine.length
      const stackAt = pileSlot(s, 0, 0)
      let from: HeldPose[] | null = null
      const jitter = ((j * 0.37) % 1) - 0.5
      jobs.push(
        sched.schedule({
          delay: j * 0.25,
          dur: 1.0,
          stepped: s !== 0,
          update: (_u, t) => {
            if (!from) from = mine.map(cardPose)
            const squareU = ease(seg(t, 0, 0.3))
            const liftU = ease(seg(t, 0.3, 0.45))
            const tossU = seg(t, 0.45, 0.95)
            const landing = deckSlot(d, firstIdx)
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
              const inAir = quatOf(FACE_DOWN, yawOf(s) + ease(tossU) * (yawOf(d) - yawOf(s) + jitter))
              c.view.root.quaternion.copy(from![i].quat).slerp(flat, squareU).slerp(inAir, tossU > 0 ? 1 : 0)
              if (i === 0) wrist = p.clone().addScaledVector(outOf(s), 0.07).add(new THREE.Vector3(0, 0.03, 0))
            })
            poses[s].rightWrist = t < 0.55 ? wrist : undefined
            poses[s].lean = Math.sin(seg(t, 0, 0.55) * Math.PI) * 0.8
            focus = tossU > 0 ? mine[0].view.root.position : stackAt
          },
          done: () => {
            mine.forEach((c, i) => {
              c.carta = null
              c.view.forget()
              place(c, deckSlot(d, firstIdx + i), deckQuat(d))
            })
            audio.sfx('place', deckSpot(d, N), 0.8)
          },
        }),
      )
      deck.push(...mine)
      j++
    }
    for (let s = 0; s < N; s++) {
      piles[s] = []
      hands[s] = []
    }
    base = []
    return Promise.all(jobs)
  }

  function shuffle(d: number) {
    const base0 = deckSpot(d, N)
    const R = rightOf(d)
    const n = deck.length
    const half = Math.ceil(n / 2)
    const inter: number[] = []
    for (let i = 0; i < half; i++) {
      inter.push(i)
      if (half + i < n) inter.push(half + i)
    }
    const rankOf = new Map(inter.map((idx, m) => [idx, m]))
    const jit = deck.map((_, i) => (Math.sin(i * 12.9898) * 0.5) * 0.25) // cosmetic only (no card identity here)
    const cards = [...deck]
    audio.sfx('shuffle', base0)
    return sched.schedule({
      dur: 1.7,
      stepped: d !== 0,
      update: (_u, t) => {
        cards.forEach((c, i) => {
          const side = i < half ? -1 : 1
          const inHalf = i < half ? i : i - half
          const split = base0.clone().addScaledVector(R, side * 0.075).add(new THREE.Vector3(0, inHalf * CARD_T, 0))
          const m = rankOf.get(i)!
          const back = base0.clone().add(new THREE.Vector3(0, m * CARD_T, 0))
          const sU = ease(seg(t, 0, 0.4))
          const rU = ease(seg(t, 0.45 + (m / n) * 0.55, 0.45 + (m / n) * 0.55 + 0.15))
          const p = deckSlot(d, i).lerp(split, sU).lerp(back, rU)
          p.y += Math.sin(rU * Math.PI) * 0.012
          c.view.root.position.copy(p)
          c.view.root.quaternion.copy(deckQuat(d, jit[i] * (1 - ease(seg(t, 1.2, 1.5)))))
        })
        const wob = Math.sin(t * 30) * 0.004
        poses[d].rightWrist = base0.clone().addScaledVector(R, 0.08).add(new THREE.Vector3(0, 0.05 + wob, 0)).addScaledVector(outOf(d), 0.06)
        poses[d].leftWrist = base0.clone().addScaledVector(R, -0.08).add(new THREE.Vector3(0, 0.05 - wob, 0)).addScaledVector(outOf(d), 0.06)
        poses[d].lean = 0.5
        poses[d].headPitch = -0.5
        focus = base0
      },
      done: () => {
        deck = inter.map((i) => cards[i])
        deck.forEach((c, i) => place(c, deckSlot(d, i), deckQuat(d)))
        audio.sfx('place', base0, 0.5)
      },
    })
  }

  async function doBarajar(d: number) {
    dealer = d
    turnSeat = null
    await gatherTo(d)
    await shuffle(d)
  }

  // Deal round by round, seat by seat, in playing order (antihorario = decreasing seat), starting
  // with the seat after the dealer. Each client only knows its own cards (miMano).
  function doRepartir(d: number, cpp: number, miMano: Carta[]) {
    dealer = d
    const per = Math.min(cpp, MAX_BASES)
    for (let s = 0; s < N; s++) {
      hands[s] = []
      piles[s] = piles[s] ?? []
    }
    const jobs: Promise<void>[] = []
    let step = 0
    for (let k = 0; k < per; k++)
      for (let j = 1; j <= N; j++) {
        const s = (d - j + N * 2) % N
        const card = deck.pop()
        if (!card) continue
        card.carta = s === 0 ? (miMano[k] ? { ...miMano[k] } : null) : null
        card.held = false
        card.view.forget()
        hands[s][k] = card
        let from: HeldPose | null = null
        jobs.push(
          sched.schedule({
            delay: step * 0.14,
            dur: 0.45,
            stepped: d !== 0,
            update: (u) => {
              if (!from) {
                from = cardPose(card)
                audio.sfx('toss', from.pos, 0.7)
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
              card.held = true
              audio.sfx('toHand', heldPose(s, k).pos)
            },
          }),
        )
        step++
      }
    return Promise.all(jobs).then(() => undefined)
  }

  // ganaBase: the winner rakes the single base toward himself, squares it, turns it face-down and
  // sets it on his won pile (gesture `collect`, ~1.2 s, 15 fps when remote).
  const COLLECT_DUR = 1.2
  function collect(w: number) {
    const cards = base.map((b) => b.card)
    base = []
    if (!piles[w]) piles[w] = []
    const b = piles[w].length
    if (!cards.length) {
      piles[w].push([])
      return Promise.resolve()
    }
    const a = seatAngle(w, N)
    const out = outOf(w)
    const gather = polar(0.52, a, CARD_Y)
    const upQ = quatOf(FACE_UP, yawOf(w))
    const downQ = quatOf(FACE_DOWN, yawOf(w))
    const rest = polar(CHAIR_R - 0.33, a, 1.0)
    let from: HeldPose[] | null = null
    let lastT = 0
    return sched.schedule({
      dur: COLLECT_DUR,
      stepped: w !== 0,
      update: (_u, t) => {
        if (!from) from = cards.map(cardPose)
        const reachU = ease(seg(t, 0, 0.25))
        const rakeU = ease(seg(t, 0.2, 0.6))
        const flipU = ease(seg(t, 0.6, 0.8))
        const carryU = ease(seg(t, 0.8, 1.15))
        const center = new THREE.Vector3()
        cards.forEach((c, i) => {
          const stack = gather.clone().add(new THREE.Vector3(0, i * CARD_T + 0.001, 0))
          const p = from![i].pos.clone().lerp(stack, rakeU)
          const q = from![i].quat.clone().slerp(upQ, rakeU)
          if (flipU > 0) {
            p.y += Math.sin(flipU * Math.PI) * 0.04
            q.slerp(downQ, flipU)
          }
          if (carryU > 0) {
            const dest = pileSlot(w, b, i)
            p.lerp(dest, carryU)
            p.y += Math.sin(carryU * Math.PI) * 0.05
            q.slerp(pileQuat(w, b), carryU)
          }
          c.view.root.position.copy(p)
          c.view.root.quaternion.copy(q)
          center.add(p)
        })
        center.divideScalar(cards.length)
        const onStack = center.clone().addScaledVector(out, 0.07).add(new THREE.Vector3(0, 0.035, 0))
        const reachTo = gather.clone().addScaledVector(out, 0.07).add(new THREE.Vector3(0, 0.04, 0))
        poses[w].rightWrist = t < 0.6 ? rest.clone().lerp(t < 0.2 ? reachTo : onStack, t < 0.2 ? reachU : 1) : t < 1.15 ? onStack : undefined
        poses[w].lean = Math.sin(seg(t, 0, 1.15) * Math.PI) * 0.9
        poses[w].headPitch = -0.45
        focus = center
        const crossed = (edge: number) => lastT < edge && t >= edge
        if (crossed(0.2)) audio.sfx('slide', gather, 0.9)
        if (crossed(0.62)) audio.sfx('flip', gather, 0.8)
        if (crossed(1.12)) audio.sfx('place', pileSpot(w, N, b), 0.8)
        lastT = t
      },
      done: () => {
        cards.forEach((c, i) => {
          c.carta = null
          c.view.forget()
          place(c, pileSlot(w, b, i), pileQuat(w, b))
        })
        piles[w].push(cards)
      },
    })
  }

  // ---------- cargarEstado: full redraw, no animation ----------
  function applySnapshot(s: Snapshot) {
    buildLayout(s.cantJugadores, s.miAsiento, s.jugadores)
    loaded = true
    drag = null
    pending = null
    localPlay = null
    busy = false
    playing.clear()
    revealWaiters.clear()
    earlyReveals.clear()
    canvas.style.cursor = ''
    inUse.clear()
    pool.forEach((c) => {
      c.view.root.visible = false
      c.view.forget()
      c.carta = null
      c.held = false
    })
    dealer = toView(s.pie)
    hands = Array.from({ length: N }, () => [])
    piles = Array.from({ length: N }, () => [])
    base = []
    for (let v = 1; v < N; v++) {
      const count = Math.min(MAX_BASES, s.cartasEnManoPorAsiento[toAbs(v)] ?? 0)
      for (let k = 0; k < count; k++) {
        const c = takeCard()
        c.held = true
        hands[v].push(c)
      }
    }
    s.miMano.slice(0, MAX_BASES).forEach((carta) => {
      const c = takeCard()
      c.carta = { ...carta }
      c.held = true
      hands[0].push(c)
    })
    for (const b of s.baseActual) {
      const v = toView(b.asiento)
      const c = takeCard()
      c.carta = { ...b.carta }
      c.view.setIdentity(b.carta.palo, b.carta.valor)
      const r = restedPose(v)
      place(c, r.pos, r.quat)
      base.push({ v, card: c })
    }
    for (let v = 0; v < N; v++) {
      const won = Math.min(MAX_BASES, s.basesGanadasPorAsiento[toAbs(v)] ?? 0)
      for (let b = 0; b < won; b++) {
        const stack: Card[] = []
        for (let i = 0; i < N; i++) {
          const c = takeCard()
          place(c, pileSlot(v, b, i), pileQuat(v, b))
          stack.push(c)
        }
        piles[v].push(stack)
      }
    }
    // the rest of the deck(s) sits in front of the dealer
    const deckSize = N === 8 ? 80 : 40
    const left = Math.max(0, deckSize - inUse.size)
    deck = []
    for (let i = 0; i < left; i++) {
      const c = takeCard()
      place(c, deckSlot(dealer, i), deckQuat(dealer))
      deck.push(c)
    }
    turnSeat = s.turno === null ? null : toView(s.turno)
    fanCount = []
    syncFans()
    layoutVm(true)
    updateCounters()
  }

  // ---------- presence (throttled, the adapter rate-limits again) ----------
  const presence = (() => {
    let lastLook = 0
    let lastYaw = 0
    let lastPitch = 0
    let lastArm = 0
    let lastHover: number | null = null
    return {
      look(now: number) {
        if (now - lastLook < 1 / 15) return
        if (Math.abs(yaw - lastYaw) < 0.0087 && Math.abs(pitch - lastPitch) < 0.0087) return
        lastLook = now
        lastYaw = yaw
        lastPitch = pitch
        eventos.alMirar(yaw, pitch)
      },
      arm(fwd: number, lat: number) {
        const now = performance.now() / 1000
        if (now - lastArm < 1 / 15) return
        lastArm = now
        eventos.alMoverBrazo(fwd, lat)
      },
      hover(i: number | null) {
        if (i === lastHover) return
        lastHover = i
        eventos.alHover(i)
      },
    }
  })()

  // ---------- input ----------
  const raycaster = new THREE.Raycaster()
  let hovered = -1
  function updateHover() {
    raycaster.setFromCamera(locked() ? new THREE.Vector2(0, 0) : mouse, camera)
    const hit = drag || busy || peek ? undefined : raycaster.intersectObjects(vm.filter((v) => v.mesh.visible).map((v) => v.mesh))[0]
    hovered = hit ? vm.findIndex((v) => v.mesh === hit.object) : -1
    presence.hover(hovered >= 0 ? hovered : null)
  }
  const listeners: Array<[EventTarget, string, EventListener]> = []
  const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: any) => void) => {
    t.addEventListener(type, fn as EventListener)
    listeners.push([t, type, fn as EventListener])
  }
  on(window, 'pointermove', (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    mouse.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1)
    if (pending) pending.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
    if (drag) {
      drag.fwd = THREE.MathUtils.clamp(drag.fwd - e.movementY * ARM_SENS, HOLD_FWD, 0.8)
      drag.lat = THREE.MathUtils.clamp(drag.lat + e.movementX * ARM_SENS, -0.35, 0.35)
    } else if (peek) {
      panPeek(e.movementX, e.movementY)
    } else if (locked()) {
      yawT = clampYaw(yawT - e.movementX * LOOK_SENS)
      pitchT = clampPitch(pitchT - e.movementY * LOOK_SENS)
    }
  })
  on(canvas, 'contextmenu', (e: Event) => e.preventDefault())
  on(window, 'pointerup', (e: PointerEvent) => { if (e.button === 2) endPeek() })
  on(canvas, 'pointerdown', (e: PointerEvent) => {
    void audio.init(camera)
    if (e.button === 2) { if (!drag) beginPeek(); return }
    if (e.button !== 0) return
    if (hovered >= 0) {
      canvas.setPointerCapture(e.pointerId)
      pending = { k: hovered, t0: performance.now() / 1000, moved: 0 }
    } else if (locked()) document.exitPointerLock() // the same click that took the view releases it
    else void canvas.requestPointerLock?.()?.catch?.(() => undefined)
  })
  const endDrag = () => {
    canvas.style.cursor = ''
    if (pending) {
      const k = pending.k
      pending = null
      if (!quickPlay(k)) {
        if (turnSeat !== 0) hud('no es tu turno')
        if (vm[k]) vm[k].lift = 1.6 // a small nudge: the card rises and settles back
      }
      return
    }
    releaseDrag()
  }
  on(canvas, 'pointerup', (e: PointerEvent) => { if (e.button === 0) endDrag() })
  on(canvas, 'pointercancel', endDrag)
  on(window, 'keydown', (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key.toLowerCase() === 'm') {
      void audio.init(camera)
      hud(audio.toggleMute() ? 'sonido apagado' : 'sonido')
    }
  })

  // ---------- frame ----------
  const tmp = new THREE.Vector3()
  const camWorld = new THREE.Vector3()
  function frame(time: number, _dt: number) {
    poses = avatars.map(() => ({ lean: 0, headYaw: 0, headPitch: -0.15 }))
    if (loaded) {
      // your hands hold your fan by default
      poses[0].leftWrist = viewmodel.localToWorld(new THREE.Vector3(-0.16, -0.29, -0.33))
      // right forearm rests on the table edge (out of the centre of your view) until you grab a card
      poses[0].rightWrist = polar(TABLE_R - 0.04, a0, TABLE_Y + 0.03).addScaledVector(rightOf(0), 0.2)
    }
    focus = null
    syncFans()
    sched.tick(time)
    updatePending()
    updateDrag(time)
    updateTurn(time)
    updateCounters()
    if (lamp.update(time)) audio.lampBuzz(new THREE.Vector3(0, 1.67, 0))

    // Remote avatars keep the demo's idle/look behaviour: look at the action (the card in flight),
    // sometimes just at you, otherwise idle glances — stepped at 15 fps.
    const ts = Math.floor(time * 15) / 15
    camera.getWorldPosition(camWorld)
    for (const av of avatars) {
      const p = poses[av.seat]
      if (av.seat === 0) {
        av.pose(p)
        continue
      }
      const creepy = Math.sin(ts * 0.21 + av.seat * 2.3) > 0.93
      const target = !focus && creepy ? camWorld : focus
      if (target) {
        av.head.getWorldPosition(tmp)
        const d = av.root.worldToLocal(target.clone()).sub(av.root.worldToLocal(tmp.clone()))
        p.headYaw = THREE.MathUtils.clamp(Math.atan2(-d.x, -d.z), -1.3, 1.3)
        p.headPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
      } else p.headYaw = Math.sin(ts * 0.3 + av.seat) * 0.35
      av.pose(p)
    }

    // camera: seated, leans in with your own reach
    yaw += (yawT - yaw) * 0.15
    if (drag && drag.fwd > -0.05) {
      const c = drag.card.view.root.getWorldPosition(new THREE.Vector3()).sub(eye)
      const want = clampPitch(Math.atan2(c.y, Math.hypot(c.x, c.z)) + 0.14)
      pitchT += (want - pitchT) * 0.08
    }
    pitch += (pitchT - pitch) * 0.15
    aim += (aimT - aim) * 0.12
    updateCamera()
    presence.look(time)

    updateHover()
    crosshair.style.opacity = locked() ? '0.7' : '0'
    layoutVm(false)
    vm.forEach((v, k) => {
      v.lift += ((k === hovered ? 1 : 0) - v.lift) * 0.25
      const px = v.mesh.position
      px.x += (v.base.x - px.x) * 0.2
      px.y += (v.base.y + v.lift * 0.02 - px.y) * 0.2
      px.z += (v.base.z + v.lift * 0.02 - px.z) * 0.2
      v.mesh.rotation.z += (v.base.rz * (1 - v.lift * 0.6) - v.mesh.rotation.z) * 0.2
    })
    lowered += ((drag || busy || localPlay || stand > 0.1 ? 1 : 0) - lowered) * 0.12 // the fan drops out of the way while you play
    viewmodel.position.set(Math.sin(time * 1.3) * 0.003 - 0.04 * lowered, Math.sin(time * 2.1) * 0.002 - 0.12 * aim - 0.09 * lowered, 0)

    post.duotone(null, 0) // momentos (duotone) arrive in a later piece
    if (opciones.raw) {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    } else post.render(scene, camera, time)
  }

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
    const lean = poses[0]?.lean ?? 0
    const seated = eye.clone().addScaledVector(outOf(0), -lean * 0.06)
    seated.y -= lean * 0.03
    baseCam.position.copy(seated)
    baseCam.rotation.set(pitch, baseYaw + yaw, 0, 'YXZ')
    baseCam.aspect = camera.aspect
    baseCam.updateProjectionMatrix()
    baseCam.updateMatrixWorld()
    const standing = eye.clone().addScaledVector(forward0, 0.32).add(new THREE.Vector3(0, 0.48, 0))
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

  function resize(w: number, h: number) {
    width = Math.max(1, Math.round(w))
    height = Math.max(1, Math.round(h))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    post.resize(width, height)
  }
  const ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect
    if (r) resize(r.width, r.height)
  })
  ro.observe(contenedor)
  resize(contenedor.clientWidth || 1, contenedor.clientHeight || 1)
  setupCamera()

  const timer = new THREE.Timer()
  let started = false
  renderer.setAnimationLoop((t) => {
    timer.update(t)
    frame(timer.getElapsed(), timer.getDelta())
    if (!started && loaded) {
      started = true
      contenedor.dataset.mesa3dReady = '1'
    }
  })

  // ---------- debug hooks (headless tests / reconnection check) ----------
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4
  const debugApi = {
    vmScreen(k: number) {
      const p = vm[k].mesh.localToWorld(new THREE.Vector3(0, CARD_H * 0.45, 0)).project(camera)
      const r = canvas.getBoundingClientRect()
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, visible: vm[k].mesh.visible }
    },
    zoneScreen(asiento: Asiento) {
      const p = playSlot(toView(asiento), N).pos.project(camera)
      const r = canvas.getBoundingClientRect()
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
    },
    state: () => ({
      turn: turnSeat === null ? null : toAbs(turnSeat),
      myTurn: myTurn(),
      dragging: !!drag,
      localPlay: !!localPlay,
      busy,
      hand: hands[0]?.length ?? 0,
      base: base.length,
      baseRevealed: base.filter((b) => b.card.carta).length,
      playing: playing.size,
      piles: piles.map((p, v) => [toAbs(v), p.length]),
      deck: deck.length,
      hovered,
    }),
    // Everything visible on the table, order-independent: used to prove cargarEstado == live state.
    dump() {
      const cards = pool
        .filter((c) => c.view.root.visible)
        .map((c) => {
          const p = c.view.root.position
          const e = new THREE.Euler().setFromQuaternion(c.view.root.quaternion, 'YXZ')
          const face = (c.view.root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
          return `${r4(p.x)},${r4(p.y)},${r4(p.z)}|${r4(e.x)},${r4(e.y)},${r4(e.z)}|${face.map?.uuid === cardsF.backTex.uuid ? 'back' : 'face:' + (face.map?.name || face.uuid.slice(0, 4))}`
        })
        .sort()
      const faces = pool.filter((c) => c.view.root.visible && c.carta).map((c) => cartaKey(c.carta!)).sort()
      return {
        cards,
        faces,
        vm: vm.map((v) => (v.mesh.visible ? v.face : '-')).join(' '),
        fans: avatars.map((a) => a.hand.filter((c) => c.root.visible).length),
        counters: counters.map((c) => (c.sprite.visible ? c.shown : 0)),
        turn: turnSeat === null ? null : toAbs(turnSeat),
      }
    },
  }
  if (opciones.debug) Object.assign(window, { __mesa3d: debugApi })

  // ---------- the contract ----------
  let destroyed = false
  const stub = (name: string) => (...args: unknown[]) => console.debug(`mesa3d: ${name} (stub, later piece)`, ...args)
  const api: MesaScene = {
    cargarEstado(s: Snapshot) {
      epoch++
      sched.clear()
      localDone = Promise.resolve()
      const snap = structuredClone(s)
      tail = fontLoad.ready.then(() => {
        if (!destroyed) applySnapshot(snap)
      }).catch((e) => console.error('mesa3d: cargarEstado failed', e))
    },
    sorteoCarta: stub('sorteoCarta'),
    sorteoGanador: stub('sorteoGanador'),
    barajar(dador: Asiento) {
      enqueue('barajar', () => doBarajar(toView(dador)))
    },
    repartir(dador: Asiento, cartasPorJugador: number, miMano: Carta[]) {
      const mano = miMano.map((c) => ({ ...c }))
      enqueue('repartir', () => doRepartir(toView(dador), cartasPorJugador, mano))
    },
    pedidoHecho: stub('pedidoHecho'),
    reloj: stub('reloj'),
    turno(asiento: Asiento) {
      enqueue('turno', () => {
        turnSeat = toView(asiento)
      })
    },
    jugarCarta(asiento: Asiento) {
      if (loaded && toView(asiento) === 0 && localPlay && !localPlay.confirmed) {
        localPlay.confirm() // my own predicted drop: the server accepted it
        return
      }
      enqueue('jugarCarta', () => playFromHand(toView(asiento)))
    },
    revelar(asiento: Asiento, carta: Carta) {
      if (!loaded) return
      const v = toView(asiento)
      const c = { ...carta }
      const w = revealWaiters.get(v)
      if (w) {
        revealWaiters.delete(v)
        w(c)
      } else if (base.some((b) => b.v === v && b.card.carta)) {
        // already face-up (e.g. drawn by a cargarEstado that landed mid-gesture): nothing to do
      } else earlyReveals.set(v, c)
    },
    ganaBase(asiento: Asiento) {
      enqueue('ganaBase', () => collect(toView(asiento)))
    },
    sentido: stub('sentido') as (s: Sentido) => void,
    manoAsiento: stub('manoAsiento'),
    cierreMano: stub('cierreMano'),
    finPartida: stub('finPartida'),
    gesto: stub('gesto'),
    circuloMirenme: stub('circuloMirenme'),
    ojoTeMiro: stub('ojoTeMiro'),
    mirada: stub('mirada'),
    hover: stub('hover'),
    brazo: stub('brazo'),
    pedirEleccionAsCopas: stub('pedirEleccionAsCopas'),
    pedirEleccionAsOros: stub('pedirEleccionAsOros'),
    destruir() {
      if (destroyed) return
      destroyed = true
      epoch++
      sched.clear()
      renderer.setAnimationLoop(null)
      ro.disconnect()
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn)
      listeners.length = 0
      if (locked()) document.exitPointerLock()
      audio.dispose()
      timer.dispose?.()
      disposeTree(scene)
      counters.forEach((c) => c.tex.dispose())
      zoneTex.dispose()
      vmGeo.dispose()
      lamp.dispose()
      cardsF.dispose()
      post.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      overlay.remove()
      fontLoad.link?.remove()
      contenedor.style.position = prevPosition
      delete contenedor.dataset.mesa3dReady
      if (opciones.debug && (window as unknown as { __mesa3d?: unknown }).__mesa3d === debugApi) delete (window as unknown as { __mesa3d?: unknown }).__mesa3d
    },
  }
  return api
}
