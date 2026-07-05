export function calcularPuntos(pedN, pedE, hechoN, hechoE) {
  const cumpleN = hechoN === pedN, cumpleE = hechoE === pedE;
  if (cumpleN && !cumpleE) return { deltaN: 10 + hechoN, deltaE: -(Math.abs(hechoE - pedE)) };
  if (cumpleE && !cumpleN) return { deltaN: -(Math.abs(hechoN - pedN)), deltaE: 10 + hechoE };
  return { deltaN: -(Math.abs(hechoN - pedN)), deltaE: -(Math.abs(hechoE - pedE)) };
}
