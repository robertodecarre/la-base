import * as THREE from 'three'

// Metres. A real 8-seat round table is ~1.8 m; bigger and nobody can reach the play ring.
export const TABLE_R = 0.9
export const TABLE_Y = 0.76
export const CHAIR_R = TABLE_R + 0.45
export const EYE_R = TABLE_R + 0.36 // seated, leaning in
export const EYE_Y = 1.27 // a bit high: flat cards across the table stay readable
export const SHOULDER_R = TABLE_R + 0.34
export const SHOULDER_Y = 1.05
// Play ring: baza 1 lands at PLAY_R, later bazas step toward the centre and overlap.
// Max reach from the shoulder stays ≤ 0.75 m (seated reach with a lean) — see reachOk().
export const PLAY_R = 0.66
export const BAZA_STEP = 0.05
// Cards are "hero props": 1.5× real size so they read from across the table.
export const CARD_W = 0.061 * 1.5
export const CARD_H = 0.095 * 1.5
export const CARD_Y = TABLE_Y + 0.004

// Truco is always 2 teams: 4, 6 or 8 players, evenly spaced, teams alternating.
export type PlayerCount = 4 | 6 | 8
export function seatAngle(i: number, n: PlayerCount) {
  return Math.PI / 2 + (i / n) * Math.PI * 2 // seat 0 = local player, at +Z ("south")
}
export const teamOf = (i: number) => i % 2

export function polar(r: number, a: number, y: number) {
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
}

// Where seat i's card for baza k (0,1,2) rests. Yaw makes the card's bottom edge face its owner.
export function playSlot(i: number, n: PlayerCount, baza: number) {
  const a = seatAngle(i, n)
  return { pos: polar(PLAY_R - baza * BAZA_STEP, a, CARD_Y + baza * 0.0008), yaw: -a + Math.PI / 2 }
}

export function reachOk(i: number, n: PlayerCount, baza: number) {
  const a = seatAngle(i, n)
  return polar(SHOULDER_R, a, SHOULDER_Y).distanceTo(playSlot(i, n, baza).pos) <= 0.75
}
