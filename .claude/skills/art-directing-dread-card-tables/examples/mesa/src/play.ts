import * as THREE from 'three'
import { CHAIR_R, TABLE_R, TABLE_Y, seatAngle, playSlot, polar, type PlayerCount } from './seats'

// Card-play choreography, modelled on real truco hands: cards held tight at the chest,
// forearm glides low over the felt with the card FACE-DOWN, card set in front of the
// player, then flipped over toward the table. Pure function of t → scrubbable, and every
// client reproduces it from one network event (see references/choreography-netcode.md).
export const PHASES = {
  extract: [0.0, 0.3], // pull the card up out of the fan
  turnDown: [0.3, 0.55], // wrist turns it face-down, drops to the table edge
  reach: [0.55, 1.1], // low glide to the slot, 2–3 cm above the felt
  set: [1.1, 1.25], // touch down + 1 cm friction slide
  reveal: [1.25, 1.65], // flip toward the centre (others see the face first)
  retract: [1.65, 2.1], // hand returns to the fan
} as const
export const PLAY_DURATION = 2.1

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const span = (t: number, [a, b]: readonly [number, number]) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1)

export interface PlayPose {
  cardPos: THREE.Vector3
  cardRot: THREE.Euler
  wrist?: THREE.Vector3 // undefined → hand is back at the fan
  lean: number
  headPitch: number
  faceVisible: boolean // identity must be known before this turns true
}

export function playPose(seat: number, n: PlayerCount, baza: number, t: number, holdPos?: THREE.Vector3): PlayPose {
  const a = seatAngle(seat, n)
  const yaw = Math.PI / 2 - a
  const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
  const hold = holdPos ?? polar(CHAIR_R - 0.33, a, 1.0)
  const lifted = hold.clone().add(new THREE.Vector3(0, 0.07, 0))
  const edge = polar(TABLE_R - 0.03, a, TABLE_Y + 0.06)
  const slot = playSlot(seat, n, baza).pos
  const hover = slot.clone().add(new THREE.Vector3(0, 0.025, 0))

  let pos: THREE.Vector3
  let rx = 0.35
  let roll = 0
  if (t < PHASES.turnDown[0]) {
    pos = hold.clone().lerp(lifted, ease(span(t, PHASES.extract)))
  } else if (t < PHASES.reach[0]) {
    const u = ease(span(t, PHASES.turnDown))
    pos = lifted.clone().lerp(edge, u)
    rx = THREE.MathUtils.lerp(0.35, Math.PI / 2, u)
  } else if (t < PHASES.set[0]) {
    const u = ease(span(t, PHASES.reach))
    const ctrl = edge.clone().lerp(hover, 0.5).add(new THREE.Vector3(0, 0.015, 0))
    pos = new THREE.QuadraticBezierCurve3(edge, ctrl, hover).getPoint(u)
    rx = Math.PI / 2
    roll = Math.sin(u * Math.PI) * 0.12 // wrist wobble
  } else if (t < PHASES.reveal[0]) {
    const u = span(t, PHASES.set)
    pos = hover.clone().lerp(slot, Math.min(1, u * 1.6)).addScaledVector(out, -0.01 * u)
    rx = Math.PI / 2
  } else {
    const u = ease(span(t, PHASES.reveal))
    pos = slot.clone().addScaledVector(out, -0.01)
    pos.y += Math.sin(u * Math.PI) * 0.05
    rx = Math.PI / 2 + u * Math.PI // through π: face turns toward the table centre
  }

  const onCard = (p: THREE.Vector3) => p.clone().addScaledVector(out, 0.075).add(new THREE.Vector3(0, 0.03, 0))
  let wrist: THREE.Vector3 | undefined
  if (t < PHASES.turnDown[0]) wrist = pos.clone().add(new THREE.Vector3(0, -0.07, 0)).addScaledVector(out, 0.03)
  else if (t < PHASES.retract[0]) wrist = onCard(pos)
  else if (t < PHASES.retract[1]) wrist = onCard(pos).lerp(hold, ease(span(t, PHASES.retract)))

  const reaching = t > PHASES.turnDown[0] && t < PHASES.retract[1]
  const lean = reaching ? Math.sin(Math.min(1, (t - PHASES.turnDown[0]) / (PHASES.retract[1] - PHASES.turnDown[0])) * Math.PI) : 0
  return {
    cardPos: pos,
    cardRot: new THREE.Euler(rx, yaw, roll, 'YXZ'),
    wrist: t >= PHASES.retract[1] ? undefined : wrist,
    lean,
    headPitch: reaching ? -0.45 * lean : -0.1,
    faceVisible: t >= PHASES.reveal[0] + (PHASES.reveal[1] - PHASES.reveal[0]) * 0.25,
  }
}
