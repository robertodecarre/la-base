import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece M (batch overnight post-5r): "Salir de la sala" ahora pide
// confirmación (antes salía directo con un solo click, sin red), y
// join_room ya no rechaza a un miembro existente que intenta volver a
// entrar a una sala que dejó 'waiting' (el bug real detrás de "no me deja
// volver a entrar" — ver 20260706210000_join_room_reentry_fix.sql).
//
// Esta pieza es la cobertura que online-reconexion-sala.spec.js (piece B)
// NO tiene: esa prueba solo cubre reload/corte de red de la MISMA sesión
// (localStorage con el roomId intacto, join_room nunca se vuelve a
// llamar). Acá la sesión sale de verdad (localStorage se limpia, vuelve a
// la pantalla inicial) y tiene que reingresar por "Unirse a sala" con el
// código — el único camino que ejercita el fix de join_room.
//
// A propósito NO toca la pantalla/animación de sorteo (fuera de alcance
// para este batch) — usa estructura de 1 carta, mismo patrón ya probado
// por online-hand-refresh.spec.js.

function panelConfirma(page) {
  return page.getByRole("button", { name: /CONFIRMA/ });
}

async function paginaConConfirma(pages, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const p of pages) {
      if (await panelConfirma(p).isVisible().catch(() => false)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("ninguna sesión mostró el panel de pedir a tiempo");
}

async function confirmarPedidoEnQuienCorresponda(pages) {
  for (let intento = 1; intento <= 10; intento++) {
    const p = await paginaConConfirma(pages);
    const ok = await p.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    const confirmBtn = panelConfirma(p);
    if (!(await confirmBtn.isEnabled({ timeout: 3000 }).catch(() => false))) continue;
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
  }
  throw new Error("el pedido no se confirmó tras varios intentos");
}

test("online: salir de la sala pide confirmación, y reingresar mid-game por código devuelve al jugador a su asiento/equipo", async ({ browser }) => {
  test.setTimeout(150_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    const code = await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Sala ya dejó 'waiting' (deal_hand corrió, rooms.status='playing') —
    // el escenario exacto donde join_room fallaba antes del fix.
    await confirmarPedidoEnQuienCorresponda(pages); // mano (y pie, auto-resuelto)

    const saliente = pages[1]; // VISITANTE, asiento 1
    const nombreSaliente = nombres[1];

    // Cancelar la confirmación tiene que dejar a la sesión exactamente
    // donde estaba (todavía en la mesa, sin salir) — cubre el motivo por
    // el que se agregó el diálogo (evitar un click perdido).
    await saliente.getByRole("button", { name: "Salir de la sala" }).click();
    await expect(saliente.getByText("¿Ya te vas, forro?")).toBeVisible({ timeout: 5000 });
    await saliente.getByRole("button", { name: "ME QUEDO" }).click();
    await expect(saliente.getByText("¿Ya te vas, forro?")).toHaveCount(0);
    await expect(saliente.getByText(/Mano 1/)).toBeVisible();

    // Ahora sí: confirmar la salida real.
    await saliente.getByRole("button", { name: "Salir de la sala" }).click();
    await expect(saliente.getByText("¿Ya te vas, forro?")).toBeVisible({ timeout: 5000 });
    await saliente.getByRole("button", { name: "ME VOY A LA MIERDA" }).click();
    await expect(saliente.getByRole("button", { name: /Crear sala/ })).toBeVisible({ timeout: 15000 });
    await expect(saliente.getByRole("button", { name: /Unirse a sala/ })).toBeVisible();

    // Las otras 3 sesiones no deberían verse afectadas por la salida de P1
    // (players sigue teniendo su fila — join_room/salir no la borra).
    await expect(pages[0].getByText(/Mano 1/)).toBeVisible();

    // Reingresa por código — el único camino que re-ejecuta join_room.
    await saliente.getByRole("button", { name: /Unirse a sala/ }).click();
    await saliente.getByPlaceholder("ABCDE").fill(code);
    await saliente.getByPlaceholder("Ej: Tincho").fill(nombreSaliente);
    await saliente.getByRole("button", { name: "Unirse", exact: true }).click();

    // La aserción central: vuelve derecho a la mesa en su propio
    // asiento/equipo (VISITANTE, asiento 1) — no a "ELEGÍ TU EQUIPO" (ya
    // había elegido) ni a un error de room_not_open.
    await expect(saliente.getByText("ELEGÍ TU EQUIPO")).toHaveCount(0);
    await expect(saliente.getByText(/room_not_open/)).toHaveCount(0);
    await expect(saliente.getByText(/Mano 1/)).toBeVisible({ timeout: 20000 });
    // P1 fue el primer jugador en elegir VISITANTE (asiento 1), así que
    // choose_team lo hizo capitán de ese equipo — si el reingreso hubiera
    // creado una fila nueva en vez de devolver la existente, is_captain
    // volvería a false y este badge no aparecería.
    const miAsiento = saliente.locator("svg g", { hasText: "VOS" }).first();
    await expect(miAsiento).toBeVisible({ timeout: 10000 });
    await expect(miAsiento.getByText("★CAP")).toBeVisible();

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
