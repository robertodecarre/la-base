import * as THREE from 'three'
import { PALETTE, hex } from './look'
import { TABLE_R, TABLE_Y, CHAIR_R, PLAY_R, CARD_W, CARD_H, seatAngle, type PlayerCount } from './seats'
import type { Equipo } from './contract'

// Chalk markings on the felt (Buckshot's taped/chalked table): outer ring, one play box per
// seat, a centre circle, and the team letter under each box (L = LOCAL, V = VISITANTE — absolute
// La Base teams, never viewer-relative).
function chalkTexture(n: PlayerCount, teams: Equipo[]) {
  const S = 1024
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grd.addColorStop(0, PALETTE.feltLit)
  grd.addColorStop(1, PALETTE.felt)
  g.fillStyle = grd
  g.fillRect(0, 0, S, S)
  // Deterministic grain (same felt every rebuild: reconnecting must not change the table).
  let seed = 1234567
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,220,0.05)'
    g.fillRect(r() * S, r() * S, 2, 2)
  }
  const m = S / 2 / TABLE_R // metres → px
  g.strokeStyle = PALETTE.chalk
  g.globalAlpha = 0.7
  g.lineWidth = 3
  g.beginPath(); g.arc(S / 2, S / 2, (TABLE_R - 0.06) * m, 0, Math.PI * 2); g.stroke()
  g.beginPath(); g.arc(S / 2, S / 2, 0.3 * m, 0, Math.PI * 2); g.stroke()
  for (let i = 0; i < n; i++) {
    const a = seatAngle(i, n)
    g.save()
    // Canvas is mapped onto the top with UV v flipped by CircleGeometry: canvas y = world z.
    g.translate(S / 2 + Math.cos(a) * PLAY_R * m, S / 2 + Math.sin(a) * PLAY_R * m)
    g.rotate(a + Math.PI / 2)
    g.setLineDash([10, 8])
    g.strokeRect((-CARD_W / 2 - 0.02) * m, (-CARD_H / 2 - 0.05) * m, (CARD_W + 0.04) * m, (CARD_H + 0.1) * m)
    g.setLineDash([])
    g.font = `${0.05 * m}px "IM Fell English SC", Georgia, serif`
    g.fillStyle = PALETTE.chalk
    g.textAlign = 'center'
    // L / V are not symmetric (the demo's I / II were): turn the letter so its owner reads it upright
    g.translate(0, (CARD_H / 2 + 0.12) * m)
    g.rotate(Math.PI)
    g.textBaseline = 'middle'
    g.fillText(teams[i] === 'visitante' ? 'V' : 'L', 0, 0)
    g.restore()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Everything that depends on the seat layout (N, teams). Rebuilt when cargarEstado changes it.
export function buildRoom(n: PlayerCount, teams: Equipo[]) {
  const room = new THREE.Group()

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE_R, 96),
    new THREE.MeshStandardMaterial({ map: chalkTexture(n, teams), roughness: 0.95 }),
  )
  top.rotation.x = -Math.PI / 2
  top.position.y = TABLE_Y
  top.receiveShadow = true
  room.add(top)

  const wood = new THREE.MeshStandardMaterial({ color: hex(PALETTE.soot), roughness: 0.6 })
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.035, 10, 96), wood)
  rim.rotation.x = Math.PI / 2
  rim.position.y = TABLE_Y
  rim.castShadow = rim.receiveShadow = true
  room.add(rim)
  // pedestal stops 2 cm under the top: a cap coplanar with the felt z-fights into a dark blob
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, TABLE_Y - 0.02, 16), wood)
  leg.position.y = (TABLE_Y - 0.02) / 2
  room.add(leg)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 48),
    new THREE.MeshStandardMaterial({ color: hex(PALETTE.soot), roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  room.add(floor)

  // Always 8 chairs: the empty ones stay pushed back in the dark (they are part of the dread).
  const chairMat = new THREE.MeshStandardMaterial({ color: hex(PALETTE.soot), roughness: 0.8 })
  const seatGeo = new THREE.BoxGeometry(0.45, 0.05, 0.45)
  const backGeo = new THREE.BoxGeometry(0.45, 0.6, 0.05)
  for (let k = 0; k < 8; k++) {
    const occupied = k < n
    const a = occupied ? seatAngle(k, n) : seatAngle(k, 8) + Math.PI / 8
    const r = occupied ? CHAIR_R : CHAIR_R + 0.9
    const chair = new THREE.Group()
    const seat = new THREE.Mesh(seatGeo, chairMat)
    seat.position.y = 0.46
    const back = new THREE.Mesh(backGeo, chairMat)
    back.position.set(0, 0.78, 0.2)
    chair.add(seat, back)
    chair.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    chair.rotation.y = -a + Math.PI / 2
    chair.traverse((o) => (o.castShadow = true))
    room.add(chair)
  }
  return room
}

export function setupAtmosphere(scene: THREE.Scene) {
  scene.background = new THREE.Color(hex(PALETTE.void))
  scene.fog = new THREE.FogExp2(hex(PALETTE.void), 0.22)
  return buildCurtain(scene)
}

// A dim oxblood curtain ring behind the chairs (palette: oxblood = "card backs, curtains"; Loop Hero backdrop).
// piece 1a-fix: the coats are soot and, after the post's ACES toe + dark snap, landed on the same palette
// black as the empty room — players lost their silhouettes. Against this band (it snaps to the dark red of
// DARK_SNAP) every body reads as a dark cut-out without lighting the clothes. Unlit on purpose (no extra
// light cost); fog still swallows it with distance. Brightness in CURTAIN_GAIN, calibrated raw vs post.
export const CURTAIN_GAIN = 0.6 // 1.4 read as a theatre curtain; under 0.5 the silhouettes dissolve
function buildCurtain(scene: THREE.Scene) {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 128
  const g = cv.getContext('2d')!
  g.fillStyle = PALETTE.oxblood
  g.fillRect(0, 0, cv.width, cv.height)
  // folds: soft vertical shading, irregular spacing (deterministic)
  for (let x = 0; x < cv.width; x++) {
    const f = 0.5 + 0.5 * Math.sin(x * 0.19 + Math.sin(x * 0.031) * 3)
    g.fillStyle = `rgba(11,9,8,${(0.08 + 0.22 * f).toFixed(3)})` // soft: deep folds broke into stripes under the snap
    g.fillRect(x, 0, 1, cv.height)
  }
  // band: dark at the floor and toward the ceiling, strongest behind the seated heads and shoulders
  const v = g.createLinearGradient(0, 0, 0, cv.height)
  v.addColorStop(0, 'rgba(11,9,8,1)')
  v.addColorStop(0.3, 'rgba(11,9,8,0.1)')
  v.addColorStop(0.62, 'rgba(11,9,8,0.1)')
  v.addColorStop(1, 'rgba(11,9,8,1)')
  g.fillStyle = v
  g.fillRect(0, 0, cv.width, cv.height)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(6, 1)
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, color: new THREE.Color(CURTAIN_GAIN, CURTAIN_GAIN, CURTAIN_GAIN) })
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 2.8, 64, 1, true), mat)
  curtain.position.y = 1.4
  scene.add(curtain)
  return curtain
}

