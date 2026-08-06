import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece K (batch overnight post-5r) — mySeat (el asiento propio, marcado
// "VOS") renderiza más grande que el resto de los asientos. Mide el
// tamaño real de un elemento en el SVG en vez de asumir el valor — si
// alguien vuelve a tocar el factor de escala sin querer, esto lo agarra.
//
// Follow-up al rediseño de mesa ovalada: SorteoAnimado.jsx (segundo test
// de este archivo) ahora también usa mesaOvalada.js/STADIUM_PARAMS (antes
// tenía su propio layout circular con un factor 1.5x hardcodeado aparte)
// — los dos tests miden el mismo STADIUM_PARAMS[4].mySeatScale=1.55
// ahora, no dos números distintos.

test("online: el asiento propio (VOS) mide STADIUM_PARAMS[4].mySeatScale el resto de los asientos", async ({ browser }) => {
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
    // Rediseño de mesa ovalada: ya no hay un <rect rx="16"> de fondo por
    // asiento (la mesa pasó de casillero cuadrado a carita SVG sobre el
    // paño) — el proxy de tamaño ahora es el <svg> anidado de ReactionFace
    // (width=faceR*2.1*2, ver mesaOvalada.js), que escala 1:1 con el
    // factor de "asiento propio" de ESE asiento. Ya no es un 1.5x fijo
    // (MYSEAT_SCALE): mesaOvalada.js afina mySeatScale por cantidad de
    // jugadores (STADIUM_PARAMS[4].mySeatScale = 1.55, valor tal cual el
    // mockup de referencia "Mesa Ovalada para La Base"), la razón sigue
    // siendo un chequeo de regresión real (agarra si alguien vuelve a
    // tocar ese valor sin querer), solo que ya no es el mismo número en
    // las tres cantidades de jugadores — ver el segundo test de este
    // archivo (SorteoAnimado, pantalla aparte) que sigue midiendo 1.5x
    // porque esa pantalla no forma parte de este rediseño.
    // host es siempre P0 (crearYUnirseSalaOnline: el creador de la sala
    // pica LOCAL primero, primer asiento = seat 0) — comparar contra P1
    // específicamente, en vez de un rol como "PIE", evita el caso borde
    // en que host resulte ser también el repartidor (mismo asiento
    // matchearía las dos búsquedas).
    const miAsiento = host.locator("svg g", { hasText: "VOS" }).first();
    const otroAsiento = host.locator("svg g", { hasText: "P1" }).first();

    const miAncho = await miAsiento.locator("svg").first().getAttribute("width");
    const otroAncho = await otroAsiento.locator("svg").first().getAttribute("width");

    const ratio = parseFloat(miAncho) / parseFloat(otroAncho);
    expect(ratio, `esperaba 1.55x (STADIUM_PARAMS[4].mySeatScale), mi ancho=${miAncho} otro ancho=${otroAncho}`).toBeCloseTo(1.55, 2);
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Rediseño de mesa ovalada (follow-up): SorteoAnimado.jsx pasó a compartir
// mesaOvalada.js con MesaCircular.jsx (antes tenía su propio layout
// circular con recuadro por asiento y un 1.5x hardcodeado aparte) — el
// asiento propio se reconoce por tamaño antes de leer el nombre, ahora con
// el mismo STADIUM_PARAMS[4].mySeatScale=1.55 que la mesa real. Se mide
// ANTES de tocar "Dar vuelta tu carta"/ARRANCAMOS (el tamaño no depende de
// si la carta ya se volteó). Ya no hay <rect rx="8"> de fondo por asiento
// (mismo motivo que el primer test de este archivo) — proxy de tamaño:
// el <svg> anidado de ReactionFace.
test("online: en el sorteo, el asiento propio (VOS) mide STADIUM_PARAMS[4].mySeatScale el resto de los asientos", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);

    const host = pages[0];
    await host.getByText("SORTEO", { exact: true }).waitFor({ timeout: 15000 });
    await host.getByRole("button", { name: "Dar vuelta tu carta" }).waitFor({ timeout: 10000 });

    const miAsiento = host.locator("svg g", { hasText: "P0" }).first();
    const otroAsiento = host.locator("svg g", { hasText: "P1" }).first();

    const miAncho = await miAsiento.locator("svg").first().getAttribute("width");
    const otroAncho = await otroAsiento.locator("svg").first().getAttribute("width");

    const ratio = parseFloat(miAncho) / parseFloat(otroAncho);
    expect(ratio, `esperaba 1.55x (STADIUM_PARAMS[4].mySeatScale), mi ancho=${miAncho} otro ancho=${otroAncho}`).toBeCloseTo(1.55, 2);

    // Cierra el sorteo con normalidad para no dejar la sala en un estado
    // raro (aunque el test ya obtuvo lo que necesitaba).
    for (let i = 0; i < pages.length; i++) {
      await pages[i].getByRole("button", { name: "Dar vuelta tu carta" }).click({ timeout: 10000 });
    }
    for (const p of pages) {
      let confirmado = false;
      for (let intento = 1; intento <= 5 && !confirmado; intento++) {
        const ok = await p.getByRole("button", { name: "ARRANCAMOS" }).click({ timeout: 8000 }).then(() => true).catch(() => false);
        if (ok) { confirmado = true; break; }
        const siguesEnSorteo = await p.getByText("SORTEO", { exact: true }).isVisible().catch(() => false);
        if (!siguesEnSorteo) { confirmado = true; break; }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!confirmado) throw new Error("no se pudo confirmar ARRANCAMOS tras varios intentos");
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
