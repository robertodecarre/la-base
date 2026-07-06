import { test, expect } from "@playwright/test";
import { iniciarPartida, jugarUnaManoCompleta } from "./helpers.js";

test("una mano completa se juega de punta a punta sin errores", async ({ page }) => {
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") erroresConsola.push(msg.text()); });

  await iniciarPartida(page, { nJug: 6 });
  const siguienteFase = await jugarUnaManoCompleta(page);

  // Tras cerrar la mano 1: sigue la partida (fase "repartir" para la mano 2)
  // o termina de entrada (kamikaze no declarado con la estrategia de pedido
  // arbitraria del test) — cualquiera de los dos es un cierre de mano válido.
  expect(["repartir", "fin", "muerto"]).toContain(siguienteFase);

  expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
});
