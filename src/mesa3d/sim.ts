// sim.ts — TEST-ONLY fake server for the 3D table (piece 1a). Reachable only with ?mesa3d=sim.
//
// It drives the scene ONLY through the contract (MesaScene orders in, MesaEvents out), exactly as
// the real Supabase adapter will. It is NOT the rules engine: the real game lives in the SQL RPCs.
// It shuffles, deals a hand of 3, plays it out, then a hand of 5 (?manos=3,5 to change,
// ?n=4|6|8 players, ?yo=<asiento> for the local seat). Other seats play a random card.
import { crearMesa, type MesaOpciones } from './scene'
import type { Asiento, CantJugadores, Carta, Equipo, Jugador, MesaEvents, MesaScene, Palo, Snapshot, Valor } from './contract'

export interface SimOpciones extends MesaOpciones {
  n?: CantJugadores
  yo?: Asiento
  manos?: number[]
  onInfo?: (texto: string) => void
}

export interface Sim {
  reconectar(): void // cargarEstado mid-hand: the table must look identical
  estado(): Snapshot
  destruir(): void
}

const PALOS: Palo[] = ['oros', 'copas', 'espadas', 'bastos']
const VALORES: Valor[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

// ════════════════════════════════════════════════════════════════════════════════════════════
// SIM ONLY — La Base hierarchy, used here just to pick who collects each base in the simulator.
// The authoritative version is the server's (play_card_trick_resolution.sql); the scene never
// decides this. Ancho de Bastos > Rey > Caballo > Sota > 7..2 > other aces; the As de Espadas
// kills the Ancho if it is played AFTER it in the same base; ties: first played wins.
function fuerzaSoloSim(c: Carta) {
  if (c.valor === 1) return c.palo === 'bastos' ? 100 : 0
  return c.valor // 2..7 < 10 (Sota) < 11 (Caballo) < 12 (Rey)
}
function ganadorBaseSoloSim(base: { asiento: Asiento; carta: Carta }[]): Asiento {
  const ancho = base.findIndex((b) => b.carta.palo === 'bastos' && b.carta.valor === 1)
  const espada = base.findIndex((b) => b.carta.palo === 'espadas' && b.carta.valor === 1)
  if (ancho >= 0 && espada > ancho) return base[espada].asiento
  let best = 0
  for (let i = 1; i < base.length; i++) if (fuerzaSoloSim(base[i].carta) > fuerzaSoloSim(base[best].carta)) best = i // strict: ties keep the first
  return base[best].asiento
}
// ════════════════════════════════════════════════════════════════════════════════════════════

export function iniciarSim(contenedor: HTMLElement, op: SimOpciones = {}): Sim {
  const N: CantJugadores = op.n ?? 4
  const mi: Asiento = ((op.yo ?? 0) % N + N) % N
  const manos = op.manos?.length ? op.manos : [3, 5]
  const info = op.onInfo ?? (() => undefined)
  const jugadores: Jugador[] = Array.from({ length: N }, (_, a) => ({
    asiento: a,
    nombre: a === mi ? 'Vos' : `Jugador ${a}`,
    equipo: (a % 2 ? 'visitante' : 'local') as Equipo, // LOCAL = even seats, VISITANTE = odd (absolute)
    apariencia: null,
    conectado: true,
  }))

  // ---- server truth ----
  let fase: Snapshot['fase'] = 'barajando'
  let pie: Asiento = (mi + N / 2) % N // the first thing you see: the dealer across the table
  let manoAsiento: Asiento = (pie - 1 + N) % N
  let turno: Asiento | null = null
  let numeroMano = 1
  let cartasPorJugador = manos[0]
  let manosPorAsiento: Carta[][] = Array.from({ length: N }, () => [])
  let base: { asiento: Asiento; carta: Carta }[] = []
  let ganadas: number[] = Array.from({ length: N }, () => 0)
  let esperandoLocal: ((c: Carta) => void) | null = null
  let vivo = true

  const mismo = (a: Carta, b: Carta) => a.palo === b.palo && a.valor === b.valor && a.copia === b.copia
  const sleep = (ms: number) => new Promise<void>((res, rej) => setTimeout(() => (vivo ? res() : rej(new Error('sim destruida'))), ms))
  const porAsiento = <T,>(f: (a: Asiento) => T) => Object.fromEntries(Array.from({ length: N }, (_, a) => [a, f(a)])) as Record<Asiento, T>

  function snapshot(): Snapshot {
    return {
      cantJugadores: N,
      miAsiento: mi,
      jugadores,
      fase,
      pie,
      manoAsiento,
      turno,
      sentido: 'antihorario',
      numeroMano,
      totalManos: manos.length,
      cartasPorJugador,
      miMano: manosPorAsiento[mi].map((c) => ({ ...c })),
      cartasEnManoPorAsiento: porAsiento((a) => (a === mi ? 0 : manosPorAsiento[a].length)),
      baseActual: base.map((b) => ({ asiento: b.asiento, carta: { ...b.carta } })),
      basesGanadasPorAsiento: porAsiento((a) => ganadas[a]),
      pedidos: { local: { cantidad: null, kamikaze: false }, visitante: { cantidad: null, kamikaze: false } },
      puntos: { local: 0, visitante: 0 },
      relojes: { local: { restanteMs: 0, corriendo: false }, visitante: { restanteMs: 0, corriendo: false } },
    }
  }

  const eventos: MesaEvents = {
    alSoltarCarta(carta) {
      // server-side validation (sim): my turn, and the card is really in my hand
      if (turno !== mi || !esperandoLocal) return console.debug('sim: alSoltarCarta rejected (not your turn)', carta)
      if (!manosPorAsiento[mi].some((c) => mismo(c, carta))) return console.debug('sim: alSoltarCarta rejected (not in hand)', carta)
      const res = esperandoLocal
      esperandoLocal = null
      res(carta)
    },
    alTocarBarajar: () => undefined,
    alTocarRepartir: () => undefined,
    alPedir: () => undefined,
    alElegirSentido: () => undefined,
    alElegirQuienAbre: () => undefined,
    alHacerGesto: () => undefined,
    alMirenme: () => undefined,
    alTeMiro: () => undefined,
    alDejarDeVer: () => undefined,
    alMirar: () => undefined,
    alHover: () => undefined,
    alMoverBrazo: () => undefined,
  }

  const scene: MesaScene = crearMesa(contenedor, eventos, op)

  function mazoMezclado(): Carta[] {
    const copias = N === 8 ? [0, 1] : [0] // 8 players: two decks
    const d: Carta[] = []
    for (const copia of copias) for (const palo of PALOS) for (const valor of VALORES) d.push({ palo, valor, copia: copia as 0 | 1 })
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[d[i], d[j]] = [d[j], d[i]]
    }
    return d
  }

  async function jugarMano(cpp: number) {
    cartasPorJugador = cpp
    fase = 'barajando'
    turno = null
    const juntar = ganadas.some((g) => g > 0) || base.length > 0
    manosPorAsiento = Array.from({ length: N }, () => [])
    base = []
    ganadas = ganadas.map(() => 0)
    info(`mano ${numeroMano}/${manos.length} · ${cpp} cartas · da el asiento ${pie}`)
    scene.barajar(pie)
    await sleep((juntar ? 1000 + N * 250 : 0) + 1900)

    const mazo = mazoMezclado()
    for (let k = 0; k < cpp; k++)
      for (let j = 1; j <= N; j++) {
        const a = (pie - j + N * 2) % N // antihorario, starting after the dealer
        const c = mazo.pop()
        if (c) manosPorAsiento[a].push(c)
      }
    scene.repartir(pie, cpp, manosPorAsiento[mi].map((c) => ({ ...c })))
    await sleep(N * cpp * 140 + 800)

    fase = 'jugando'
    let abre = manoAsiento
    for (let b = 0; b < cpp; b++) {
      base = []
      for (let j = 0; j < N; j++) {
        const a = (abre - j + N * 2) % N // antihorario
        turno = a
        scene.turno(a)
        let carta: Carta
        if (a === mi) {
          carta = await new Promise<Carta>((res) => (esperandoLocal = res))
        } else {
          await sleep(700 + Math.random() * 700)
          const mano = manosPorAsiento[a]
          carta = mano[Math.floor(Math.random() * mano.length)]
        }
        manosPorAsiento[a] = manosPorAsiento[a].filter((c) => !mismo(c, carta))
        base.push({ asiento: a, carta })
        turno = null
        scene.jugarCarta(a)
        await sleep(1250)
        scene.revelar(a, carta)
        await sleep(950)
      }
      await sleep(500)
      const w = ganadorBaseSoloSim(base)
      ganadas[w]++
      base = []
      scene.ganaBase(w)
      info(`base ${b + 1}/${cpp} para el asiento ${w}`)
      await sleep(1500)
      abre = w // who wins opens the next base
    }
  }

  async function correr() {
    scene.cargarEstado(snapshot())
    await sleep(1200)
    for (let i = 0; i < manos.length; i++) {
      numeroMano = i + 1
      manoAsiento = (pie - 1 + N) % N
      await jugarMano(manos[i])
      pie = (pie - 1 + N) % N // the deal passes on, antihorario
    }
    fase = 'fin'
    turno = null
    info('fin de la simulación · R: reconectar')
  }
  correr().catch((e) => {
    if (vivo) console.error('sim', e)
  })

  function reconectar() {
    console.debug('sim: reconectar → cargarEstado')
    scene.cargarEstado(snapshot())
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'r') reconectar()
  }
  addEventListener('keydown', onKey)

  return {
    reconectar,
    estado: snapshot,
    destruir() {
      vivo = false
      esperandoLocal = null
      removeEventListener('keydown', onKey)
      scene.destruir()
    },
  }
}
