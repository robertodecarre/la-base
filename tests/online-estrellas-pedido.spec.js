import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece QQ (batch overnight post-EE) — las estrellas vacías de
// EstrellasPedido usaban el mismo trazo (0.8px, opacidad plena) que las
// rellenas; la única diferencia era el relleno transparente, difícil de
// distinguir a primera vista. Ahora las vacías llevan trazo más fino
// (0.5px) y más tenue (opacity 0.5).
//
// Estructura de 1 carta con mano pidiendo el valor MÁS ALTO disponible
// (el total, no 0): con opcionesValidas forzando "pedLocal+pedVisitante
// != total", eso obliga al pie a pedir el mismo valor (1) — así los dos
// equipos terminan con pedidas=1 (una sola estrella cada uno), y tras la
// única base, el equipo ganador queda con hechas=1 (estrella rellena) y
// el perdedor con hechas=0 (estrella vacía), listo para comparar el
// trazo de una rellena contra una vacía directamente.

function panelConfirma(page) { return page.getByRole("button", { name: /CONFIRMA/ }); }

async function paginaConConfirma(pages, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const p of pages) {
      if (await panelConfirma(p).isVisible().catch(() => false)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

test("online: las estrellas vacías de EstrellasPedido tienen trazo más fino/tenue que las rellenas", async ({ browser }) => {
  test.setTimeout(90_000);
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

    // Mano pide el valor más alto (el botón con mayor número disponible)
    // — con total_bases=1 eso es "1", lo que fuerza al pie (auto-resuelto
    // en la misma llamada, piece D) a pedir 1 también.
    const manoPage = await paginaConConfirma(pages);
    expect(manoPage, "ninguna sesión mostró el panel de pedir a tiempo").toBeTruthy();
    const botonesNumero = manoPage.getByRole("button", { name: /^\d+$/ });
    const cantidad = await botonesNumero.count();
    await botonesNumero.nth(cantidad - 1).click({ timeout: 5000 });
    await panelConfirma(manoPage).click({ timeout: 5000 });

    // Juega la única base hasta que el pie de resolución la resuelva
    // (tricks_won se actualiza ahí) — con estructura de 1 carta, unas
    // pocas rondas de jugarCartaDelTurnoActual alcanzan de sobra.
    for (let i = 0; i < 20; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }

    // Ahora exactamente un equipo tiene hechas=1 (estrella rellena) y el
    // otro hechas=0 (estrella vacía) — ambos con pedidas=1 (una sola
    // estrella visible cada uno). Localizamos las dos por los <span>★</span>
    // del resumen (ResumenMarcador) — son los únicos "★" fuera de la
    // tabla/mesa en esta fase, sin depender de cuál equipo ganó (depende
    // de las cartas repartidas al azar).
    const host = pages[0];
    await host.waitForTimeout(500);
    const spans = host.locator("span").filter({ hasText: "★" });
    const total = await spans.count();
    expect(total, "tienen que existir 2 estrellas visibles (1 por equipo)").toBe(2);

    const estilos = [];
    for (let i = 0; i < total; i++) {
      estilos.push(await spans.nth(i).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { opacity: cs.opacity, strokeWidth: cs.webkitTextStrokeWidth };
      }));
    }

    const rellenas = estilos.filter((e) => e.opacity === "1");
    const vacias = estilos.filter((e) => e.opacity !== "1");
    expect(rellenas.length, "una estrella rellena (opacity 1)").toBe(1);
    expect(vacias.length, "una estrella vacía (opacity < 1)").toBe(1);
    expect(vacias[0].opacity, "la vacía usa opacity 0.5").toBe("0.5");
    expect(parseFloat(vacias[0].strokeWidth), "el trazo de la vacía es más fino que el de la rellena")
      .toBeLessThan(parseFloat(rellenas[0].strokeWidth));
    expect(rellenas[0].strokeWidth, "la rellena mantiene el trazo original de 0.8px").toBe("0.8px");
    expect(vacias[0].strokeWidth, "la vacía usa 0.5px").toBe("0.5px");
  } finally {
    for (const c of contexts) await c.close();
  }
});
