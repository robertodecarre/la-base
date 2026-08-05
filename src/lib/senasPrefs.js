import { useEffect, useRef } from "react";

// ══════════════════════════════════════════════
// SENAS PREFS — rediseño de barra de señas: color tags + atajos de teclado
// por gesto. Las dos cosas son puramente personales (ningún efecto de
// juego, nunca visibles para nadie más, ni siquiera el propio compañero de
// equipo — a diferencia de senas_mapping, que SÍ es compartido) así que
// viven en localStorage, no en Supabase. Mismo patrón que ROOM_ID_KEY en
// App.jsx: string plano, prefijo "laBase", sin scope por sala (un atajo o
// color que un jugador arma le sirve en cualquier partida futura, es un
// hábito personal, no una config de esta sala puntual).
// ══════════════════════════════════════════════

const COLORS_KEY = "laBaseSenasColors";
const KEYBINDS_KEY = "laBaseSenasKeybinds";

function leerJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function escribirJSON(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // localStorage puede fallar (modo privado, cuota) — un color/atajo que
    // no persiste no es un error que valga la pena mostrarle al jugador.
  }
}

export function getSenaColor(gestureKey) {
  return leerJSON(COLORS_KEY)[gestureKey] ?? null;
}
// color=null borra la marca (mismo toggle-off que clickear el mismo punto
// de nuevo, ver SenasBar).
export function setSenaColor(gestureKey, color) {
  const obj = leerJSON(COLORS_KEY);
  if (color) obj[gestureKey] = color;
  else delete obj[gestureKey];
  escribirJSON(COLORS_KEY, obj);
}
export function getSenaColors() {
  return leerJSON(COLORS_KEY);
}

export function getKeyBinding(actionKey) {
  return leerJSON(KEYBINDS_KEY)[actionKey] ?? "";
}
export function setKeyBinding(actionKey, char) {
  const obj = leerJSON(KEYBINDS_KEY);
  if (char) obj[actionKey] = char;
  else delete obj[actionKey];
  escribirJSON(KEYBINDS_KEY, obj);
}
export function getKeyBindings() {
  return leerJSON(KEYBINDS_KEY);
}

// Un solo listener global de keydown — dispara onFire(actionKey) cuando la
// tecla apretada matchea algún binding guardado (case-insensitive, un solo
// carácter). Ignora inputs con foco (para no robarle "b" a alguien
// escribiendo un significado en PersonalizarSenas o el texto de una
// viñeta) — mismo guard que el mockup de referencia. `bindings` es
// {actionKey: char}, ya resuelto por el caller (getKeyBindings() más
// "mirenme" si corresponde) para no leer localStorage en cada keydown.
export function useSenasKeybindings(bindings, onFire) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.length !== 1) return;
      const key = e.key.toLowerCase();
      const bindings_ = bindingsRef.current || {};
      const match = Object.keys(bindings_).find(
        (actionKey) => bindings_[actionKey] && bindings_[actionKey].toLowerCase() === key
      );
      if (match) onFireRef.current(match);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
