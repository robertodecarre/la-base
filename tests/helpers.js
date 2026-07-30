import { expect } from "@playwright/test";

// Grupo <g> del jugador cuyo turno está activo ahora mismo, o null si ninguno.
function grupoTurnoActivo(page) {
  return page.locator("svg g", { hasText: "▶ SU TURNO" }).first();
}

// Juega una carta del jugador activo. Cualquier carta es legal en cualquier
// momento (no hay regla de "seguir el palo"), así que no hace falta saber
// qué cartas tiene nadie: alcanza con jugar la última carta de su mano,
// expandiendo la mano primero si el modo contraído la esconde detrás de un
// segundo click ("levantar" antes de "tirar").
export async function jugarCartaDelTurnoActual(page) {
  const grupo = grupoTurnoActivo(page);
  if ((await grupo.count()) === 0) return false;

  const verBtn = grupo.getByText("▼ ver");
  if (await verBtn.isVisible().catch(() => false)) {
    await verBtn.dispatchEvent("click");
  }
  // Los <g> de cada carta son hijos directos del grupo del jugador (el
  // fragment de CartasManoSVG no agrega wrapper al DOM), así que ":scope > g"
  // agarra la última carta y no un sub-elemento decorativo cualquiera.
  // dispatchEvent en vez de click: el handler está en el <g> por bubbling
  // de evento, así que no importa qué píxel exacto "recibe" el click, pero
  // el hit-testing de SVG solo pinta ciertas zonas (huecos en los palos
  // decorativos, cartas superpuestas por el gap ajustado), lo que hacía que
  // el actionability check de Playwright reintentara indefinidamente.
  const cartas = grupo.locator(":scope > g");
  // Con dos tablas separadas suscriptas a Realtime por separado (game_state
  // para turn_seat, played_cards para la mano jugada), una sesión online
  // puede quedar momentáneamente desincronizada: todavía cree que es el
  // turno de alguien cuya mano ya está vacía en su propio render (0 <g>
  // hijos, CartasManoSVG no dibuja nada). dispatchEvent espera a que el
  // locator resuelva y ahí se cuelga indefinidamente si nunca aparece —
  // chequear la cuenta primero deja que el caller reintente en la próxima
  // iteración en vez de bloquear el test entero.
  if ((await cartas.count()) === 0) return false;
  await cartas.last().dispatchEvent("click");
  return true;
}

// ══════════════════════════════════════════════
// ONLINE — crear/unirse a una sala real (contra Supabase), compartido
// entre los specs online.
// ══════════════════════════════════════════════

// Elige LOCAL o VISITANTE en la pantalla de selección de equipo (piece 5r)
// que ahora se muestra a CADA sesión apenas tiene un asiento reservado
// (host incluido, apenas crea+se une a su propia sala), antes del lobby.
async function elegirEquipoEnPantalla(page, equipo) {
  await expect(page.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: equipo }).click();
  // La transición de esta pantalla al lobby NO depende del eco de
  // Realtime (ver comentario largo en SeleccionEquipo, PantallaOnlineSala.jsx
  // — postgres_changes no hace backfill, así que un click que cae antes de
  // que el canal termine de suscribirse perdería el UPDATE para siempre);
  // React re-renderiza apenas la RPC de choose_team vuelve, así que 20s
  // (mismo margen que el resto de esta suite le da a un round-trip único
  // bajo carga) alcanza de sobra.
  await expect(page.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });
}

