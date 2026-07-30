import { test, expect } from "@playwright/test";
import { jugarCartaDelTurnoActual, crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Regresión para el bug de producción: a partir de la mano 2, la pantalla de
// "pedir bases" (bidding) online aparecía con la mano vacía en vez de
// esperar a que se reparta. Causa raíz: el useEffect que trae la propia mano
// en PantallaPartidaOnline.jsx dependía solo de gameState.hand_number —
// close_hand ya adelanta hand_number a N+1 en el mismo update que pone
// phase='dealing' (antes de que existan cartas para esa mano), así que el
// effect corría de una, fetchMyHand no encontraba fila en `hands` todavía, y
// el .then cacheaba misCartas en [] (no null). Cuando deal_hand reparte y
// pasa a phase='bidding', hand_number no vuelve a cambiar, así que el effect
// no vuelve a correr y la mano queda pegada en vacío.
//
// Este test juega la partida completa a través de la UI real, con 4
// sesiones anónimas separadas (una por jugador) contra el proyecto de
// Supabase real (ver .env / VITE_SUPABASE_URL), para probar el fix al mismo
// nivel que lo vería un usuario: dos manos de una sola carta cada una, y
// después de cerrar la primera y repartir la segunda, las 4 sesiones tienen
// que ver su propia mano (1 carta), no una fila vacía.

const NOMBRES = ["P0", "P1", "P2", "P3"];

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

// Con estructura=[1,1] (1 carta por mano) solo hay una opción válida de
// verdad para el pie, así que "primer número disponible" alcanza para las
// dos subfases sin tener que calcular nada. Reintenta el click si el panel
// sigue visible después (RPC lenta/perdida contra el proyecto real no es
// motivo para que el test sea flaky).
async function confirmarPedidoEnQuienCorresponda(pages) {
  for (let intento = 1; intento <= 10; intento++) {
    const p = await paginaConConfirma(pages);
    // timeout acotado (a diferencia del resto de esta suite, que deja el
    // default "sin límite" de Playwright): el tick de 1s del reloj de
    // bidding (setInterval en PantallaPartidaOnline) puede desmontar y
    // volver a montar este botón a mitad de un click sin timeout, colgando
    // el test entero en vez de dejar que este for reintente (visto en la
    // práctica contra el proyecto real).
    const ok = await p.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    const confirmBtn = panelConfirma(p);
    // El botón CONFIRMA queda disabled hasta que el click de arriba haya
    // seteado el número elegido — si por lo que sea no prendió, un
    // confirmBtn.click() de posta se quedaría esperando a que se habilite
    // para siempre, colgando el test entero en vez de dejar que este for
    // reintente. isEnabled() con timeout acotado deja detectar ese caso y
    // reintentar clickeando el número de nuevo.
    if (!(await confirmBtn.isEnabled({ timeout: 3000 }).catch(() => false))) continue;
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
  }
  throw new Error("el pedido no se confirmó tras varios intentos");
}

// Mismo patrón de click acotado + reintento que confirmarPedidoEnQuienCorresponda
// (líneas 53/63) — piece E lo aplicó a los clicks de bidding pero no a este,
// porque cuando se escribió esa pieza el reloj (piece C+D) no corría en esta
// pantalla. Un click sin timeout puede quedar esperando para siempre si el
// elemento se desmonta/remonta a mitad del click, colgando el test entero.
async function clickearCerrarMano(pages) {
  for (let intento = 1; intento <= 10; intento++) {
    const p = await esperaBotonVisible(pages, /^Cerrar mano/);
    const ok = await p.getByRole("button", { name: /^Cerrar mano/ }).click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await p.getByRole("button", { name: /^Cerrar mano/ }).isVisible().catch(() => false))) return;
  }
  throw new Error("no se pudo cerrar la mano tras varios intentos");
}

