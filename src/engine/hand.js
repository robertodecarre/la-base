import { calcularPuntos } from "./scoring";

// Cierre de mano: puntos de la mano + detección de kamikaze no declarado.
export function evaluarCierreMano({ jugadores, pedidos, manoJugIdx, kamikazeDeclarado }) {
  let hechoN = 0, hechoE = 0;
  for (const j of jugadores) { if (j.eq === 0) hechoN += j.bases; else hechoE += j.bases; }
  const pedN = pedidos?.[0] ?? 0, pedE = pedidos?.[1] ?? 0;
  const { deltaN, deltaE } = calcularPuntos(pedN, pedE, hechoN, hechoE);

  const eqManoEq = jugadores[manoJugIdx]?.eq ?? 0;
  const deltaEqMano = eqManoEq === 0 ? deltaN : deltaE;
  const noDeclarado = !kamikazeDeclarado && deltaEqMano <= -2;

  return { deltaN, deltaE, pedN, pedE, hechoN, hechoE, eqManoEq, noDeclarado };
}