// pages[0] crea la sala y el resto se une con el código, hasta dejar las N
// páginas en el lobby (PantallaOnlineSala, sala completa). Cada sesión
// elige equipo alternando LOCAL/VISITANTE por índice (P0=LOCAL,
// P1=VISITANTE, P2=LOCAL, ...) apenas entra — reproduce la misma
// composición de equipos/asientos que el viejo auto-asignado por
// seat%2 (choose_team garantiza LOCAL=asientos pares, VISITANTE=impares;
// ver choose_team_rpc.sql), así que el resto de esta suite no necesita
// saber que la elección ahora es explícita. No marca a nadie "listo" —
// desde piece 5h el arranque depende de eso, y es un paso aparte a
// propósito para que los tests puedan inspeccionar el lobby antes de
// arrancar.
export async function crearYUnirseSalaOnline(pages, nombres, { nJug = 4, estructuraCustom = null, sinAses = false } = {}) {
  const host = pages[0];
  await host.goto("/");
  // "/" ahora aterriza directo en la pantalla fusionada "crear/unirse"
  // (piece 5m) — ya no hay un paso intermedio "Jugar online" que clickear.
  await host.getByRole("button", { name: /Crear sala/ }).click();
  await host.getByPlaceholder("Ej: Tincho").fill(nombres[0]);
  if (nJug !== 6) {
    await host.getByRole("button", { name: String(nJug), exact: true }).click();
  }
  if (estructuraCustom) {
    await host.locator("select").first().selectOption("custom");
    await host.getByPlaceholder(/máx/).fill(estructuraCustom);
  }
  if (sinAses) {
    // Apagar los 3 superpoderes de ases para no tener que lidiar con menús
    // de copas/oros en el medio.
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
  }
  await host.getByRole("button", { name: "Crear sala", exact: true }).click();

  await elegirEquipoEnPantalla(host, "LOCAL");

  const codigoDiv = host.getByText("CÓDIGO PARA COMPARTIR").locator("xpath=following-sibling::div[1]");
  const code = (await codigoDiv.textContent()).trim();

  for (let i = 1; i < pages.length; i++) {
    const p = pages[i];
    await p.goto("/");
    await p.getByRole("button", { name: /Unirse a sala/ }).click();
    await p.getByPlaceholder("ABCDE").fill(code);
    await p.getByPlaceholder("Ej: Tincho").fill(nombres[i]);
    await p.getByRole("button", { name: "Unirse", exact: true }).click();
    await elegirEquipoEnPantalla(p, i % 2 === 0 ? "LOCAL" : "VISITANTE");
  }

  return code;
}

// Toggle de "listo" en el lobby online (piece 5h) — mismo botón sirve para
// marcar y desmarcar, el texto cambia solo.
export async function alternarListoEnPantalla(page) {
  await page
    .getByRole("button", { name: /^(Estoy listo|✓ Listo)/ })
    .click();
}

// Piece H (batch overnight post-5r): la pantalla de sorteo ya no revela
// el resultado solo — cada sesión tiene que dar vuelta su propia carta
// (click real, sincronizado por Realtime vía rooms.sorteo_inicial.flipped)
// antes de que sorteoCumplido se active y la sala pase a la mesa. Piece R
// (batch overnight post-5r) sumó un segundo paso: una vez que las nJug
// dieron vuelta, las cartas quedan asentadas y cada sesión tiene que
// confirmar "ARRANCAMOS" (click real, sincronizado vía rooms.sorteo_
// inicial.arrancamos) antes de que deal_hand corra. Sin estos dos pasos,
// cualquier test que llegue hasta acá después de marcarse "listo" se
// queda colgado esperando "Mano 1"/"CONFIRMA" para siempre — llamar esto
// una vez, con las nJug páginas, apenas todas están listas.
export async function pasarSorteoAnimado(pages) {
  for (const p of pages) {
    await p.getByText("SORTEO", { exact: true }).waitFor({ timeout: 15000 });
  }
  for (let i = 0; i < pages.length; i++) {
    await pages[i].getByRole("button", { name: "Dar vuelta tu carta" }).click({ timeout: 10000 });
  }
  for (const p of pages) {
    // Cualquier sesión (no solo la última) puede ver su propio botón
    // ARRANCAMOS desmontarse/remontarse mientras las demás confirman casi
    // al mismo tiempo — cada flip/arranque ajeno llega por Realtime y
    // fuerza un re-render de esta pantalla; si Playwright cae justo en el
    // medio de uno mientras chequea que el botón esté "estable" antes de
    // despachar el click, reporta "element was detached from the DOM,
    // retrying" y agota el timeout aunque el click, de haber llegado a
    // salir, hubiera funcionado igual. Reintento acotado (mismo patrón que
    // el resto de esta suite usa para los clicks de bidding) en vez de un
    // único intento: si para cuando un intento falla la sesión ya no está
    // en SORTEO, ya confirmó — no hace falta reintentar nada.
    let confirmado = false;
    for (let intento = 1; intento <= 5 && !confirmado; intento++) {
      const ok = await p.getByRole("button", { name: "ARRANCAMOS" }).click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (ok) { confirmado = true; break; }
      const siguesEnSorteo = await p.getByText("SORTEO", { exact: true }).isVisible().catch(() => false);
      if (!siguesEnSorteo) { confirmado = true; break; }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!confirmado) throw new Error("no se pudo confirmar ARRANCAMOS tras varios intentos");
  }
}
