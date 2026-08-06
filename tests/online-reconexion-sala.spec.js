import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece B (batch overnight post-5r) — auditoría de "reconexión a una sala
// activa" (reload de página / relanzar la app / corte de red): el pedido
// original asumía que esto estaba roto y pedía encontrar la causa raíz
// antes de tocar nada. Reproducido a mano contra el proyecto real en
// varios escenarios (team-selection sin elegir todavía, mid-bidding,
// mid-playing con cartas ya jugadas, corte de red sin reload) — TODOS
// funcionaron correctamente sin cambios de código: session persistence
// (supabase-js) + fetch-on-mount de useSala + el fix de sorteoCumplido
// (piece 5l/ebb6609, fuera de alcance para este batch) ya cubren esto.
// Este spec es la regresión que faltaba para esa conclusión, no una
// corrección — si algo de esto se rompe en el futuro, este test lo agarra.
//
// A propósito NO toca la pantalla/animación de sorteo (fuera de alcance
// para este batch) — usa estructura de 1 carta, mismo patrón ya probado
// por online-hand-refresh.spec.js/online-sorteo-inicial.spec.js ("click en
// el primer número disponible" solo es válido de por sí con 1 carta —
// probado con 2/3 cartas para este test y el picker de pedidos se
// desestabiliza, DOM se re-renderiza a mitad de click; queda fuera de
// alcance de esta pieza investigar el picker en sí, no es lo que Piece B
// pide auditar).

function panelConfirma(page) {
  return page.getByRole("button", { name: /CONFIRMA/ });
}

