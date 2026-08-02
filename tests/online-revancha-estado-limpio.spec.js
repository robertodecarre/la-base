import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual, cerrarManoAmbosCapitanes } from "./helpers.js";

// Piece RR (batch overnight post-EE, follow-up a piece KK) — piece KK
// root-causó estado viejo pegado tras REVANCHA (cartas de la mano
// anterior en la mesa, panel de As de Copas espontáneo, reloj sin efecto)
// a un mismo origen: onRevancha nunca re-fetchea estado completo tras el
// éxito de la RPC, así que TODO el reset (potencialmente decenas de
// DELETEs de played_cards + el UPDATE de game_state, todo en una sola
// transacción de revancha_partida) queda librado a que cada delta
// individual de Realtime llegue entero y en orden — sin ninguna garantía
// real de eso (ver el comentario largo en useSala.js sobre backfill).
//
// Piece RR implementó el fix sugerido: recargarEstado() (useSala.js) se
// llama explícitamente en onRevancha justo después de que la RPC
// resuelve, en vez de confiar solo en los deltas.
//
// Mismo flujo probado que online-revancha.spec.js (piece BB) — estructura
// "1", el camino más corto y confiable a 'finished' — con el chequeo
// central de piece RR agregado encima: apenas se reparte la mano 0 del
// revancha, la mesa tiene que estar vacía. Contra el proyecto real, ANTES
// del fix (ver git history — onRevancha sin el recargarEstado()) esto
// reprodujo 2/2 veces con un conteo exacto de 4 cartas fantasma en un
// escenario más largo (estructura "2,1"); DESPUÉS del fix, 2/2 veces
// limpio — mismo repro además confirmado manualmente extendido a
// "sobrevive incluso a la mano 1 del revancha" y sin panel de As de Copas
// espontáneo, ambos limpios post-fix (ver el resumen del batch para el
// detalle completo de la verificación manual).
//
// Cartas jugadas EN LA MESA se distinguen de las cartas EN LA MANO de un
// jugador por tamaño — CartaSVG las dibuja a CARTA_MESA={w:37,h:55} vs
// CARTA_MANO={w:31,h:44} (MesaCircular.jsx), selector preciso, no una
// heurística.

test("online: REVANCHA no deja cartas de la mano anterior pegadas en la mesa", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const host = pages[0];

  const cartasEnMesa = () => host.evaluate(() =>
    document.querySelectorAll('svg rect[width="37"][height="55"]').length
  );

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

    await cerrarManoAmbosCapitanes(pages);

    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toBeVisible({ timeout: 20000 });
    }

    // Piece RR: recargarEstado() corre en el onRevancha de la sesión que
    // CLICKEA el botón — el fix está deliberadamente acotado a esa sesión
    // (así lo pidió la tarea), no a las otras 3, que siguen dependiendo
    // de Realtime como antes. host es quien clickea Y a quien se le mide
    // el resultado, para probar exactamente lo que el fix cubre.
    await host.getByRole("button", { name: "REVANCHA" }).click();

    let repartidorPage = null;
    for (let intento = 0; intento < 20 && !repartidorPage; intento++) {
      for (const p of pages) {
        if (await p.getByRole("button", { name: "DAR" }).isVisible().catch(() => false)) { repartidorPage = p; break; }
      }
      if (!repartidorPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(repartidorPage, "ninguna sesión mostró el botón de repartir (DAR) tras la revancha").toBeTruthy();
    await repartidorPage.getByRole("button", { name: "DAR" }).click();

    // El chequeo central de piece RR: apenas se reparte la mano 0 del
    // revancha, la mesa tiene que estar vacía — nada de la mano anterior.
    let manoPage2 = null;
    for (let intento = 0; intento < 30 && !manoPage2; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage2 = p; break; }
      }
      if (!manoPage2) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoPage2, "ninguna sesión mostró el panel de pedir del partido nuevo a tiempo").toBeTruthy();
    await host.waitForTimeout(500);
    expect(await cartasEnMesa(), "no debería haber cartas jugadas en la mesa al arrancar la mano 0 del revancha").toBe(0);
  } finally {
    for (const c of contexts) await c.close();
  }
});
