import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

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

// Batch fix #3 (post-pieza-J): excepción puntual a la convención de piece
// PP de arriba — SOLO en la pantalla de cierre de mano ('closing'),
// Roberto pidió que el botón quede clavado abajo de todo el viewport en
// vez de seguir la regla general de "flujo normal, pegado a la
// habitación". Los otros 8 puntos de montaje (cubiertos por el test de
// arriba y el resto de la suite) no cambian — este test confirma que
// SOLO 'closing' es la excepción.
test("online: 'Salir de la sala' queda clavado abajo del viewport SOLO en la pantalla de cierre de mano", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    await expect(pages[0].getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

    // Bidea la única mano (1 carta, pie se auto-resuelve — piece D) y
    // juega la única base para llegar a 'closing', mismo patrón que
    // online-libreta.spec.js.
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    let manoPage = null;
    for (let intento = 0; intento < 30 && !manoPage; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoPage).toBeTruthy();
    let confirmado = false;
    for (let intento = 0; intento < 10 && !confirmado; intento++) {
      const ok = await manoPage.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (ok) {
        const btn = panelConfirma(manoPage);
        if (await btn.isEnabled({ timeout: 3000 }).catch(() => false)) await btn.click({ timeout: 5000 }).catch(() => {});
      }
      confirmado = !(await panelConfirma(manoPage).isVisible().catch(() => false));
      if (!confirmado) await new Promise((r) => setTimeout(r, 500));
    }
    expect(confirmado).toBe(true);

    let enClosing = false;
    for (let i = 0; i < 40 && !enClosing; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      for (const p of pages) {
        if (await p.getByText(/terminada/).isVisible().catch(() => false)) { enClosing = true; break; }
      }
      if (!enClosing) await new Promise((r) => setTimeout(r, 250));
    }
    expect(enClosing, "la mano no llegó a 'closing' a tiempo").toBe(true);

    const host = pages[0];
    const boton = host.getByRole("button", { name: "Salir de la sala" });
    await expect(boton).toBeVisible();

    // Recorre los ancestros del botón buscando position:fixed en vez de
    // adivinar cuál <div> puntual es "el" wrapper — `div:has(boton)`
    // matchea de sobra (el wrapper fixed que agrega esta pantalla, el de
    // alignSelf interno de BotonSalir, fondoStyle, #root...), así que
    // apostar a un índice fijo (.first()/.last()) es frágil.
    const tieneAncestroFixed = await boton.evaluate((el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (getComputedStyle(n).position === "fixed") return true;
      }
      return false;
    });
    expect(tieneAncestroFixed, "algún ancestro está clavado con position:fixed en la pantalla de cierre").toBe(true);

    const viewport = host.viewportSize();
    const rect = await boton.boundingBox();
    expect(viewport.height - (rect.y + rect.height), "pegado al borde inferior del viewport").toBeLessThan(40);
  } finally {
    for (const c of contexts) await c.close();
  }
});
