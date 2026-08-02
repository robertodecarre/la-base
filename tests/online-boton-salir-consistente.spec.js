import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece MM (batch overnight post-EE) — "Salir de la sala" vivía como un
// botón distinto en cada pantalla: BotonSalir (chico, rojo, con
// confirmación) dentro de PantallaPartidaOnline.jsx, pero un <button
// style={secondaryBtnStyle()}> sin confirmación en los 3 mount points de
// PantallaOnlineSala.jsx (selección de equipo, sala/error, listo). Ahora
// los dos archivos montan el MISMO componente compartido
// (src/components/BotonSalir.jsx), clavado en la esquina inferior
// izquierda vía position:fixed en vez de vivir en el flujo normal de cada
// pantalla — este spec confirma que su posición/tamaño en pantalla es
// IDÉNTICO en una pantalla de sala (lobby, antes de arrancar) y en una de
// partida en curso (bidding), no solo que el botón exista en las dos.

test("online: 'Salir de la sala' vive en la misma posición/tamaño en la sala y en la partida", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "3", sinAses: true });

    const host = pages[0];
    const boton = host.getByRole("button", { name: "Salir de la sala" });

    // Pantalla de sala (lobby, "listo" todavía no tocado por nadie).
    await expect(boton).toBeVisible();
    const rectSala = await boton.boundingBox();
    const fontSala = await boton.evaluate((el) => getComputedStyle(el).fontSize);

    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    await expect(host.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

    // Pantalla de partida en curso (bidding).
    await expect(boton).toBeVisible();
    const rectPartida = await boton.boundingBox();
    const fontPartida = await boton.evaluate((el) => getComputedStyle(el).fontSize);

    expect(rectPartida.x, "misma distancia al borde izquierdo en sala y en partida").toBeCloseTo(rectSala.x, 0);
    expect(rectPartida.y, "misma distancia al borde superior (y por lo tanto al inferior, viewport fijo) en sala y en partida").toBeCloseTo(rectSala.y, 0);
    expect(rectPartida.width, "mismo ancho en sala y en partida").toBeCloseTo(rectSala.width, 0);
    expect(rectPartida.height, "mismo alto en sala y en partida").toBeCloseTo(rectSala.height, 0);
    expect(fontPartida, "mismo tamaño de fuente en sala y en partida").toBe(fontSala);

    // Clavado a la esquina inferior izquierda del viewport, no solo
    // "consistente en alguna parte" — position:fixed contra el propio
    // viewport, no relativo al contenido de cada pantalla.
    const viewport = host.viewportSize();
    expect(rectPartida.x, "pegado al borde izquierdo").toBeLessThan(40);
    expect(rectPartida.y + rectPartida.height, "pegado al borde inferior").toBeGreaterThan(viewport.height - 40);
  } finally {
    for (const c of contexts) await c.close();
  }
});