async function paginaConConfirma(pages, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const p of pages) {
      if (await panelConfirma(p).isVisible().catch(() => false)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("ninguna sesión mostró el panel de pedir a tiempo");
}

async function confirmarPedidoEnQuienCorresponda(pages) {
  for (let intento = 1; intento <= 10; intento++) {
    const p = await paginaConConfirma(pages);
    // timeout acotado (a diferencia del resto de esta suite, que deja el
    // default "sin límite" de Playwright): el tick de 1s del reloj de
    // bidding (setInterval en PantallaPartidaOnline, ver piece C/D de este
    // mismo batch — reloj roto/re-render en loop) puede desmontar y volver
    // a montar este botón a mitad de un click sin timeout, colgando el
    // test entero en vez de dejar que este for reintente.
    const ok = await p.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    const confirmBtn = panelConfirma(p);
    if (!(await confirmBtn.isEnabled({ timeout: 3000 }).catch(() => false))) continue;
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
  }
  throw new Error("el pedido no se confirmó tras varios intentos");
}

test("online: recargar la página en distintos momentos siempre devuelve al jugador a su propio asiento/fase, nunca a un join nuevo ni a un error", async ({ browser }) => {
  test.setTimeout(150_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    // Arma la sala manualmente hasta el paso de team-selection (en vez de
    // crearYUnirseSalaOnline completo) para poder recargar pages[1] ANTES
    // de que elija equipo — el caso más temprano de reconexión posible,
    // con la fila de `players` ya reservada (join_room corrió) pero
    // seat/team todavía null.
    const host = pages[0];
    await host.goto("/");
    await host.getByRole("button", { name: /Crear sala/ }).click();
    await host.getByPlaceholder("Ej: Tincho").fill(nombres[0]);
    await host.getByRole("button", { name: "4", exact: true }).click();
    await host.locator("select").first().selectOption("custom");
    await host.getByPlaceholder(/máx/).fill("1,1");
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
    await host.getByRole("button", { name: "Crear sala", exact: true }).click();
    await expect(host.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
    await host.getByRole("button", { name: "LOCAL" }).click();
    await expect(host.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });
    const code = (await host.getByText("CÓDIGO PARA COMPARTIR").locator("xpath=following-sibling::div[1]").textContent()).trim();

    const p1 = pages[1];
    await p1.goto("/");
    await p1.getByRole("button", { name: /Unirse a sala/ }).click();
    await p1.getByPlaceholder("ABCDE").fill(code);
    await p1.getByPlaceholder("Ej: Tincho").fill(nombres[1]);
    await p1.getByRole("button", { name: "Unirse", exact: true }).click();
    await expect(p1.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });

    // Reload ANTES de elegir equipo: tiene que seguir viendo la pantalla
    // de selección (con los cupos ya reflejando al host en LOCAL), no un
    // error ni un join duplicado.
    await p1.reload();
    await expect(p1.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
    await expect(p1.getByText("1/2", { exact: false })).toBeVisible({ timeout: 10000 }); // LOCAL ya tiene 1 (host)
    await p1.getByRole("button", { name: "VISITANTE" }).click();
    await expect(p1.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });

    for (let i = 2; i < 4; i++) {
      const p = pages[i];
      await p.goto("/");
      await p.getByRole("button", { name: /Unirse a sala/ }).click();
      await p.getByPlaceholder("ABCDE").fill(code);
      await p.getByPlaceholder("Ej: Tincho").fill(nombres[i]);
      await p.getByRole("button", { name: "Unirse", exact: true }).click();
      await expect(p.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
      await p.getByRole("button", { name: i % 2 === 0 ? "LOCAL" : "VISITANTE" }).click();
      await expect(p.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });
    }

    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Reload del host A MITAD DE BIDDING, antes de que nadie haya pedido —
    // tiene que volver derecho a la mesa en fase bidding, mostrando su
    // propio rol (mano/pie/capitán), no la sala ni la selección de equipo.
    await host.reload();
    await expect(host.getByText(/Mano 1/)).toBeVisible({ timeout: 20000 });
    await expect(host.getByText("ELEGÍ TU EQUIPO")).toHaveCount(0);
    await expect(host.getByText("CÓDIGO PARA COMPARTIR")).toHaveCount(0);

    // Con estructura de 1 carta, el pie no tiene ningún pedido válido
    // propio (opcionesValidas colapsa a un solo valor) — desde piece D
    // (batch overnight post-5r, ver 20260706190000_pie_forced_bid_auto_
    // resolve.sql) submit_bid resuelve los dos pedidos en la misma llamada
    // de mano y salta directo a 'playing', así que ya no hay un segundo
    // panel de "pie" que confirmar acá.
    await confirmarPedidoEnQuienCorresponda(pages); // mano (y pie, auto-resuelto)

    // Ya en 'playing': ubica a quien tiene el turno. OJO acá: played_cards/
    // turn_seat son públicos, así que "▶ SU TURNO" aparece en la mesa de
    // LAS 4 sesiones por igual, no solo en la de quien tiene el turno —
    // grupoTurnoActivo(p) da true para cualquier `p` una vez hay un turno
    // activo en la sala. La sesión que de verdad "tiene" el turno es
    // aquella cuyo PROPIO asiento (marcado "VOS") es también el que
    // muestra "▶ SU TURNO" — sin este chequeo combinado, el test intenta
    // jugar una carta ajena, que la propia UI bloquea client-side sin
    // avisar (MesaCircular.puedeElegir exige esTurno && idx===mySeat).
    let turnoPagina = null;
    for (let intento = 0; intento < 30 && !turnoPagina; intento++) {
      for (const p of pages) {
        const miAsiento = p.locator("svg g", { hasText: "VOS" }).first();
        if ((await miAsiento.count()) > 0 && (await miAsiento.getByText("▶ SU TURNO").count()) > 0) {
          turnoPagina = p;
          break;
        }
      }
      if (!turnoPagina) await new Promise((r) => setTimeout(r, 500));
    }
    expect(turnoPagina, "ninguna sesión mostró tener su propio turno activo a tiempo").toBeTruthy();

    // Con 1 carta por mano, el asiento propio en juego es 1 elemento <g>
    // directo (la única carta; el toggle "▼ ver" no se renderiza para
    // mano.length===1). Rediseño de mesa ovalada: ya no hay un <g filter>
    // de borde por asiento — antes del rediseño esto daba 2 (borde+carta),
    // ver el comentario largo en online-reparto-animado.spec.js.
    const miPropioAsiento = turnoPagina.locator("svg g", { hasText: "VOS" }).first();
    await expect(miPropioAsiento.locator(":scope > g")).toHaveCount(1, { timeout: 10000 });

    await turnoPagina.reload();
    await expect(turnoPagina.getByText(/Mano 1/)).toBeVisible({ timeout: 20000 });
    await expect(turnoPagina.locator("svg g", { hasText: "VOS" }).first().locator(":scope > g")).toHaveCount(1, { timeout: 10000 });

    // Ahora sí juega la carta (jugarCartaDelTurnoActual — mismo helper
    // probado que ya usa online-hand-refresh.spec.js) y recarga ESA MISMA
    // sesión: la mano restante tiene que reflejar la carta ya jugada
    // (server-side, via hands), quedando vacía — no la carta original de
    // vuelta ni un error. Después de jugar, el turno ya pasó a otro
    // asiento, así que ubicar "mi propio asiento" para esta segunda
    // recarga usa el marcador "VOS" (siempre presente para el dueño de la
    // sesión, sin importar de quién sea el turno) en vez de "▶ SU TURNO".
    // jugarCartaDelTurnoActual devuelve true apenas DESPACHA el click, no
    // cuando el server confirma la jugada — bajo el mismo re-render
    // inestable que afecta al picker de pedidos (ver arriba), un dispatch
    // puede aterrizar en un elemento a punto de desmontarse y no surtir
    // efecto. Mismo patrón robusto que ya usa jugarBaseDeUnaCarta en
    // online-hand-refresh.spec.js: reintentar el click hasta ver la
    // condición de éxito real (acá, la mano propia vacía), no confiar en
    // el valor de retorno de un solo intento.
    const miAsientoAntesDeRecargar = turnoPagina.locator("svg g", { hasText: "VOS" }).first();
    let manoVacia = false;
    for (let intento = 0; intento < 40 && !manoVacia; intento++) {
      await jugarCartaDelTurnoActual(turnoPagina).catch(() => {});
      manoVacia = (await miAsientoAntesDeRecargar.locator(":scope > g").count().catch(() => -1)) === 0;
      if (!manoVacia) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoVacia, "la mano propia no quedó vacía tras jugar la única carta").toBe(true);

    await turnoPagina.reload();
    await expect(turnoPagina.getByText(/Mano 1/)).toBeVisible({ timeout: 20000 });
    await expect(turnoPagina.getByText(/No se pudo cargar tu mano/)).toHaveCount(0);

    // La aserción central de esta pieza: DESPUÉS de recargar, la mano
    // propia sigue vacía (refleja lo que el server tiene en `hands`), no
    // vuelve a mostrar la carta ya jugada.
    const miAsiento = turnoPagina.locator("svg g", { hasText: "VOS" }).first();
    await expect(miAsiento.locator(":scope > g")).toHaveCount(0, { timeout: 10000 });

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
