import * as THREE from 'three'

// Sound design: real card recordings (Kenney "Casino Audio", CC0) placed in 3D (HRTF) inside a small
// wooden room (short convolution reverb). No noise beds: the room is almost silent, only the lamp
// hums very low and crackles when it flickers. Silence is part of the tension.
// La Base: one audio instance per scene (the demo used module globals) with its OWN AudioContext,
// closed by dispose(). Samples are served from public/mesa3d/sfx/.
export type Sfx = 'pick' | 'slide' | 'place' | 'flip' | 'toss' | 'toHand' | 'shuffle' | 'knock'

const FILES: Record<Exclude<Sfx, 'knock'>, string[]> = {
  pick: ['card-slide-4'],
  slide: ['card-shove-1', 'card-shove-2', 'card-shove-3', 'card-shove-4'],
  place: ['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'],
  flip: ['card-slide-1', 'card-slide-2', 'card-slide-3'],
  toss: ['card-slide-5', 'card-slide-6', 'card-slide-7', 'card-slide-8'],
  toHand: ['card-fan-1'],
  shuffle: ['card-shuffle'],
}
// Per-event character: base gain and playback-rate range (pitch variation keeps repeats natural).
const VOICE: Record<Sfx, { gain: number; rate: [number, number] }> = {
  pick: { gain: 0.35, rate: [1.1, 1.25] },
  slide: { gain: 0.45, rate: [0.9, 1.05] },
  place: { gain: 0.9, rate: [0.9, 1.05] },
  flip: { gain: 0.55, rate: [1.25, 1.45] },
  toss: { gain: 0.5, rate: [1.0, 1.15] },
  toHand: { gain: 0.25, rate: [1.05, 1.2] },
  shuffle: { gain: 0.7, rate: [0.95, 1.05] },
  knock: { gain: 1.0, rate: [1, 1] },
}

// Small room with wood: 0.45 s decaying, darkened impulse (stereo, decorrelated).
function roomImpulse(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 0.45)
  const ir = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18 // darker tail = wood, not tile
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < c.sampleRate * 0.008 ? 0 : 1) // 8 ms pre-delay
    }
  }
  return ir
}

export type Audio = ReturnType<typeof makeAudio>

export function makeAudio() {
  let listener: THREE.AudioListener | null = null
  let ctx: AudioContext | null = null
  let master: GainNode
  let wet: GainNode
  let muted = false
  let disposed = false
  const buffers = new Map<string, AudioBuffer>()

  // Must be called from a user gesture (autoplay rules).
  async function init(camera: THREE.Camera) {
    if (listener || disposed) return
    const c = new AudioContext()
    ctx = c
    THREE.AudioContext.setContext(c) // AudioListener picks up THIS context, not a shared global one
    listener = new THREE.AudioListener()
    camera.add(listener)
    master = c.createGain()
    master.gain.value = muted ? 0 : 0.9
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    master.connect(comp).connect(listener.getInput())
    const verb = c.createConvolver()
    verb.buffer = roomImpulse(c)
    wet = c.createGain()
    wet.gain.value = 0.22
    wet.connect(verb).connect(master)

    // Lamp hum: two low partials through a low-pass, barely audible, breathing slowly.
    const hum = c.createGain()
    hum.gain.value = 0.012
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    for (const [f, g] of [[100, 1], [200, 0.35]] as const) {
      const o = c.createOscillator()
      o.frequency.value = f
      const og = c.createGain()
      og.gain.value = g
      o.connect(og).connect(lp)
      o.start()
    }
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = c.createGain()
    lfoGain.gain.value = 0.004
    lfo.connect(lfoGain).connect(hum.gain)
    lfo.start()
    lp.connect(hum).connect(master)

    const names = [...new Set(Object.values(FILES).flat())]
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}mesa3d/sfx/${n}.ogg`)
          const buf = await c.decodeAudioData(await res.arrayBuffer())
          if (!disposed) buffers.set(n, buf)
        } catch {
          // a missing sample just stays silent
        }
      }),
    )
  }

  function spatial(c: AudioContext, at: THREE.Vector3) {
    const p = c.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = 0.7
    p.rolloffFactor = 1.2
    p.positionX.value = at.x
    p.positionY.value = at.y
    p.positionZ.value = at.z
    const send = c.createGain()
    send.gain.value = 1
    p.connect(master)
    p.connect(send).connect(wet)
    return p
  }

  // A fist on the table: pitched thump (sine drop) + the wood of a card-place at half speed.
  function knock(c: AudioContext, at: THREE.Vector3, volume: number) {
    const out = spatial(c, at)
    const o = c.createOscillator()
    const g = c.createGain()
    const t = c.currentTime
    o.frequency.setValueAtTime(95, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9 * volume, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.45)
    const wood = buffers.get('card-place-3')
    if (wood) {
      const s = c.createBufferSource()
      s.buffer = wood
      s.playbackRate.value = 0.5
      const wg = c.createGain()
      wg.gain.value = 0.8 * volume
      s.connect(wg).connect(out)
      s.start(t)
    }
  }

  function sfx(kind: Sfx, at: THREE.Vector3, volume = 1) {
    if (!ctx || muted || disposed) return
    if (kind === 'knock') return knock(ctx, at, volume)
    const list = FILES[kind]
    const buf = buffers.get(list[Math.floor(Math.random() * list.length)])
    if (!buf) return
    const v = VOICE[kind]
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = v.rate[0] + Math.random() * (v.rate[1] - v.rate[0])
    const g = ctx.createGain()
    g.gain.value = v.gain * volume * (0.85 + Math.random() * 0.3)
    s.connect(g).connect(spatial(ctx, at))
    s.start()
  }

  // Filament crackle while the lamp flickers.
  let lastBuzz = 0
  function lampBuzz(at: THREE.Vector3) {
    if (!ctx || muted || disposed || ctx.currentTime - lastBuzz < 0.3) return
    lastBuzz = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 100
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 2
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(bp).connect(g).connect(spatial(ctx, at))
    o.start(t)
    o.stop(t + 0.2)
  }

  function toggleMute() {
    muted = !muted
    if (master) master.gain.value = muted ? 0 : 0.9
    return muted
  }

  function dispose() {
    disposed = true
    listener?.removeFromParent()
    listener = null
    buffers.clear()
    const c = ctx
    ctx = null
    if (c && c.state !== 'closed') void c.close().catch(() => undefined)
  }

  return { init, sfx, lampBuzz, toggleMute, dispose }
}
