import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece Q (batch overnight post-5r) — deal_hand ya reparte TODAS las
// cartas de golpe server-side (sin fase incremental real); esto solo
// cambia CUÁNDO/CÓMO se revelan al cliente, calcado de direccion-reparto-
// mano-animado.html: viaje redondo por vez (una carta a cada asiento,
// después la segunda a cada uno, etc.), empezando por game_state.
// dealer_seat y en game_state.direction. El propio abanico crece con
// arte real; los demás asientos muestran una pila boca abajo creciendo
// (nunca su mano real — hands ni siquiera llega al cliente ajeno, ver
// useSala.js). El panel de pedir no es interactivo hasta que el PROPIO
// abanico terminó de llegar (no depende de que los demás también
// terminen el suyo).
//
// A propósito NO toca la pantalla/animación de sorteo (piece H, ya
// cubierta aparte) ni gestos de mano sincronizados (pieza J, todavía
// diferida). Usa estructura de 3 cartas (no 1,1) para que la animación
// tenga varias rondas reales que verificar — con 1 carta el reparto
// completo tarda bien menos de un segundo, insuficiente para pescar el
// estado "todavía repartiendo" con confianza.

const NOMBRES = ["P0", "P1", "P2", "P3"];

// Cuenta los <g> hijos directos del grupo de un asiento en la mesa —
// mismo patrón ya usado en online-hand-refresh.spec.js/online-
// reconexion-sala.spec.js: (toggle "▼ ver" si mano.length>1) + una carta
// por <g>. Con 3 cartas: toggle(1) + 3 cartas = 4. Rediseño de mesa
// ovalada: ya no hay un <g filter> de borde por asiento (el asiento pasó
// de casillero cuadrado con fondo/borde propio a carita+abanico
// directamente sobre el paño de la mesa) — antes del rediseño esto daba 5
// (borde+toggle+3 cartas), confirmado con Playwright real contra el
// código viejo antes de actualizar este número.
function gDirectosDeAsiento(page, nombre) {
  return page.locator("svg g", { hasText: nombre }).first().locator(":scope > g");
}

test("online: el reparto de la mano viaja carta por carta y bloquea el pedido hasta que llega la propia", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(NOMBRES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, NOMBRES, { nJug: 4, estructuraCustom: "3,3", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);

    const host = pages[0]; // seat 0
    await expect(host.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });

    // La aserción central de la pieza: el panel de pedir NO es utilizable
    // apenas arranca la mano — el propio abanico todavía está llegando.
    // "Repartiendo tu mano" solo lo ve la sesión a quien le toca pedir
    // (capitán del equipo mano) Y todavía no le llegó su reparto — cuál
    // de las 4 sesiones es esa depende del dealer_seat que salió del
    // sorteo (aleatorio), así que hay que buscarlo entre las 4, no asumir
    // que es el host. Con 4 asientos × 3 cartas (130ms de stagger por
    // carta + 90ms de pausa entre rondas, ver PantallaPartidaOnline.jsx),
    // el reparto completo tarda >1.5s incluso para el asiento repartido
    // primero — de sobra para pescar este estado intermedio apenas
    // arranca la mano.
    let vioRepartiendo = false;
    for (let intento = 0; intento < 30 && !vioRepartiendo; intento++) {
      for (const p of pages) {
        if (await p.getByText(/Repartiendo tu mano/).isVisible().catch(() => false)) { vioRepartiendo = true; break; }
      }
      if (!vioRepartiendo) await new Promise((r) => setTimeout(r, 100));
    }
    expect(vioRepartiendo, "ninguna sesión mostró 'Repartiendo tu mano' a tiempo").toBe(true);

    // Eventualmente el panel de pedir real aparece para quien le toca
    // pedir (mano) — sea o no el host, cualquiera de las 4 sesiones.
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    let manoPage = null;
    for (let intento = 0; intento < 40 && !manoPage; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 250));
    }
    expect(manoPage, "ninguna sesión mostró el panel de pedir a tiempo").toBeTruthy();

    // Las 4 sesiones terminan viendo su propio abanico completo (3
    // cartas reales) y las otras 3 con su pila boca abajo también
    // completa (3 elementos) — nunca una mano ajena a medio repartir.
    for (let i = 0; i < NOMBRES.length; i++) {
      await expect(gDirectosDeAsiento(pages[i], NOMBRES[i]), `sesión ${NOMBRES[i]}: su propio abanico`).toHaveCount(4, { timeout: 15000 });
    }
    for (const otro of NOMBRES.filter((n) => n !== "P0")) {
      await expect(gDirectosDeAsiento(host, otro), `host viendo la pila de ${otro}`).toHaveCount(4, { timeout: 15000 });
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Regresión del mismo tipo de bug que piece H arregló para el sorteo
// (commit ebb6609): una sesión que reconecta A MITAD DE UNA MANO YA
// REPARTIDA no debería repetir el viaje de las cartas — tiene que ver su
// mano completa de una.
test("online: reconectar a mitad de una mano ya repartida muestra la mano completa, sin repetir la animación", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(NOMBRES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, NOMBRES, { nJug: 4, estructuraCustom: "3,3", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);

    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }
    // Espera a que el reparto termine de verdad para todos (fin del
    // hint) antes de recargar — este test es sobre reconectar DESPUÉS de
    // repartida, no a mitad del viaje.
    for (const p of pages) {
      await expect(p.getByText(/Repartiendo tu mano/)).toHaveCount(0, { timeout: 15000 });
    }

    await pages[3].reload();
    await expect(pages[3].getByText(/Mano 1/)).toBeVisible({ timeout: 20000 });

    // Sin el hint de "repartiendo" ni un abanico a medio llegar: la mano
    // completa aparece de una.
    await expect(pages[3].getByText(/Repartiendo tu mano/)).toHaveCount(0);
    await expect(gDirectosDeAsiento(pages[3], "P3")).toHaveCount(4, { timeout: 5000 });

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
