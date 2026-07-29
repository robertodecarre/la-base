import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece F (batch overnight post-5r) — el Tablero (historial de manos) deja
// de estar siempre visible; ahora vive detrás de un ícono de "libreta"
// entre los dos capitanes (siempre asientos 0 y 1 — choose_team garantiza
// que el capitán de cada equipo es el primero en elegirlo, ver
// LibretaIcon en MesaCircular.jsx), que togglea un overlay con el Tablero
// en layout vertical (una fila por mano, no una columna). También remueve
// el panel "pidió X · hizo Y" que vivía debajo del Tablero en la pantalla
// de cierre de mano — duplicaba, en texto, los mismos números que
// ResumenMarcador ya muestra arriba con estrellas.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch).

test("online: el historial de manos vive detrás del ícono de libreta, no siempre visible", async ({ browser }) => {
  test.setTimeout(150_000);
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

    const host = pages[0];

    // El ícono de libreta está presente y el overlay arranca cerrado.
    const libretaBtn = host.getByRole("button", { name: "Ver libreta" });
    await expect(libretaBtn).toBeVisible();
    await expect(host.getByText("LIBRETA")).toHaveCount(0);

    // Click abre el overlay con el Tablero (layout vertical: encabezado
    // MANO/CARTAS/LOCAL/VISITANTE, una fila por mano).
    await libretaBtn.click();
    await expect(host.getByText("LIBRETA")).toBeVisible();
    await expect(host.getByRole("columnheader", { name: "MANO" })).toBeVisible();
    await expect(host.getByRole("columnheader", { name: "CARTAS" })).toBeVisible();
    await expect(host.getByRole("row").filter({ hasText: "1" }).first()).toBeVisible();

    // Cerrar (botón ✕) vuelve a esconderlo, y el ícono cambia de estado
    // (aria-label refleja "abrir" de nuevo).
    await host.getByRole("button", { name: "✕" }).click();
    await expect(host.getByText("LIBRETA")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Ver libreta" })).toBeVisible();

    // Bidea (mano 1 carta, pie se auto-resuelve — piece D) y juega la
    // única base para llegar a 'closing'.
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

    // El panel redundante "pidió X · hizo Y" ya no está — el resumen de
    // arriba (ResumenMarcador, con estrellas) es la única fuente de esa
    // info en esta pantalla.
    for (const p of pages) {
      await expect(p.getByText(/pidió \d+ · hizo \d+/)).toHaveCount(0);
    }
    // La libreta sigue disponible en la pantalla de cierre también.
    await expect(host.getByRole("button", { name: "Ver libreta" })).toBeVisible();

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
