import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece AA (batch overnight post-5r) — en la ÚLTIMA base de una mano no
// tiene que aparecer "Llevar base" en absoluto: solo "Cerrar mano"
// (capitán) es accionable en ese punto, y las cartas jugadas de esa última
// base tienen que seguir visibles en la mesa hasta que la mano cierra de
// verdad (no antes, ni requiriendo el click de Llevar base que ya no
// existe para este caso). Server-side: 20260706250000_last_base_direct_
// closing.sql — resolve_trick manda la última base derecho a 'closing'
// (turn_seat al ganador, igual que resolve_resolving hacía), sin pasar por
// 'resolving'. Verificado también contra el proyecto real en
// scripts/verify-resolving-last-base.mjs.
//
// Estructura "1,1": la única base de la mano 0 ES la última (y la única)
// — el caso más directo. La segunda mano ("1") no se juega, solo está para
// que close_hand tenga una "próxima mano" real y no salte a 'finished'
// (fuera de alcance de este spec, pero mantiene la estructura consistente
// con el resto de la suite).
test("online: la última base de la mano no muestra Llevar base, y sus cartas quedan visibles hasta cerrar", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Bidea (pie se auto-resuelve, piece D) hasta 'playing'.
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

    // Juega la única base (y por lo tanto ÚLTIMA base) de la mano, vigilando
    // en cada ronda que "Llevar base" nunca aparezca en ninguna sesión.
    let enClosing = false;
    let llevarBaseVistoAlgunaVez = false;
    for (let i = 0; i < 40 && !enClosing; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      for (const p of pages) {
        if (await p.getByRole("button", { name: "Llevar base" }).isVisible().catch(() => false)) {
          llevarBaseVistoAlgunaVez = true;
        }
      }
      for (const p of pages) {
        if (await p.getByText(/terminada/).isVisible().catch(() => false)) { enClosing = true; break; }
      }
      if (!enClosing) await new Promise((r) => setTimeout(r, 200));
    }
    expect(enClosing, "la mano no llegó a 'closing' a tiempo").toBe(true);
    expect(llevarBaseVistoAlgunaVez, "\"Llevar base\" no debería aparecer nunca para la última base de la mano").toBe(false);

    // Ya en 'closing': las 4 cartas de esa última base siguen en la mesa
    // (no cartasMesa=[]), y se anuncia quién la hizo — igual que
    // 'resolviendo' lo hace para cualquier otra base, pero sin el botón.
    for (const p of pages) {
      await expect(p.getByText("LA HIZO")).toBeVisible();
      await expect(p.getByRole("button", { name: "Llevar base" })).toHaveCount(0);
    }
    // Las cartas de mesa (cartasMesa) siempre renderizan a CARTA_MESA.w=37
    // (MesaCircular.jsx) sin importar la fase ni el asiento — a diferencia
    // de las cartas en la mano de cada jugador, que varían de tamaño
    // (CARTA_MANO, escalado 1.5x para mySeat). rect[width='37'] identifica
    // sin ambigüedad las 4 cartas de la base, nunca cartas de mano.
    const cartasEnMesa = await pages[0].locator("svg rect[width='37']").count();
    expect(cartasEnMesa, "las 4 cartas de la última base deberían seguir visibles en la mesa durante 'closing'").toBe(4);

    // Piece DD: el centro de la mesa también anuncia el resultado DE LA
    // MANO (no solo de la última base) — exactamente uno de "GANÓ LOCAL"/
    // "GANÓ VISITANTE"/"PERDIMOS LOS DOS" (mutuamente excluyentes por
    // regla de juego, ver comentario en PantallaPartidaOnline.jsx), y el
    // MISMO texto en las 4 sesiones — no se predice cuál de los tres
    // resultó (depende de qué mano tocó al azar), solo que haya uno solo
    // y sea consistente entre sesiones, mismo criterio que ya usa este
    // archivo de tests para el ganador del sorteo.
    const posibles = ["GANÓ LOCAL", "GANÓ VISITANTE", "PERDIMOS LOS DOS"];
    const resultadosVistos = await Promise.all(pages.map(async (p) => {
      for (const texto of posibles) {
        if (await p.getByText(texto, { exact: true }).isVisible().catch(() => false)) return texto;
      }
      return null;
    }));
    expect(resultadosVistos, "cada sesión debería mostrar uno de los tres resultados posibles").not.toContain(null);
    expect(new Set(resultadosVistos).size, "las 4 sesiones no coinciden en el resultado de la mano").toBe(1);

    // Solo un capitán puede cerrarla — el resto ve el mensaje de espera,
    // nunca el botón (gate ya cubierto en detalle en online-cierre-
    // reparto-por-rol.spec.js; acá solo confirma que es alcanzable desde
    // este estado sin pasos intermedios).
    const botonCerrar = (p) => p.getByRole("button", { name: /^Cerrar mano/ });
    let capitanPage = null;
    for (const p of pages) {
      if (await botonCerrar(p).isVisible().catch(() => false)) { capitanPage = p; break; }
    }
    expect(capitanPage, "ningún capitán vio el botón de cerrar mano").toBeTruthy();
    await botonCerrar(capitanPage).click();
    for (const p of pages) {
      await expect(p.getByText(/Mano 2/)).toBeVisible({ timeout: 20000 });
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});
