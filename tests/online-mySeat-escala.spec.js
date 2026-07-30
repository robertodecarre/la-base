import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece K (batch overnight post-5r) — mySeat (el asiento propio, marcado
// "VOS") renderiza a 1.5x el tamaño del resto de los asientos, no 1.4x
// (MYSEAT_SCALE en MesaCircular.jsx). Mide el <rect> de borde de mi propio
// asiento contra el de otro asiento directamente en el SVG en vez de
// asumir el valor — si alguien vuelve a tocar MYSEAT_SCALE sin querer,
// esto lo agarra.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch).

test("online: el asiento propio (VOS) mide 1.5x el resto de los asientos, no 1.4x", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const host = pages[0];
    // host es siempre P0 (crearYUnirseSalaOnline: el creador de la sala
    // pica LOCAL primero, primer asiento = seat 0) — comparar contra P1
    // específicamente, en vez de un rol como "PIE", evita el caso borde
    // en que host resulte ser también el repartidor (mismo asiento
    // matchearía las dos búsquedas). El borde de cada asiento es el
    // primer <rect rx="16"> dentro del <g filter> que lo envuelve (ver
    // MesaCircular.jsx) — width termina siendo boxW*escala.
    const miAsiento = host.locator("svg g", { hasText: "VOS" }).first();
    const otroAsiento = host.locator("svg g", { hasText: "P1" }).first();

    const miAncho = await miAsiento.locator("rect[rx='16']").first().getAttribute("width");
    const otroAncho = await otroAsiento.locator("rect[rx='16']").first().getAttribute("width");

    const ratio = parseFloat(miAncho) / parseFloat(otroAncho);
    expect(ratio, `esperaba 1.5x, mi ancho=${miAncho} otro ancho=${otroAncho}`).toBeCloseTo(1.5, 2);
  } finally {
    for (const c of contexts) await c.close();
  }
});
