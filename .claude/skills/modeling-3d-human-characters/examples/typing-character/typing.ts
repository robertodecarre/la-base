/**
 * Touch-typing driver: turns a looping script of commands into keystrokes, each assigned to the
 * finger a trained typist would use. For any time it answers "how far is every finger reaching,
 * sideways, and pressing" and "which keycaps are down". Pure logic, no three.js.
 *
 * Keystroke envelope (seconds, relative to the strike): reach from -0.14, press -0.035 → +0.02,
 * hold to +0.05, release by +0.12, reach back home by +0.2. All eased — no snapping ("flick").
 */

export type Side = 'Left' | 'Right'
export type Finger = 'Pinky' | 'Ring' | 'Middle' | 'Index' | 'Thumb'
export interface Key { side: Side; finger: Finger; c: number; r: number }

/** Where each finger rests (home row r=2, thumbs on the bottom row). Mirrors tools/build_analyst.py. */
export const HOME: Record<Side, Record<Finger, [number, number]>> = {
  Left: { Pinky: [1, 2], Ring: [2, 2], Middle: [3, 2], Index: [4, 2], Thumb: [5, 4] },
  Right: { Index: [7, 2], Middle: [8, 2], Ring: [9, 2], Pinky: [10, 2], Thumb: [6, 4] },
}

const ROWS: [number, string, (Finger | null)[]][] = [
  // row, characters by column (c = index + 1), finger per column
  [1, 'qwertyuiop', ['Pinky', 'Ring', 'Middle', 'Index', 'Index', 'Index', 'Index', 'Middle', 'Ring', 'Pinky']],
  [2, 'asdfghjklñ', ['Pinky', 'Ring', 'Middle', 'Index', 'Index', 'Index', 'Index', 'Middle', 'Ring', 'Pinky']],
  [3, 'zxcvbnm,.-', ['Pinky', 'Ring', 'Middle', 'Index', 'Index', 'Index', 'Index', 'Middle', 'Ring', 'Pinky']],
]

const LAYOUT = new Map<string, Key>()
ROWS.forEach(([r, chars, fingers]) => {
  ;[...chars].forEach((ch, i) => {
    const c = i + 1
    LAYOUT.set(ch, { side: c <= 5 ? 'Left' : 'Right', finger: fingers[i]!, c, r })
  })
})
LAYOUT.set(' ', { side: 'Right', finger: 'Thumb', c: 6, r: 4 })
LAYOUT.set('\n', { side: 'Right', finger: 'Pinky', c: 11, r: 2 })

const SCRIPT = ['rastrear hidra\n', 'whoami\n', 'grep hidra auth.log\n', 'ls -la var\n', 'argos --hunt hidra\n', 'tail -f alertas\n']

interface Stroke { t: number; key: Key }

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** One loop of the script at base speed: ~0.15 s per key, a pause after every line. */
function buildSchedule(): { strokes: Stroke[]; length: number } {
  const strokes: Stroke[] = []
  let t = 0.6
  let n = 0
  SCRIPT.forEach((line) => {
    for (const ch of line) {
      const key = LAYOUT.get(ch)
      if (!key) continue
      strokes.push({ t, key })
      t += 0.12 + hash(n++) * 0.1 + (ch === ' ' ? 0.05 : 0)
    }
    t += 0.9 + hash(n++) * 1.1 // read the output before the next command
  })
  return { strokes, length: t }
}

export interface FingerState {
  /** 0..1 how far the finger is committed to its current target key. */
  reach: number
  /** rows away from home (negative = further from the body) and columns (+ = toward the typist's right). */
  dRow: number
  dCol: number
  /** 0..1 key travel. */
  press: number
}

export class TypingDriver {
  private readonly schedule = buildSchedule()
  private readonly fingers = new Map<string, FingerState>()
  readonly pressedKeys: { c: number; r: number; amount: number }[] = []
  /** Per hand 0..1: how busy the hand is (drives a small wrist lift). */
  readonly handActivity: Record<Side, number> = { Left: 0, Right: 0 }

  finger(side: Side, finger: Finger): FingerState {
    const id = side + finger
    let s = this.fingers.get(id)
    if (!s) {
      s = { reach: 0, dRow: 0, dCol: 0, press: 0 }
      this.fingers.set(id, s)
    }
    return s
  }

  /**
   * `clock` must be an ACCUMULATED typing clock (clock += dt * speed), never time * speed:
   * changing the speed of a product jumps the whole schedule and makes fingers snap.
   */
  sample(clock: number): void {
    this.fingers.forEach((s) => { s.reach = 0; s.press = 0; s.dRow = 0; s.dCol = 0 })
    this.pressedKeys.length = 0
    this.handActivity.Left = 0
    this.handActivity.Right = 0

    const { strokes, length } = this.schedule
    const local = clock % length
    for (const { t, key } of strokes) {
      const dt = local - t
      if (dt < -0.16 || dt > 0.22) continue
      const reach = smooth(-0.14, -0.05, dt) * (1 - smooth(0.1, 0.2, dt))
      const press = smooth(-0.035, 0.02, dt) * (1 - smooth(0.05, 0.12, dt))
      const [hc, hr] = HOME[key.side][key.finger]
      const s = this.finger(key.side, key.finger)
      if (reach >= s.reach) {
        s.reach = reach
        s.dRow = key.r - hr
        s.dCol = key.c - hc
      }
      s.press = Math.max(s.press, press)
      this.handActivity[key.side] = Math.max(this.handActivity[key.side], reach)
      if (press > 0.01) this.pressedKeys.push({ c: key.c, r: key.r, amount: press })
    }
  }
}
