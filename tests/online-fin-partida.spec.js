import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece L (batch overnight post-5r) — pantalla de fin de partida: anuncia
// el equipo ganador con el texto exacto "GANÓ EQUIPO LOCAL" o "GANÓ EQUIPO
// VISITANTE" (etiquetas absolutas fijas de piece 5r, no relativas a quién
// mira) y lista los nombres de los jugadores de ESE equipo. Usa una
// estructura de una sola mano de 1 carta — close_hand's rama "última mano
// del match" salta directo a phase='finished' apenas se cierra esa mano,
// el camino más corto posible hasta esta pantalla.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch).

test("online: la pantalla de fin de partida anuncia el equipo ganador y sus jugadores", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

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

    // Piece T: la última base de la mano también pasa por 'resolving'
    // ahora (antes saltaba derecho a 'closing') — hace falta clickear
    // "Llevar base" una vez que aparece.
    let enClosing = false;
    let sigBaseClickeado = false;
    for (let i = 0; i < 40 && !enClosing; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      if (!sigBaseClickeado) {
        for (const p of pages) {
          const btn = p.getByRole("button", { name: "Llevar base" });
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ timeout: 5000 }).catch(() => {});
            sigBaseClickeado = true;
            break;
          }
        }
      }
      for (const p of pages) {
        if (await p.getByText(/terminada/).isVisible().catch(() => false)) { enClosing = true; break; }
      }
      if (!enClosing) await new Promise((r) => setTimeout(r, 250));
    }
    expect(enClosing, "la mano no llegó a 'closing' a tiempo").toBe(true);

    // Un capitán cierra — con una sola mano en la estructura, close_hand
    // salta derecho a 'finished' (no hay 'dealing' de una mano 2).
    let capitanPage = null;
    for (const p of pages) {
      if (await p.getByRole("button", { name: /^Cerrar mano/ }).isVisible().catch(() => false)) { capitanPage = p; break; }
    }
    expect(capitanPage, "ninguna sesión mostró el botón de cerrar mano").toBeTruthy();
    await capitanPage.getByRole("button", { name: /^Cerrar mano/ }).click();

    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toBeVisible({ timeout: 20000 });
    }

    // El texto exacto tiene que ser uno de los dos — y el MISMO en las 4
    // sesiones (equipo absoluto, no relativo a quién mira — piece 5r).
    const textosGanador = await Promise.all(
      pages.map((p) => p.getByText(/^GANÓ EQUIPO (LOCAL|VISITANTE)$/).textContent())
    );
    expect(new Set(textosGanador).size, "las 4 sesiones no vieron el mismo texto de resultado").toBe(1);
    const ganoLocal = textosGanador[0] === "GANÓ EQUIPO LOCAL";

    // Los nombres del equipo ganador están listados (todas las sesiones
    // ven la misma lista — dato público, players) — el orden no está
    // garantizado (viene del array `players` de useSala, no necesariamente
    // ordenado por asiento), así que se compara por contenido, no por
    // texto exacto.
    const equipoGanadorNombres = nombres.filter((_, i) => (i % 2 === 0) === ganoLocal);
    const nombresPerdedor = nombres.filter((n) => !equipoGanadorNombres.includes(n));
    for (const p of pages) {
      const lineaGanadores = p.getByText(new RegExp(`^(${equipoGanadorNombres.join("|")}) · (${equipoGanadorNombres.join("|")})$`));
      await expect(lineaGanadores).toBeVisible();
      const texto = await lineaGanadores.textContent();
      for (const nombreGanador of equipoGanadorNombres) {
        expect(texto).toContain(nombreGanador);
      }
      for (const nombrePerdedor of nombresPerdedor) {
        expect(texto).not.toContain(nombrePerdedor);
      }
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
