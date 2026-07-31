import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece Z (batch overnight post-5r) — investigó un bug real reportado en
// vivo: en pinch/ctrl-zoom, el panel de pedir se veía "despegado" de la
// mesa en Firefox (escalaba distinto), pero en Edge escalaba junto con la
// mesa como una unidad. Medido con Playwright (ver scripts/_investigate-
// piece-z.mjs, no committeado — throwaway): la causa NO era específica de
// Firefox — con la forma anterior a piece Y (recuadro fijo de 280px de
// CENTRO_BIDDING_W encima de un <svg> que escala fluido por su viewBox),
// achicar el viewport (mismo efecto de layout que el "Page Zoom" de
// ctrl+/ctrl- o el pinch de Firefox, que sí dispara reflow real —
// distinto del pinch de Chromium/Edge en desktop, que es un escalado de
// composición post-layout sin reflow) producía el MISMO desvío de
// proporción overlay/svg en Chromium Y en Firefox por igual (~0.153 en
// los dos, medido). O sea: el desajuste de coordenadas era un defecto de
// CSS puro (px fijo vs % fluido) agnóstico de motor — solo se veía "en
// Firefox nomás" porque ese es el navegador cuyo gesto de pinch dispara
// ese reflow en la práctica, no porque el bug viviera en su motor de
// renderizado. Piece Y (que ya reemplazó CENTRO_BIDDING_W/H fijos por
// porcentajes del propio semieje de la elipse mesa, ver MesaCircular.jsx)
// ya lo resuelve como efecto lateral, confirmado acá con drift ≈ 0 en los
// dos motores — este spec lo deja como regresión permanente en vez de
// depender de la investigación puntual.
test("online: el panel de pedir escala en la misma proporción que la mesa bajo reflow (no se desincroniza)", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = [
    await browser.newContext({ viewport: { width: 900, height: 900 } }),
    await browser.newContext(),
    await browser.newContext(),
    await browser.newContext(),
  ];
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "3,3", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const host = pages[0];
    await host.setViewportSize({ width: 900, height: 900 });
    await host.waitForTimeout(400);

    const measure = () => host.evaluate(() => {
      const svg = document.querySelector("svg");
      const overlay = svg.nextElementSibling;
      const svgRect = svg.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      return overlayRect.width / svgRect.width;
    });

    const ratioWide = await measure();
    await host.setViewportSize({ width: 500, height: 500 });
    await host.waitForTimeout(400);
    const ratioNarrow = await measure();

    expect(
      Math.abs(ratioNarrow - ratioWide),
      `overlay/svg ratio se desincronizó bajo reflow: wide=${ratioWide} narrow=${ratioNarrow}`
    ).toBeLessThan(0.01);
  } finally {
    for (const c of contexts) await c.close();
  }
});