// ONE key light: the hanging lamp. Everything else is near-black.
export function buildLamp(scene: THREE.Scene) {
  const lamp = new THREE.Group()
  lamp.position.set(0, 2.6, 0)
  scene.add(lamp)
  const pivot = new THREE.Group() // swings like a pendulum
  lamp.add(pivot)
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.8), new THREE.MeshBasicMaterial({ color: 0x000000 }))
  cord.position.y = -0.4
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.2, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: hex(PALETTE.soot), side: THREE.DoubleSide, roughness: 0.5 }),
  )
  shade.position.y = -0.85
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex(PALETTE.amber)).multiplyScalar(6) }))
  bulb.position.y = -0.93
  pivot.add(cord, shade, bulb)

  const key = new THREE.SpotLight(hex(PALETTE.amber), 11, 6, 0.8, 0.6, 2)
  key.position.y = -0.93
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0004
  key.shadow.camera.near = 0.2
  key.shadow.camera.far = 4
  const target = new THREE.Object3D()
  target.position.y = -3
  pivot.add(key, target)
  key.target = target

  // Bounce from the lit felt: uplights masks from below (horror uplight), no shadows.
  // piece 1a-fix: 3.5 → 6. Remote hands and the backs they hold sit outside the lamp cone (at the chest);
  // at 3.5 they fell under the post's snap edge. 9 read even better but burnt the felt's centre.
  const bounce = new THREE.PointLight(hex(PALETTE.feltLit), 6, 3, 1.5)
  bounce.position.y = TABLE_Y + 0.1
  scene.add(bounce)
  scene.add(new THREE.AmbientLight(0xffffff, 0.015))

  return {
    bounce,
    update(t: number) {
      pivot.rotation.z = Math.sin(t * 1.7) * 0.012
      pivot.rotation.x = Math.sin(t * 1.1 + 1) * 0.008
      const flicker = Math.sin(t * 43) * Math.sin(t * 7.3) > 0.97 ? 0.75 : 1
      key.intensity = 11 * flicker
      return flicker < 1
    },
    dispose() {
      key.shadow.map?.dispose()
    },
  }
}
