import { GESTURE_KEYS } from "../components/ReactionFace";

// Esquema estándar de señas (pieza J) — lo que cualquier equipo puede usar
// sin configurar nada. Cada equipo puede pisar cualquier subset de estas
// entradas antes de que arranque la partida (ver set_senas_mapping); lo
// que no pisa se queda en este default. Los textos son un punto de partida
// razonable, no una regla de juego — el sentido real lo define cada equipo.
export const DEFAULT_SENAS = {
  neutral: "sin seña — cara de póker",
  guino: "tengo una carta alta",
  guino_r: "tengo una carta baja",
  media_sonrisa: "puedo hacer una base más",
  siete_oros: "tengo el 7 de oros",
  beso: "confío en el pedido",
  lengua: "estoy blofeando",
  abrir_boca: "no tengo nada bueno",
  cejas: "mirá lo que tengo",
  sonreir: "vamos bien",
  oler_feo: "esto pinta mal",
  mejilla: "aguantá, no tires todavía",
  desprecio_r: "no me importa esta base",
  pt: "pedí más de lo que tenés",
  cerrar_ojos: "dejame pensar",
  wow: "carta increíble",
  jaja: "nos la llevamos seguro",
  miedo: "vamos perdiendo esto",
  shhh: "no digas nada más",
  enojo: "mal pedido, loco",
};

// Mapeo efectivo para un equipo: default con cualquier remapeo custom
// pisado encima (rooms.senas_mapping?.[`team${team}`] ?? {}).
export function senasEfectivas(mapping) {
  return { ...DEFAULT_SENAS, ...(mapping || {}) };
}

export function claveEquipo(team) {
  return `team${team}`;
}

export const GESTOS_EDITABLES = GESTURE_KEYS.filter((k) => k !== "neutral");
