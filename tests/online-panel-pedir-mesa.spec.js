import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece Y (batch overnight post-5r) — el panel de pedir/kamikaze (centro de
// la mesa durante 'bidding') antes ocupaba un recuadro fijo de 280x300 que
// sobresalía de la elipse "mesa" (mesaRX/mesaRY en MesaCircular.jsx) y no
// tenía fondo/borde propio removido todavía. Ahora: (1) sin fondo/borde
// propio (PanelPedir.jsx/EsperaPedido en PantallaPartidaOnline.jsx), y (2)
// su recuadro (contenidoBidding) siempre cae adentro del bounding box del
// paño de la mesa, en vez de sobresalir de ella. Usa la estructura con más
// bases posible para 4 jugadores (maxCartas(4)=7, ver engine/structures.js)
// para ejercitar el peor caso (8 botones de número, la fila más alta).
//
// Rediseño de mesa ovalada: la elipse interna vieja (<ellipse rx="150"/
// "165">) ya no existe — la mesa pasó de óvalo elíptico a pista tipo
// "estadio" (dos semicírculos + tramos rectos, ver mesaOvalada.js), así
// que el paño verde es un <path>, no un <ellipse>. El selector cambia a
// buscar ese <path> por su color de relleno (PAÑO_FILL en MesaCircular.jsx,
// el mismo verde en las tres cantidades de jugadores) en vez de un radio
// fijo — la propiedad que este test verifica (el panel de pedir cabe
// adentro del paño) no cambió, solo cómo identificar el paño en el DOM.
test("online: el panel de pedir no tiene fondo/borde propio y cabe dentro de la elipse mesa", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "7,7", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Encuentra la sesión que ve el panel real (con botón CONFIRMA).
    let manoPage = null;
    for (let i = 0; i < 30 && !manoPage; i++) {
      for (const p of pages) {
        if (await p.getByRole("button", { name: /CONFIRMA/ }).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 300));
    }
    expect(manoPage, "ninguna sesión mostró el panel de pedir a tiempo").toBeTruthy();

    // (1) sin fondo/borde propio: el contenedor inmediato del botón
    // CONFIRMA (la raíz de PanelPedir) no debe declarar su propio borde.
    const confirmBtn = manoPage.getByRole("button", { name: /CONFIRMA/ });
    const panelRoot = manoPage.locator("div").filter({ has: confirmBtn }).last();
    const borderWidth = await panelRoot.evaluate((el) => getComputedStyle(el).borderWidth);
    expect(borderWidth, `PanelPedir no debería declarar su propio borde, midió ${borderWidth}`).toBe("0px");

    // (2) el recuadro del centro cabe dentro del bounding box del paño
    // verde (el <path> interno, distinto del borde de madera exterior).
    const dims = await manoPage.evaluate(() => {
      const paño = document.querySelector("path[fill='#1f4a34']");
      const overlay = document.querySelector("svg").nextElementSibling;
      return {
        mesa: paño.getBoundingClientRect(),
        overlay: overlay.getBoundingClientRect(),
      };
    });

    expect(dims.overlay.left, "el panel se sale de la elipse mesa por la izquierda").toBeGreaterThanOrEqual(dims.mesa.left - 1);
    expect(dims.overlay.right, "el panel se sale de la elipse mesa por la derecha").toBeLessThanOrEqual(dims.mesa.right + 1);
    expect(dims.overlay.top, "el panel se sale de la elipse mesa por arriba").toBeGreaterThanOrEqual(dims.mesa.top - 1);
    expect(dims.overlay.bottom, "el panel se sale de la elipse mesa por abajo").toBeLessThanOrEqual(dims.mesa.bottom + 1);
  } finally {
    for (const c of contexts) await c.close();
  }
});
