// mesa-contract.ts — Contrato entre la escena 3D (vista) y La Base (cerebro).
//
// La escena NO conoce Supabase, reglas ni azar. Solo:
//   1. obedece órdenes (MesaScene), y
//   2. avisa lo que hace el jugador local (MesaEvents).
// El adaptador (del lado de La Base) traduce RPCs/realtime <-> este contrato.
// Toda validación (turno, carta legal, pedido válido) la hace el servidor.

// ---------- Tipos básicos ----------

export type Palo = 'oros' | 'copas' | 'espadas' | 'bastos'
export type Valor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12
export type Equipo = 'local' | 'visitante'
export type Sentido = 'antihorario' | 'horario'
export type CantJugadores = 4 | 6 | 8

/** Con 8 jugadores hay dos mazos: `copia` distingue cartas repetidas (0 o 1). */
export interface Carta { palo: Palo; valor: Valor; copia: 0 | 1 }

/** Asiento absoluto 0..N-1. La escena rota la vista para que `miAsiento` quede abajo. */
export type Asiento = number

export interface Jugador {
  asiento: Asiento
  nombre: string
  equipo: Equipo            // se alternan: nunca dos del mismo equipo al lado
  apariencia: unknown       // players.appearance tal cual (pelo, anteojos); la escena decide cómo usarlo
  conectado: boolean
}

// ---------- Estado completo (entrar a la partida / reconectar) ----------
// Se dibuja SIN animaciones.

export interface Snapshot {
  cantJugadores: CantJugadores
  miAsiento: Asiento
  jugadores: Jugador[]
  fase: 'sorteo' | 'barajando' | 'pidiendo' | 'jugando' | 'cierre' | 'fin'

  pie: Asiento              // el que dio esta mano
  manoAsiento: Asiento      // etiqueta MANO visible (dinámica)
  turno: Asiento | null
  sentido: Sentido

  numeroMano: number        // 1..totalManos
  totalManos: number
  cartasPorJugador: number  // = bases en juego en esta mano

  miMano: Carta[]           // SOLO la mano propia
  cartasEnManoPorAsiento: Record<Asiento, number> // de los demás, solo la cantidad (dorsos)

  /** La base en curso: solo UNA a la vez sobre la mesa (el ganador se lleva las cartas). */
  baseActual: { asiento: Asiento; carta: Carta }[]
  /** Bases ganadas, por asiento (pila de dorsos frente a cada uno). */
  basesGanadasPorAsiento: Record<Asiento, number>

  pedidos: Record<Equipo, { cantidad: number | null; kamikaze: boolean }>
  puntos: Record<Equipo, number>
  relojes: Record<Equipo, { restanteMs: number; corriendo: boolean }>
}

// ---------- Órdenes: La Base -> escena ----------

export interface MesaScene {
  cargarEstado(s: Snapshot): void

  // Sorteo inicial: cada uno recibe una carta boca arriba; el más alto da.
  sorteoCarta(asiento: Asiento, carta: Carta): void
  sorteoGanador(asiento: Asiento): void          // si hay empate, llega otro sorteoCarta para todos

  // Reparto
  barajar(dador: Asiento): void                   // se puede repetir antes de repartir
  repartir(dador: Asiento, cartasPorJugador: number, miMano: Carta[]): void

  // Pedido (la escena solo lo muestra; el panel puede ser HTML encima del canvas)
  pedidoHecho(equipo: Equipo, cantidad: number, kamikaze: boolean): void
  reloj(equipo: Equipo, restanteMs: number, corriendo: boolean): void

  // Juego
  turno(asiento: Asiento): void
  jugarCarta(asiento: Asiento): void              // arranca el gesto, carta boca abajo, SIN identidad
  revelar(asiento: Asiento, carta: Carta): void   // la cara aparece recién acá
  ganaBase(asiento: Asiento): void                // el ganador se lleva la base a su pila
  sentido(s: Sentido): void                       // As de Copas
  manoAsiento(asiento: Asiento): void             // etiqueta MANO (As de Oros o base ganada)

  // Cierre de mano / partida
  cierreMano(r: { bases: Record<Equipo, number>; delta: Record<Equipo, number>; puntos: Record<Equipo, number> }): void
  finPartida(r: { ganador: Equipo; motivo: 'estructura' | 'inalcanzable' | 'kamikaze' | 'reloj' }): void

  // Señas y presencia
  /** Señas: 150 ms. Reacciones: 2000 ms. OJO: no aplicarles el stepping a 15 fps
   *  de los avatares remotos (150 ms serían ~2 cuadros y se perderían). */
  gesto(asiento: Asiento, gesto: string, duracionMs: number): void
  /** La visibilidad (quién ve el círculo) la filtra el adaptador; la escena dibuja lo que recibe. */
  circuloMirenme(asiento: Asiento, activo: boolean): void
  ojoTeMiro(asiento: Asiento, activo: boolean): void
  mirada(asiento: Asiento, yaw: number, pitch: number): void   // no confiable, ~15 Hz
  hover(asiento: Asiento, indice: number | null): void
  brazo(asiento: Asiento, fwd: number, lat: number): void      // amagues en vivo

  // Menús que solo ve quien tiene que decidir
  pedirEleccionAsCopas(): void                                 // -> alElegirSentido
  pedirEleccionAsOros(companeros: Asiento[]): void             // -> alElegirQuienAbre

  destruir(): void
}

// ---------- Avisos: escena -> La Base ----------
// Son INTENCIONES. El servidor decide si valen; si no, la escena recibe
// la corrección vía órdenes o un cargarEstado.

export interface MesaEvents {
  alSoltarCarta(carta: Carta): void               // soltó sobre la zona en su turno
  alTocarBarajar(): void                          // solo habilitado para el dador
  alTocarRepartir(): void
  alPedir(cantidad: number, kamikaze: boolean): void
  alElegirSentido(s: Sentido): void
  alElegirQuienAbre(asiento: Asiento): void
  alHacerGesto(gesto: string): void
  alMirenme(): void
  alTeMiro(asientoQuePidio: Asiento): void
  alDejarDeVer(asientoQuePidio: Asiento): void
  // Presencia (el adaptador los manda por broadcast, con rate limit)
  alMirar(yaw: number, pitch: number): void
  alHover(indice: number | null): void
  alMoverBrazo(fwd: number, lat: number): void
}

// ---------- Construcción ----------

export type CrearMesa = (contenedor: HTMLElement, eventos: MesaEvents) => MesaScene
