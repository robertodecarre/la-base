import * as THREE from 'three'

// Geometry of the round table (piece 1a keeps the demo's round table; every size lives here so the
// shape can be swapped later — the oval is an open decision, see references/la-base.md).
// Metres. A real 8-seat round table is ~1.8 m; bigger and nobody can reach the play ring.
export const TABLE_R = 0.9
export const TABLE_Y = 0.76
export const CHAIR_R = TABLE_R + 0.45
export const EYE_R = TABLE_R + 0.36 // seated, leaning in
export const EYE_Y = 1.27 // a bit high: flat cards across the table stay readable
export const SHOULDER_R = TABLE_R + 0.34
export const SHOULDER_Y = 1.05
// Play ring: in La Base there is ONE base on the felt at a time, every card at PLAY_R in front of
// its owner. Max reach from the shoulder stays ≤ 0.75 m (seated reach with a lean) — see reachOk().
export const PLAY_R = 0.66
export const REACH_MAX = 0.75
// Won-bases pile: in front of each owner, to his right, one small squared stack per base won,
// stepped sideways so they can be counted.
export const PILE_R = 0.74
export const PILE_SIDE = 0.15
export const PILE_STEP = 0.014
export const MAX_BASES = 10
// The dealer's deck: in front of the dealer, to his left (his right hand is for the won pile).
export const DECK_R = 0.6
export const DECK_SIDE = -0.14
// Cards are "hero props": 1.5× real size so they read from across the table.
export const CARD_W = 0.061 * 1.5
export const CARD_H = 0.095 * 1.5
export const CARD_Y = TABLE_Y + 0.004
export const CARD_T = 0.0009 // stacked card thickness

// La Base is always 2 teams: 4, 6 or 8 players, evenly spaced, teams alternating.
// Seat indices here are VIEW seats: 0 = the local player (bottom of the screen). The scene maps
// absolute asientos to view seats with (asiento − miAsiento) mod N. Increasing index runs
// clockwise seen from above — the same sense as La Base's absolute seats (mesaOvalada.js), so
// "antihorario" (turn_seat − 1 on the server) is still decreasing index here.
export type PlayerCount = 4 | 6 | 8
export function seatAngle(i: number, n: PlayerCount) {
  return Math.PI / 2 + (i / n) * Math.PI * 2 // seat 0 = local player, at +Z ("south")
}

export function polar(r: number, a: number, y: number) {
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
}
export const outOf = (s: number, n: PlayerCount) => new THREE.Vector3(Math.cos(seatAngle(s, n)), 0, Math.sin(seatAngle(s, n)))
export const rightOf = (s: number, n: PlayerCount) => new THREE.Vector3(Math.sin(seatAngle(s, n)), 0, -Math.cos(seatAngle(s, n)))
export const yawOf = (s: number, n: PlayerCount) => Math.PI / 2 - seatAngle(s, n)

// Where seat i's card of the current base rests. Yaw makes the card's bottom edge face its owner.
// (The demo stepped later bazas toward the centre; La Base only ever has one base on the felt.)
export function playSlot(i: number, n: PlayerCount) {
  const a = seatAngle(i, n)
  return { pos: polar(PLAY_R, a, CARD_Y), yaw: -a + Math.PI / 2 }
}

// Base #b (0-based) of seat i's won pile: position of the bottom card of that small stack.
export function pileSpot(i: number, n: PlayerCount, b: number) {
  const a = seatAngle(i, n)
  return polar(PILE_R, a, TABLE_Y + 0.002).addScaledVector(rightOf(i, n), PILE_SIDE + b * PILE_STEP)
}
// Alternating small twist per stacked base: the edges of each base stay distinguishable.
export const pileTwist = (b: number) => (b % 2 ? -0.09 : 0.09)

export function deckSpot(i: number, n: PlayerCount) {
  return polar(DECK_R, seatAngle(i, n), TABLE_Y + 0.002).addScaledVector(rightOf(i, n), DECK_SIDE)
}

const shoulder = (i: number, n: PlayerCount) => polar(SHOULDER_R, seatAngle(i, n), SHOULDER_Y)

// Everything a seat must touch has to be within seated reach, validated at startup: a stretched IK
// arm reads as a broken arm and kills the "live" illusion.
export function reachProblems(n: PlayerCount): string[] {
  const out: string[] = []
  for (let s = 0; s < n; s++) {
    const sh = shoulder(s, n)
    const check = (what: string, p: THREE.Vector3) => {
      const d = sh.distanceTo(p)
      if (d > REACH_MAX) out.push(`seat ${s} cannot reach ${what} (${d.toFixed(3)} m)`)
    }
    check('its play slot', playSlot(s, n).pos)
    check('its won pile', pileSpot(s, n, MAX_BASES - 1))
    check('its deck', deckSpot(s, n))
  }
  return out
}
