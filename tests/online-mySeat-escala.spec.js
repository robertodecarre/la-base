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

// Piece X (batch overnight post-5r) — el mismo factor 1.5x ahora también se
// aplica en la pantalla de sorteo (SorteoAnimado.jsx), no solo en la mesa
// real: el asiento propio se reconoce por tamaño antes de leer el nombre.
// Se mide ANTES de tocar "Dar vuelta tu carta"/ARRANCAMOS (el tamaño de la
// caja no depende de si la carta ya se volteó). El <rect rx="8"> es el
// borde de la caja del asiento (único rx=8 en esta pantalla — las cartas
// SVG usan rx=2/3, ver CartaSVG.jsx), a diferencia del rx=16 de MesaCircular.
test("online: en el sorteo, el asiento propio (VOS) mide 1.5x el resto de los asientos", async ({ browser }) => {
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

    const miAncho = await miAsiento.locator("rect[rx='8']").first().getAttribute("width");
    const otroAncho = await otroAsiento.locator("rect[rx='8']").first().getAttribute("width");

    const ratio = parseFloat(miAncho) / parseFloat(otroAncho);
    expect(ratio, `esperaba 1.5x, mi ancho=${miAncho} otro ancho=${otroAncho}`).toBeCloseTo(1.5, 2);

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
