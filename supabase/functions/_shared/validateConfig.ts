// Reusa las mismas reglas que PantallaInicio ya respeta en el cliente
// (src/engine/structures.js), en vez de re-derivarlas en el servidor.
import { maxCartas } from "../../../src/engine/structures.js";

export type RoomConfig = {
  nJug: number;
  dosMazos: boolean;
  estructura: number[];
  ases: { espadas: boolean; copas: boolean; oros: boolean };
  kamikazes: number;
  clock: { habilitado: boolean; minutos: number; modo: "muerte" | "deportivo" } | null;
};

export function validarConfig(body: unknown): RoomConfig {
  if (typeof body !== "object" || body === null) throw new Error("invalid_config");
  const c = body as Record<string, unknown>;

  const nJug = c.nJug;
  if (nJug !== 4 && nJug !== 6 && nJug !== 8) throw new Error("invalid_config");

  const dosMazos = Boolean(c.dosMazos);
  if (dosMazos && nJug !== 8) throw new Error("invalid_config");

  const estructura = c.estructura;
  if (!Array.isArray(estructura) || estructura.length === 0) throw new Error("invalid_config");
  const max = maxCartas(nJug, dosMazos);
  for (const n of estructura) {
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("invalid_config");
  }

  const kamikazes = c.kamikazes;
  if (!Number.isInteger(kamikazes) || (kamikazes as number) < 0 || (kamikazes as number) > 3) {
    throw new Error("invalid_config");
  }

  const asesIn = c.ases as Record<string, unknown> | undefined;
  const ases = {
    espadas: Boolean(asesIn?.espadas),
    copas: Boolean(asesIn?.copas),
    oros: Boolean(asesIn?.oros),
  };

  let clock: RoomConfig["clock"] = null;
  if (c.clock) {
    const clockIn = c.clock as Record<string, unknown>;
    const minutos = clockIn.minutos;
    const modo = clockIn.modo;
    if (!Number.isInteger(minutos) || (minutos as number) < 1 || (minutos as number) > 60) {
      throw new Error("invalid_config");
    }
    if (modo !== "muerte" && modo !== "deportivo") throw new Error("invalid_config");
    clock = { habilitado: true, minutos: minutos as number, modo };
  }

  return { nJug, dosMazos, estructura: estructura as number[], ases, kamikazes: kamikazes as number, clock };
}
