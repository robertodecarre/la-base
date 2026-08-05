import { GESTURE_KEYS, GESTURES, GESTOS_LARGOS } from "../components/ReactionFace";

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
// cada caller decide si eso se muestra como SIN_SENA o vacío. `mapping`
// puede traer además las claves reservadas `_order`/`_bubbles` (rediseño
// de barra de señas, ver ordenEfectivo/bubbleEfectivo abajo) — pasan de
// largo sin romper nada acá porque ningún caller enumera Object.keys(...)
// de lo que devuelve esta función, solo hace lookups por gestureKey real.
export function senasEfectivas(mapping) {
  return { ...DEFAULT_SENAS, ...(mapping || {}) };
}

export function claveEquipo(team) {
  return `team${team}`;
}

export const GESTOS_EDITABLES = GESTURE_KEYS.filter((k) => k !== "neutral");

// Orden efectivo de las cards de la pestaña Señas (rediseño de barra de
// señas): el `_order` custom del equipo (array de gestureKeys, guardado
// por set_senas_order — mismo jsonb que senas_mapping, clave reservada
// que ningún GESTURE_KEYS real puede pisar) filtrado a claves válidas,
// más cualquier gesto que falte ahí (primera vez sin arrastrar nada
// todavía, o un gesto nuevo agregado después de que el equipo ya guardó
// un orden) al final, en el orden default de GESTOS_EDITABLES — nunca se
// "pierde" una card por no estar en un _order viejo.
export function ordenEfectivo(mapping) {
  const custom = Array.isArray(mapping?._order) ? mapping._order : [];
  const vistos = new Set();
  const orden = [];
  for (const key of custom) {
    if (GESTOS_EDITABLES.includes(key) && !vistos.has(key)) {
      orden.push(key);
      vistos.add(key);
    }
  }
  for (const key of GESTOS_EDITABLES) {
    if (!vistos.has(key)) orden.push(key);
  }
  return orden;
}

// Config efectiva de viñeta para un gesto largo (rediseño de barra de
// señas): texto default de fábrica (GESTURES[key].bubble — "" para los
// gestos largos que no traen uno, ver ReactionFace.jsx) con cualquier
// override de equipo pisado encima (`_bubbles[key]`, guardado por
// set_senas_bubble). Prendida por default sii tiene texto default (nunca
// se inventa un "on" para un gesto sin contenido de fábrica) — un equipo
// puede apagar una que sí trae default, o prender/escribir una que no.
export function bubbleEfectivo(mapping, key) {
  const textoDefault = GESTURES[key]?.bubble || "";
  const override = mapping?._bubbles?.[key];
  return {
    on: override?.on !== undefined ? !!override.on : !!textoDefault,
    text: override?.text !== undefined ? override.text : textoDefault,
  };
}

export { GESTOS_LARGOS };
