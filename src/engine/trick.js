import { jerarquia } from "./hierarchy";

// Mayor jerarquía gana; empate = menor orden (más cercano al mano).
function ganadorPorJerarquia(ronda) {
  let maxJ = -1, ganOrden = 999, ganIdx = -1;
  for (const item of ronda) {
    const j = jerarquia(item.carta);
    if (j > maxJ || (j === maxJ && item.orden < ganOrden)) { maxJ = j; ganIdx = item.jugadorIdx; ganOrden = item.orden; }
  }
  return ganIdx;
}

// Resolución autoritativa de una base completa (ronda = nJugTotal cartas).
// NOTA: preserva el comportamiento actual, que no condiciona el superpoder
// del As de Espadas al flag ases.espadas (a diferencia de ganadorParcial).
export function resolverBase(ronda) {
  const anchoItem = ronda.find(x => x.carta.valor === 1 && x.carta.palo.n === "Bastos");
  const espItem = ronda.find(x => x.carta.valor === 1 && x.carta.palo.n === "Espadas");

  if (anchoItem && espItem && espItem.orden > anchoItem.orden) {
    return { ganIdx: espItem.jugadorIdx, viaSuperpoderEspadas: true };
  }
  return { ganIdx: ganadorPorJerarquia(ronda), viaSuperpoderEspadas: false };
}

// Vista previa de "quién va ganando" en una ronda parcial (aún en juego).
// Sí respeta ases.espadas.
export function ganadorParcial(rondaParcial, ases) {
  if (!rondaParcial || rondaParcial.length === 0) return null;
  const anchoItem = rondaParcial.find(x => x.carta.valor === 1 && x.carta.palo.n === "Bastos");
  const espItem = rondaParcial.find(x => x.carta.valor === 1 && x.carta.palo.n === "Espadas");

  if (ases?.espadas && anchoItem && espItem && espItem.orden > anchoItem.orden) {
    return espItem.jugadorIdx;
  }
  return ganadorPorJerarquia(rondaParcial);
}

// Trigger del superpoder del As de Oros: si su equipo ganó la base, elige quién abre la siguiente.
export function detectarTriggerOros(ronda, jActuales, ganIdx, ases) {
  const orosItem = ases?.oros ? ronda.find(x => x.carta.valor === 1 && x.carta.palo.n === "Oros") : null;
  if (!orosItem) return null;
  const orosEq = jActuales[orosItem.jugadorIdx].eq;
  const ganEq = jActuales[ganIdx].eq;
  if (orosEq !== ganEq) return null;
  return { jugadorIdx: orosItem.jugadorIdx, eqIdx: orosEq };
}
