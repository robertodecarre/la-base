// Reusa la misma regla que ya usa PanelPedir en el cliente
// (src/engine/bidding.js) para la restricción de suma del segundo pedido.
import { opcionesValidas } from "../../../src/engine/bidding.js";

export type EstadoPedido = {
  totalBases: number;
  requiredTeam: number;
  teamMano: number;
  bidMano: number | null;
};

// Lanza un Error con el mismo mensaje que espera _shared/errors.ts si el
// pedido no es válido. No hace ningún side-effect — solo valida.
export function validarPedido(
  { totalBases, requiredTeam, teamMano, bidMano }: EstadoPedido,
  value: unknown,
  kamikaze: unknown,
): { value: number; kamikaze: boolean } {
  if (!Number.isInteger(value)) throw new Error("invalid_bid");
  const v = value as number;
  const k = Boolean(kamikaze);

  if (k && requiredTeam !== teamMano) throw new Error("kamikaze_only_for_mano");
  if (k && totalBases <= 2) throw new Error("kamikaze_not_available");

  if (k) {
    if (v !== 0 && v !== totalBases) throw new Error("invalid_bid");
    return { value: v, kamikaze: true };
  }

  if (v < 0 || v > totalBases) throw new Error("invalid_bid");

  if (requiredTeam !== teamMano) {
    if (bidMano === null) throw new Error("invalid_bid");
    const opciones = opcionesValidas(bidMano, totalBases);
    if (!opciones.includes(v)) throw new Error("invalid_bid");
  }

  return { value: v, kamikaze: false };
}
