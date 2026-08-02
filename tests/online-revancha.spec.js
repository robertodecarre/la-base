import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual, cerrarManoAmbosCapitanes } from "./helpers.js";

// Piece BB (batch overnight post-5r) — "REVANCHA" en la pantalla de fin de
// partida reinicia un partido nuevo en la MISMA sala: mismos jugadores/
// equipos/asientos (sin volver a "elegí tu equipo"), hand_number y
// puntajes a cero. Server-side ya cubierto end-to-end contra el proyecto
// real en scripts/verify-revancha.mjs — este spec verifica el flujo
// completo desde la UI: click en REVANCHA lleva de 'finished' de vuelta a
// la pantalla de repartir la mano 0, sin pasar por selección de equipo.
//
// Estructura "1" (una sola mano de 1 carta): el camino más corto a
// 'finished' — bid del pie se auto-resuelve (piece D) y, con piece AA, la
// única/última base va derecho a 'closing' sin "Llevar base".

test("online: REVANCHA reinicia la partida en la misma sala sin volver a elegir equipo", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Bidea (pie se auto-resuelve, piece D) y juega la única base.
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
    for (let intento = 0; intento < 12 && !confirmado; intento++) {
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

    // Piece LL: hacen falta los dos capitanes para cerrar la mano.
    await cerrarManoAmbosCapitanes(pages);

    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toBeVisible({ timeout: 20000 });
    }

    // Click REVANCHA desde CUALQUIER sesión (no solo capitán — ver
    // comentario de onRevancha/revancha_partida) lleva a las 4 de vuelta a
    // 'dealing' de la mano 0, sin pasar por "ELEGÍ TU EQUIPO". P0/P1 son
    // siempre los capitanes (choose_team_rpc.sql); P2 no lo es.
    const noCapitanPage = pages[2];
    await expect(noCapitanPage.getByRole("button", { name: "REVANCHA" })).toBeVisible();
    await noCapitanPage.getByRole("button", { name: "REVANCHA" }).click();

    for (const p of pages) {
      await expect(p.getByText("ELEGÍ TU EQUIPO")).toHaveCount(0);
    }
    let repartidorPage = null;
    for (let intento = 0; intento < 20 && !repartidorPage; intento++) {
      for (const p of pages) {
        if (await p.getByRole("button", { name: "DAR" }).isVisible().catch(() => false)) { repartidorPage = p; break; }
      }
      if (!repartidorPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(repartidorPage, "ninguna sesión mostró el botón de repartir (DAR) tras la revancha").toBeTruthy();
    await repartidorPage.getByRole("button", { name: "DAR" }).click();

    // El partido nuevo se reparte y llega a pedir con normalidad — misma
    // sala, mismos equipos, sin arrastrar nada de la partida anterior.
    let manoPage2 = null;
    for (let intento = 0; intento < 30 && !manoPage2; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage2 = p; break; }
      }
      if (!manoPage2) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoPage2, "ninguna sesión mostró el panel de pedir del partido nuevo a tiempo").toBeTruthy();
  } finally {
    for (const c of contexts) await c.close();
  }
});
