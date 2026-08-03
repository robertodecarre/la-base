import { GESTURE_KEYS } from "../components/ReactionFace";

// Esquema estándar de señas (pieza J) — lo que cualquier equipo puede usar
// sin configurar nada. Cada equipo puede pisar cualquier subset de estas
// entradas antes de que arranque la partida (ver set_senas_mapping); lo
// que no pisa se queda en este default. Solo estos 9 gestos tienen un
// significado default de verdad (pedidos por Roberto, batch post-pieza-J
// fix #5) — el resto de GESTOS_EDITABLES arranca sin ninguno: no
// inventar significados para gestos que no lo pidieron, cada equipo les
// asigna el suyo o los deja sin usar.
export const DEFAULT_SENAS = {
  guino_r: "Ancho de basto",
  siete_oros: "Hago 1",
  sonreir: "Hago 2",
  lengua: "Hago 3",
  cerrar_ojos: "No hago ninguna",
  pt: "Todas cartas porno",
  desprecio_r: "Tengo una sola baja",
  beso: "Tengo 2 bajas",
  abrir_boca: "Estoy bien de bajas",
};

// Hint neutro para un gesto sin default NI remapeo custom — nunca un
// significado inventado (ver DEFAULT_SENAS de arriba).
export const SIN_SENA = "sin significado asignado";

// Mapeo efectivo para un equipo: default con cualquier remapeo custom
// pisado encima (rooms.senas_mapping?.[`team${team}`] ?? {}). Los gestos
// sin entrada en ninguno de los dos quedan directamente ausentes acá —
// cada caller decide si eso se muestra como SIN_SENA o vacío.
export function senasEfectivas(mapping) {
  return { ...DEFAULT_SENAS, ...(mapping || {}) };
}

export function claveEquipo(team) {
  return `team${team}`;
}

export const GESTOS_EDITABLES = GESTURE_KEYS.filter((k) => k !== "neutral");
