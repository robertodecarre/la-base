import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece I (batch overnight post-5r) — cuando un equipo declara kamikaze,
// aparece un avioncito SVG (AvionKamikaze.jsx, no emoji) debajo de las
// estrellas de pedido/hecho de ESE equipo en el resumen (ResumenMarcador),
// y se queda ahí el resto de la mano — game_state.kamikaze_declared no se
// resetea hasta el próximo deal_hand. Kamikaze solo lo puede declarar el
// equipo mano (kamikaze_only_for_mano en submit_bid_rpc.sql), así que el
// avioncito aparece siempre del lado de mano, nunca del lado de pie.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch). Usa estructura de 3
// cartas (kamikaze exige totalBases>2 — kamikaze_not_available si no).

test("online: declarar kamikaze muestra el avión debajo de las estrellas del equipo mano", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "3,3", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Ningún avión todavía en ninguna sesión.
    for (const p of pages) {
      await expect(p.locator("svg path[d^='M12 2 L19.5 21']")).toHaveCount(0);
    }

    // Encuentra al capitán mano (el que ve el botón de kamikaze ✈️ en su
    // panel de pedir) y declara kamikaze pidiendo el total de bases.
    const kamikazeBtn = (page) => page.getByRole("button", { name: /^✈️/ });
    let manoPage = null;
    for (let i = 0; i < 30 && !manoPage; i++) {
      for (const p of pages) {
        if (await kamikazeBtn(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 300));
    }
    expect(manoPage, "ninguna sesión mostró el botón de kamikaze a tiempo").toBeTruthy();

    await kamikazeBtn(manoPage).click();
    // Con kamikaze activo, PanelPedir solo ofrece 0 o totalBases (3) —
    // pide el total.
    await manoPage.getByRole("button", { name: "3", exact: true }).click();
    await manoPage.getByRole("button", { name: /CONFIRMA/ }).click({ timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    // El avión aparece en TODAS las sesiones (dato público, gameState.
    // kamikaze_declared) del lado del equipo mano.
    for (const p of pages) {
      await expect(p.locator("svg path[d^='M12 2 L19.5 21']")).toHaveCount(1, { timeout: 15000 });
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
