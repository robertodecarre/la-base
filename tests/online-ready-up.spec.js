import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla } from "./helpers.js";

// Verifica el arranque "listo" por jugador (piece 5h) contra el proyecto
// real de Supabase: reemplazó el botón único "Empezar partida" (cualquiera
// lo aprieta y listo) por un set_ready individual por asiento — la mano se
// reparte sola apenas la sala está completa y las 4 sesiones quedan
// listas, sin que nadie tenga que clickear un "arrancar" aparte.
//
// Cubre lo que un test de backend puro (RPC directa) no puede probar: que
// el indicador ●/○ por asiento se ve en vivo desde OTRAS sesiones vía
// Realtime (sin canal nuevo — players ya viaja por el canal de useSala),
// que desmarcarse antes de que arranque la partida funciona, y que el
// arranque automático dispara sin que ninguna sesión clickee un botón de
// "empezar".

const NOMBRES = ["P0", "P1", "P2", "P3"];

// Busca la fila de un jugador por nombre y lee si su indicador de listo
// (●) está presente en esa misma fila.
async function estaListoSegunPantalla(page, nombre) {
  const nameSpan = page.locator("span", { hasText: nombre }).first();
  const fila = nameSpan.locator("xpath=..");
  const texto = await fila.textContent();
  return texto.includes("●");
}

// El indicador de listo de OTRA sesión llega por Realtime, no al toque —
// pollea en vez de asumir un delay fijo (la latencia real contra el
// proyecto de Supabase ya varió bastante entre corridas en otros tests de
// esta suite).
async function esperarIndicadorListo(page, nombre, esperado, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await estaListoSegunPantalla(page, nombre)) === esperado) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`el indicador de "${nombre}" no llegó a ${esperado ? "●" : "○"} a tiempo`);
}

test("online: arranque por \"listo\" individual, sin botón único", async ({ browser }) => {
  test.setTimeout(120_000);

  const contexts = await Promise.all(NOMBRES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, NOMBRES, { nJug: 4 });

    // No existe más un botón único de arranque — sanity check de que la
    // pieza vieja realmente se sacó, no solo que la nueva funciona.
    for (const p of pages) {
      await expect(p.getByRole("button", { name: "Empezar partida", exact: true })).toHaveCount(0);
    }

    // Solo 3 de 4 se marcan listos.
    await alternarListoEnPantalla(pages[0]);
    await alternarListoEnPantalla(pages[1]);
    await alternarListoEnPantalla(pages[2]);

    // El indicador de listo se ve en vivo desde OTRA sesión (pages[3],
    // que todavía no se marcó): P0/P1/P2 con ●, P3 (ella misma) con ○.
    for (const nombre of ["P0", "P1", "P2"]) {
      await esperarIndicadorListo(pages[3], nombre, true);
    }
    expect(await estaListoSegunPantalla(pages[3], "P3"), "P3 no debería verse listo todavía").toBe(false);

    // La sala está completa pero no todos están listos: la partida no
    // arranca — sigue en el lobby. pages[3] todavía puede marcarse listo,
    // el control sigue ahí (nunca hay forma de probar un negativo con
    // certeza absoluta, pero que el lobby siga de pie tras la propagación
    // de los 3 "listo" de arriba ya alcanza para descartar un arranque
    // prematuro con solo 3/4).
    for (const p of pages) {
      await expect(p.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible();
    }
    await expect(pages[3].getByRole("button", { name: "Estoy listo", exact: true })).toBeVisible();

    // P0 se desmarca antes de que arranque — el control es togglable.
    await alternarListoEnPantalla(pages[0]);
    await esperarIndicadorListo(pages[1], "P0", false);
    for (const p of pages) {
      await expect(p.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible();
    }

    // P0 se vuelve a marcar y P3 se marca por primera vez: las 4 sesiones
    // quedan listas — nadie clickea ningún botón de "arrancar".
    await alternarListoEnPantalla(pages[0]);
    await alternarListoEnPantalla(pages[3]);

    // deal_hand corre solo (cada sesión lo intenta al ver todosListos, ver
    // PantallaOnlineSala.jsx) y las 4 pasan de la sala al tablero de la
    // mano 1 en fase 'bidding' directo (no hay 'dealing' para la mano 0).
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 30000 });
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
