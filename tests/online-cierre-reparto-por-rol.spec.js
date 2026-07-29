import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece E (batch overnight post-5r) — jerarquía de botones de control de
// sala por rol:
//   - "Cerrar mano" (fase 'closing'): solo un capitán (de cualquiera de
//     los dos equipos) lo ve/puede accionarlo — el resto ve un mensaje de
//     espera. Server-authoritative (close_hand_captain_only, ver
//     20260706200000_captain_dealer_gates.sql), no solo ocultado en UI.
//   - "Repartir mano" (fase 'dealing'): solo quien reparte esa mano (el
//     asiento que la mesa etiqueta "PIE", dealer_seat) lo ve/puede
//     accionarlo — el resto ve un mensaje de espera. También server-
//     authoritative (deal_hand_dealer_only).
//   - "Salir de la sala" ya no aparece pegado a ninguno de los dos
//     botones anteriores.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch). Usa estructura de 1
// carta (auto-resuelve el pedido del pie, piece D) para llegar rápido a
// 'closing' con el mínimo de pasos.

test("online: cerrar mano y repartir mano quedan gateados por rol (capitán / próximo repartidor)", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Bidea mano (pie se auto-resuelve, piece D) hasta 'playing'.
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    let manoPage = null;
    for (let intento = 0; intento < 30 && !manoPage; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoPage, "ninguna sesión mostró el panel de pedir a tiempo").toBeTruthy();
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

    // Juega la única base (1 carta cada uno) hasta llegar a 'closing'.
    let enClosing = false;
    for (let i = 0; i < 40 && !enClosing; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      for (const p of pages) {
        if (await p.getByText(/terminada/).isVisible().catch(() => false)) { enClosing = true; break; }
      }
      if (!enClosing) await new Promise((r) => setTimeout(r, 250));
    }
    expect(enClosing, "la mano no llegó a 'closing' a tiempo").toBe(true);

    // Solo un capitán ve "Cerrar mano" — el resto ve el mensaje de espera,
    // nunca el botón.
    const botonCerrar = (p) => p.getByRole("button", { name: /^Cerrar mano/ });
    const capitanPages = [];
    const noCapitanPages = [];
    for (const p of pages) {
      if (await botonCerrar(p).isVisible().catch(() => false)) capitanPages.push(p);
      else noCapitanPages.push(p);
    }
    expect(capitanPages.length, "tiene que haber al menos un capitán viendo el botón").toBeGreaterThan(0);
    for (const p of noCapitanPages) {
      await expect(botonCerrar(p)).toHaveCount(0);
      await expect(p.getByText(/Esperando a que un capitán cierre la mano/)).toBeVisible();
    }

    await botonCerrar(capitanPages[0]).click();

    // Repartir mano — solo el próximo repartidor lo ve.
    const botonRepartir = (p) => p.getByRole("button", { name: /^Repartir/ });
    let repartidorPage = null;
    for (let intento = 0; intento < 20 && !repartidorPage; intento++) {
      for (const p of pages) {
        if (await botonRepartir(p).isVisible().catch(() => false)) { repartidorPage = p; break; }
      }
      if (!repartidorPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(repartidorPage, "ninguna sesión mostró el botón de repartir a tiempo").toBeTruthy();
    for (const p of pages) {
      if (p === repartidorPage) continue;
      await expect(botonRepartir(p)).toHaveCount(0);
      await expect(p.getByText(/Esperando a que .* reparta la mano/)).toBeVisible();
    }

    await botonRepartir(repartidorPage).click();
    for (const p of pages) {
      await expect(p.getByText(/Mano 2/)).toBeVisible({ timeout: 20000 });
    }

    // "Salir de la sala" sigue presente (nunca desaparece del todo), pero
    // ya no es la única otra acción pegada al botón principal — sigue
    // siendo clickeable en cualquier sesión.
    await expect(pages[0].getByRole("button", { name: "Salir de la sala" })).toBeVisible();

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
