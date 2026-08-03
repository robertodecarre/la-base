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

// Batch fix #2 (post-pieza-J) — investigado antes como piece GG (scripts/
// _investigate-piece-gg.mjs, throwaway, no confirmó la causa raíz con
// certeza: un scrollbar nativo del SO aparecía en Firefox/Edge durante
// bidding, nunca en Chromium, incluso con de sobra alto libre — hipótesis
// de drift de sub-píxel entre motores en cómo redondean el % del panel
// CENTRO_BIDDING contra el <svg> escalado por viewBox. Se aplicó una
// mitigación defensiva (calc(...% - 2px) en el panel + overflow-x:hidden
// global en index.html) en vez de perseguir la causa exacta.
//
// Solo se deja como regresión permanente el chequeo HORIZONTAL: medido acá
// mismo con estructuraCustom="7" (mano chica, "de sobra alto libre" tal
// cual el reporte original), el overflow VERTICAL real es de 50-80px en
// viewports de escritorio comunes (1280x800), muy por encima de cualquier
// ruido de sub-píxel — es la altura genuina de la pantalla completa (SALA
// + resumen + mesa + botón salir), no un jitter invisible. Esa altura
// puede legítimamente superar un viewport chico y necesitar scroll de
// verdad; una aserción "nunca hay scroll vertical" sería falsa por
// diseño, no una regresión real. Horizontal es distinto: esta app nunca
// necesita scroll horizontal a propósito (single-column, centrado), así
// que cualquier overflow-x medible siempre es un bug, nunca contenido
// legítimo — de ahí el overflow-x:hidden global aplicado en index.html.
test("online: durante bidding, la página nunca queda con scroll horizontal medible (ni Firefox ni Chromium)", async ({ browser }) => {
  test.setTimeout(90_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "7", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    const host = pages[0];
    await expect(host.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    await host.evaluate(() => document.fonts.ready);

    const mideOverflowHorizontal = () => host.evaluate(() => ({
      bodyOverflowW: document.body.scrollWidth - document.body.clientWidth,
      htmlOverflowW: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    for (const size of [{ width: 1280, height: 800 }, { width: 900, height: 700 }, { width: 600, height: 500 }]) {
      await host.setViewportSize(size);
      await host.waitForTimeout(400);
      const m = await mideOverflowHorizontal();
      expect(m.bodyOverflowW, `body desborda horizontalmente en ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
      expect(m.htmlOverflowW, `html desborda horizontalmente en ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Follow-up al fix de arriba: el -2px de tolerancia no alcanzaba con
// totalBases altos — PanelPedir.jsx dibujaba los botones de número a un
// width/height/fontSize FIJO (25/25/12) sin importar cuántos hubiera, así
// que con totalBases=7 (8 botones: 0..7) la grilla se envolvía a dos
// filas dentro del panel angosto y empujaba el panel — y por lo tanto la
// página — más alto de lo esperado, reproducido en Firefox/Edge (nunca en
// Chromium, mismo patrón que el bug original). Fix: tamañoBoton() en
// PanelPedir.jsx encoge el botón a partir de 6 opciones. Este test
// confirma las dos puntas: con pocas opciones el tamaño no cambia (25px),
// y con muchas SÍ encoge Y la grilla se mantiene en una sola fila (todos
// los botones comparten la misma coordenada Y).
test("online: los botones de número de PanelPedir encogen con muchas opciones y no envuelven a dos filas", async ({ browser }) => {
  test.setTimeout(150_000);

  async function botonesDeNumero(pages) {
    // Solo la sesión del capitán a quien le toca pedir ve la grilla real
    // (interactiva) — el resto ve el texto de solo-lectura EsperaPedido,
    // sin botones. Reintenta porque el turno de "mano" puede tardar un
    // instante en asentarse tras el reparto animado.
    for (let intento = 0; intento < 30; intento++) {
      for (const p of pages) {
        const botones = p.getByRole("button", { name: /^\d+$/ });
        if (await botones.count().catch(() => 0) > 0) return { page: p, botones };
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error("ninguna sesión mostró la grilla de números a tiempo");
  }

  async function medirGrilla(pages) {
    const { botones } = await botonesDeNumero(pages);
    const n = await botones.count();
    const cajas = [];
    for (let i = 0; i < n; i++) cajas.push(await botones.nth(i).boundingBox());
    const anchos = cajas.map((c) => Math.round(c.width));
    const ys = cajas.map((c) => Math.round(c.y));
    return { n, anchoBoton: anchos[0], mismoAncho: anchos.every((w) => w === anchos[0]), unaSolaFila: new Set(ys).size === 1 };
  }

  // Caso chico (totalBases=3 -> 4 botones, 0..3): tamaño de sobra, no
  // debería encoger (tamañoBoton(4) = 25px) y obviamente una sola fila.
  {
    const nombres = ["P0", "P1", "P2", "P3"];
    const contexts = await Promise.all(nombres.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    try {
      await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "3", sinAses: true });
      for (const p of pages) await alternarListoEnPantalla(p);
      await pasarSorteoAnimado(pages);
      await expect(pages[0].getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

      const { n, anchoBoton, mismoAncho, unaSolaFila } = await medirGrilla(pages);
      expect(n, "4 botones (0..3)").toBe(4);
      expect(mismoAncho, "todos los botones del mismo tamaño").toBe(true);
      expect(anchoBoton, "con pocas opciones el tamaño no encoge (25px)").toBe(25);
      expect(unaSolaFila, "una sola fila con pocas opciones").toBe(true);
    } finally {
      for (const c of contexts) await c.close();
    }
  }

  // Caso reportado (totalBases=7 -> 8 botones, 0..7): tiene que encoger
  // (tamañoBoton(8) = 18px) Y quedarse en una sola fila (ya no envuelve).
  {
    const nombres = ["P0", "P1", "P2", "P3"];
    const contexts = await Promise.all(nombres.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    try {
      await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "7", sinAses: true });
      for (const p of pages) await alternarListoEnPantalla(p);
      await pasarSorteoAnimado(pages);
      await expect(pages[0].getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

      const { n, anchoBoton, mismoAncho, unaSolaFila } = await medirGrilla(pages);
      expect(n, "8 botones (0..7)").toBe(8);
      expect(mismoAncho, "todos los botones del mismo tamaño").toBe(true);
      expect(anchoBoton, "con 8 opciones el tamaño encoge (18px)").toBe(18);
      expect(unaSolaFila, "8 botones de 18px caben en una sola fila (ya no se envuelve)").toBe(true);
    } finally {
      for (const c of contexts) await c.close();
    }
  }
});