async function esperaBotonVisible(pages, regex, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const p of pages) {
      if (await p.getByRole("button", { name: regex }).isVisible().catch(() => false)) return p;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ninguna sesión mostró un botón que matchee ${regex} a tiempo`);
}

// Juega la única base de una mano de 1 carta: en cada ronda intenta el click
// en las 4 sesiones (en las que no es el turno de esa sesión, onTirar
// aborta solo porque seatIdx!==mySeat — ver MesaCircular's `puedeElegir`),
// hasta que aparezca "Cerrar mano". Piece T: la última base de la mano
// también pasa por 'resolving' ahora (antes saltaba derecho a 'closing'),
// así que hace falta clickear "Siguiente base" una vez que aparece, antes
// de que "Cerrar mano" llegue a mostrarse.
async function jugarBaseDeUnaCarta(pages) {
  let sigBaseClickeado = false;
  for (let i = 0; i < 40; i++) {
    for (const p of pages) {
      await jugarCartaDelTurnoActual(p).catch(() => {});
    }
    if (!sigBaseClickeado) {
      for (const p of pages) {
        const btn = p.getByRole("button", { name: "Siguiente base" });
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 5000 }).catch(() => {});
          sigBaseClickeado = true;
          break;
        }
      }
    }
    for (const p of pages) {
      if (await p.getByRole("button", { name: /^Cerrar mano/ }).isVisible().catch(() => false)) return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < pages.length; i++) {
    console.log(`estado de la sesión ${i} al fallar:`, (await pages[i].locator("body").innerText()).replace(/\n+/g, " | "));
  }
  throw new Error("la base no cerró la mano a tiempo");
}

test("online: la mano 2 en bidding muestra la mano repartida, no vacía", async ({ browser }) => {
  test.setTimeout(180_000);

  const contexts = await Promise.all(NOMBRES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    // Host crea la sala: 4 jugadores, manos de 1 carta (2 manos), sin ases
    // ni reloj — el mínimo necesario para llegar rápido a "cerrar mano" y
    // ver la mano 2.
    await crearYUnirseSalaOnline(pages, NOMBRES, { nJug: 4, estructuraCustom: "1,1", sinAses: true });

    // Empezar la partida (piece 5h: "listo" por jugador, no un botón
    // único) — deal_hand crea game_state directo en 'bidding' para la
    // mano 0 (no hay fase 'dealing' separada para la primera mano) apenas
    // las 4 sesiones quedan listas, sin que nadie tenga que clickear un
    // "arrancar" aparte.
    for (const p of pages) {
      await alternarListoEnPantalla(p);
    }
    await pasarSorteoAnimado(pages);

    for (const p of pages) {
      await expect(p.getByText("CONFIRMA")).toBeVisible({ timeout: 30000 }).catch(() => {});
    }

    // MANO 1 (hand_number=0): pedir, jugar la única base, cerrar, repartir.
    // Con estructura de 1 carta, el pie no tiene ningún pedido válido
    // propio (opcionesValidas colapsa a un solo valor) — desde piece D
    // (batch overnight post-5r, ver 20260706190000_pie_forced_bid_auto_
    // resolve.sql) submit_bid resuelve los dos pedidos en la misma llamada
    // de mano y salta directo a 'playing', así que ya no hay un segundo
    // panel de "pie" que confirmar acá (antes de esa pieza, esta línea se
    // llamaba dos veces).
    await confirmarPedidoEnQuienCorresponda(pages); // mano (y pie, auto-resuelto)
    await jugarBaseDeUnaCarta(pages);

    await clickearCerrarMano(pages);

    // Esto dispara close_hand: hand_number pasa a 1 con phase='dealing' —
    // el punto exacto donde el bug pre-fix ya deja misCartas cacheado en [].
    // Piece U: el botón ahora es "DAR" (ícono de mazo), no texto "Repartir
    // mano".
    const reparto = await esperaBotonVisible(pages, "DAR");
    await reparto.getByRole("button", { name: "DAR" }).click();

    // deal_hand reparte la mano 1 y pasa a phase='bidding' sin volver a
    // cambiar hand_number — el escenario exacto que el fix cubre.
    for (const p of pages) {
      await expect(p.getByText(/Mano 2/)).toBeVisible({ timeout: 30000 });
    }

    // La aserción central: cada sesión tiene que ver su propia carta (1,
    // según estructura[1]=1), no una mano vacía ni quedarse en "Cargando".
    // Piece P (batch overnight post-5r) sacó la tira redundante de cartas
    // que vivía arriba de la pantalla (MiMano ya no dibuja las cartas,
    // solo error/"Cargando…" — duplicaba el propio asiento en la mesa), así
    // que la única fuente de la mano real ahora es el asiento "VOS" dentro
    // de MesaCircular: 2 elementos <g> directos para una mano de 1 carta
    // (borde + la única carta; el toggle "▼ ver" no se renderiza para
    // mano.length===1 — mismo conteo que ya usa online-reconexion-sala.spec.js).
    for (let i = 0; i < 4; i++) {
      const miAsiento = pages[i].locator("svg g", { hasText: "VOS" }).first();
      await expect(miAsiento.locator(":scope > g"), `sesión ${NOMBRES[i]}: mano de la carta 2 debería tener 1 carta`).toHaveCount(2, { timeout: 10000 });
      await expect(pages[i].getByText("Cargando tu mano")).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
