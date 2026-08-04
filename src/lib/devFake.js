// Datos sintéticos para PantallaDevFake (feature #3, batch post-mano_seat-
// split) — Roberto no puede iterar fácil partidas de 6/8 jugadores (hacen
// falta 6-8 clientes reales). Esto arma un game_state/players/room con la
// MISMA forma exacta que la app real recibe de Supabase, para que
// PantallaPartidaOnline/MesaCircular/SorteoAnimado se rendericen con el
// código de producción tal cual — no hay un renderer paralelo simplificado
// acá, solo datos falsos con la forma correcta.
import { HAIR_STYLES, HAIR_COLOR_KEYS } from "../components/ReactionFace";

const PALOS = [
  { n: "Oros", e: "🟡", col: "#8B6914" },
  { n: "Copas", e: "🏆", col: "#c0392b" },
  { n: "Espadas", e: "⚔️", col: "#1a1a2e" },
  { n: "Bastos", e: "🪵", col: "#2d4a1e" },
];
const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function mazoCompleto() {
  let uid = 0;
  const cartas = [];
  for (const palo of PALOS) {
    for (const valor of VALORES) {
      cartas.push({ palo, valor, mazo: 1, uid: uid++ });
    }
  }
  return cartas;
}

const NOMBRES = ["Roberto", "Lucía", "Fede", "Mica", "Toto", "Cande", "Naza", "Vale"];

export function fakePlayers(nJug) {
  return Array.from({ length: nJug }, (_, seat) => {
    const team = seat % 2;
    const esCapitan = seat < 2; // asientos 0/1 son los primeros de cada equipo
    return {
      id: `dev-player-${seat}`,
      room_id: "dev-fake-room",
      user_id: `dev-user-${seat}`,
      seat, team,
      name: NOMBRES[seat] ?? `J${seat}`,
      is_captain: esCapitan,
      tricks_won: 0,
      appearance: {
        hairStyle: HAIR_STYLES[seat % HAIR_STYLES.length],
        hairColor: HAIR_COLOR_KEYS[seat % HAIR_COLOR_KEYS.length],
        glasses: seat % 3 === 0,
      },
    };
  });
}

export function fakeRoom(nJug, { conReloj = false } = {}) {
  return {
    id: "dev-fake-room",
    code: "DEVXXX",
    status: "playing",
    config: {
      nJug, dosMazos: false,
      estructura: [7, 6, 5],
      ases: { espadas: true, copas: true, oros: true },
      kamikazes: 1,
      clock: conReloj ? { habilitado: true, minutos: 5, modo: "deportivo" } : undefined,
    },
    sorteo_inicial: null,
    senas_mapping: null,
  };
}

const TOTAL_BASES = 7;

export function fakeGameState(nJug) {
  const dealerSeat = 0;
  const manoSeat = (dealerSeat + nJug - 1) % nJug;
  return {
    room_id: "dev-fake-room",
    hand_number: 0,
    phase: "bidding",
    dealer_seat: dealerSeat,
    mano_seat: manoSeat,
    bid_mano_seat: manoSeat,
    turn_seat: manoSeat,
    base_num: 0,
    last_trick_winner_seat: null,
    bids: { team0: null, team1: null },
    direction: 1,
    kamikazes_remaining: 1,
    kamikaze_declared: false,
    pending_action: null,
    clock: null,
    end_cause: null,
    close_hand_confirmed_team0: false,
    close_hand_confirmed_team1: false,
    updated_at: new Date().toISOString(),
  };
}

// Mano propia — deja fetchMyHand devolver esto sin ir a Supabase.
export function fakeMisCartas() {
  const mazo = mazoCompleto();
  return mazo.slice(0, TOTAL_BASES);
}

// sorteo_inicial (mismo shape que sortear_reparto_inicial deja en
// rooms.sorteo_inicial) — para probar la pantalla de sorteo unificada
// (feature #1) a 6/8 jugadores sin coordinar sesiones reales.
export function fakeSorteo(nJug) {
  const mazo = mazoCompleto();
  const cartas = Array.from({ length: nJug }, (_, seat) => ({ seat, carta: mazo[seat] }));
  // Ganador = jerarquía más alta entre las cartas sorteadas (as de bastos
  // > todo, resto por valor) — mismo criterio que la RPC real.
  const jer = (c) => (c.valor === 1 && c.palo.n === "Bastos" ? 100 : c.valor);
  let ganador = 0;
  for (let i = 1; i < nJug; i++) if (jer(cartas[i].carta) > jer(cartas[ganador].carta)) ganador = i;
  return { cartas, ganador_seat: ganador, flipped: {}, arrancamos: {} };
}
