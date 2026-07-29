import { jerarquia } from "./hierarchy.js";

// Mayor jerarquía gana; empate = menor orden (más cercano al mano).
function ganadorPorJerarquia(ronda) {
  let maxJ = -1, ganOrden = 999, ganIdx = -1;
  for (const item of ronda) {
    const j = jerarquia(item.carta);
    if (j > maxJ || (j === maxJ && item.orden < ganOrden)) { maxJ = j; ganIdx = item.jugadorIdx; ganOrden = item.orden; }
  }
  return ganIdx;
}

// Vista previa de "quién va ganando" en una ronda parcial (aún en juego) —
// la resolución autoritativa de la base completa corre server-side (ver
// play_card_trick_resolution.sql), esto es solo para el preview en vivo en
// MesaCircular mientras la base todavía está en curso.
export function ganadorParcial(rondaParcial, ases) {
  if (!rondaParcial || rondaParcial.length === 0) return null;
  const anchoItem = rondaParcial.find(x => x.carta.valor === 1 && x.carta.palo.n === "Bastos");
  const espItem = rondaParcial.find(x => x.carta.valor === 1 && x.carta.palo.n === "Espadas");

  if (ases?.espadas && anchoItem && espItem && espItem.orden > anchoItem.orden) {
    return espItem.jugadorIdx;
  }
  return ganadorPorJerarquia(rondaParcial);
}
