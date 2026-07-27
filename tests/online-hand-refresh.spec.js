import { test, expect } from "@playwright/test";
import { jugarCartaDelTurnoActual } from "./helpers.js";

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
  for (let intento = 1; intento <= 3; intento++) {
    const p = await paginaConConfirma(pages);
    await p.getByRole("button", { name: /^\d+$/ }).first().click();
    await panelConfirma(p).click();
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
  }
  throw new Error("el pedido no se confirmó tras 3 intentos");
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
// hasta que aparezca "Cerrar mano".
async function jugarBaseDeUnaCarta(pages) {
  for (let i = 0; i < 40; i++) {
    for (const p of pages) {
      await jugarCartaDelTurnoActual(p).catch(() => {});
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
    const host = pages[0];
    await host.goto("/");
    await host.getByRole("button", { name: /Jugar online/ }).click();
    await host.getByRole("button", { name: /Crear sala/ }).click();
    await host.getByPlaceholder("Ej: Tincho").fill(NOMBRES[0]);
    await host.getByRole("button", { name: "4", exact: true }).click();
    await host.locator("select").first().selectOption("custom");
    const customInput = host.getByPlaceholder(/máx/);
    await customInput.fill("1,1");
    // Apagar los 3 superpoderes de ases para no tener que lidiar con menús
    // de copas/oros en el medio.
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
    await host.getByRole("button", { name: "Crear sala", exact: true }).click();

    const codigoLabel = host.getByText("CÓDIGO PARA COMPARTIR");
    const codigoDiv = codigoLabel.locator("xpath=following-sibling::div[1]");
    await expect(codigoDiv).toBeVisible({ timeout: 20000 });
    const code = (await codigoDiv.textContent()).trim();
    expect(code).toMatch(/^[A-Z2-9]{4,6}$/);

    // Los otros 3 se unen con el código.
    for (let i = 1; i < 4; i++) {
      const p = pages[i];
      await p.goto("/");
      await p.getByRole("button", { name: /Jugar online/ }).click();
      await p.getByRole("button", { name: /Unirse a sala/ }).click();
      await p.getByPlaceholder("ABCDE").fill(code);
      await p.getByPlaceholder("Ej: Tincho").fill(NOMBRES[i]);
      await p.getByRole("button", { name: "Unirse", exact: true }).click();
      await expect(p.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 15000 });
    }

    // Empezar la partida: deal_hand crea game_state directo en 'bidding'
    // para la mano 0 (no hay fase 'dealing' separada para la primera mano).
    await expect(host.getByRole("button", { name: "Empezar partida", exact: true })).toBeVisible({ timeout: 30000 });
    await host.getByRole("button", { name: "Empezar partida", exact: true }).click();

    for (const p of pages) {
      await expect(p.getByText("CONFIRMA")).toBeVisible({ timeout: 30000 }).catch(() => {});
    }

    // MANO 1 (hand_number=0): pedir, jugar la única base, cerrar, repartir.
    await confirmarPedidoEnQuienCorresponda(pages); // mano
    await confirmarPedidoEnQuienCorresponda(pages); // pie
    await jugarBaseDeUnaCarta(pages);

    const cierre = await esperaBotonVisible(pages, /^Cerrar mano/);
    await cierre.getByRole("button", { name: /^Cerrar mano/ }).click();

    // Esto dispara close_hand: hand_number pasa a 1 con phase='dealing' —
    // el punto exacto donde el bug pre-fix ya deja misCartas cacheado en [].
    const reparto = await esperaBotonVisible(pages, /^Repartir/);
    await reparto.getByRole("button", { name: /^Repartir/ }).click();

    // deal_hand reparte la mano 1 y pasa a phase='bidding' sin volver a
    // cambiar hand_number — el escenario exacto que el fix cubre.
    for (const p of pages) {
      await expect(p.getByText(/Mano 2/)).toBeVisible({ timeout: 30000 });
    }

    // La aserción central: cada sesión tiene que ver su propia carta (1,
    // según estructura[1]=1), no una mano vacía ni quedarse en "Cargando".
    for (let i = 0; i < 4; i++) {
      const cartas = pages[i].locator('svg[width="36"][height="52"]');
      await expect(cartas, `sesión ${NOMBRES[i]}: mano de la carta 2 debería tener 1 carta`).toHaveCount(1, { timeout: 10000 });
      await expect(pages[i].getByText("Cargando tu mano")).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
