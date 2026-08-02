import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece MM (batch overnight post-EE) — "Salir de la sala" vivía como un
// botón distinto en cada pantalla: BotonSalir (chico, rojo, con
// confirmación) dentro de PantallaPartidaOnline.jsx, pero un <button
// style={secondaryBtnStyle()}> sin confirmación en los 3 mount points de
// PantallaOnlineSala.jsx (selección de equipo, sala/error, listo). Piece
// MM unificó los dos en el MISMO componente compartido
// (src/components/BotonSalir.jsx), en ese momento clavado con
// position:fixed a la esquina inferior izquierda del VIEWPORT.
//
// Piece PP (resumida) cambió el criterio: ya no es un overlay flotante —
// vive en el flujo normal del documento, alineado a la izquierda
// (alignSelf:"flex-start"). En las pantallas que tienen "la habitación"
// (el canvas cuadrado de MesaCircular — playing/resolving/copas_menu/
// oros_menu/closing/bidding) queda justo debajo del borde exterior de esa
// mesa; en las que no la tienen (sala/lobby, dealing, finished) queda
// igual de no-flotante, abajo a la izquierda del contenido que haya —
// mismo principio universal, sin necesitar la misma posición Y exacta en
// las dos (eso era lo viejo, ya no aplica).
test("online: 'Salir de la sala' vive en flujo normal (no flotante), chico y alineado a la izquierda en la sala y en la partida", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "3", sinAses: true });

    const host = pages[0];
    const boton = host.getByRole("button", { name: "Salir de la sala" });

    // Pantalla de sala (lobby, sin "la habitación") — no flotante, chico,
    // alineado a la izquierda.
    await expect(boton).toBeVisible();
    const rectSala = await boton.boundingBox();
    const fontSala = await boton.evaluate((el) => getComputedStyle(el).fontSize);
    const posicionSala = await boton.evaluate((el) => getComputedStyle(el).position);
    expect(posicionSala, "no es un overlay flotante (position:fixed/absolute) en la sala").toBe("static");
    expect(rectSala.x, "alineado a la izquierda en la sala").toBeLessThan(40);

    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    await expect(host.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

    // Pantalla de partida en curso (bidding — TIENE "la habitación").
    await expect(boton).toBeVisible();
    const rectPartida = await boton.boundingBox();
    const fontPartida = await boton.evaluate((el) => getComputedStyle(el).fontSize);
    const posicionPartida = await boton.evaluate((el) => getComputedStyle(el).position);
    expect(posicionPartida, "no es un overlay flotante (position:fixed/absolute) en la partida").toBe("static");
    expect(rectPartida.x, "alineado a la izquierda en la partida").toBeLessThan(40);

    // Mismo tamaño/tipografía en las dos — lo único que sigue siendo
    // idéntico entre pantallas (la posición Y ahora depende del
    // contenido de cada una a propósito, ya no tiene que coincidir).
    expect(fontPartida, "mismo tamaño de fuente en sala y en partida").toBe(fontSala);
    expect(rectPartida.height, "mismo alto en sala y en partida").toBeCloseTo(rectSala.height, 0);

    // El chequeo específico de piece PP: en la partida, el botón tiene
    // que quedar JUSTO DEBAJO del borde exterior de "la habitación" (el
    // <svg> cuadrado de MesaCircular), no en cualquier lugar de la
    // pantalla ni pegado al fondo del viewport.
    const svgRect = await host.locator("svg").first().boundingBox();
    expect(svgRect, "la pantalla de bidding tiene que tener la mesa (svg) montada").toBeTruthy();
    expect(rectPartida.y, "el botón cae debajo del borde inferior de la mesa").toBeGreaterThanOrEqual(svgRect.y + svgRect.height - 1);
    expect(rectPartida.y - (svgRect.y + svgRect.height), "el botón queda pegado (sin separación grande) al borde inferior de la mesa").toBeLessThan(70);
  } finally {
    for (const c of contexts) await c.close();
  }
});
