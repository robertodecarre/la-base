import { test, expect } from "@playwright/test";
import fs from "fs";
import { crearYUnirseSalaOnline, alternarListoEnPantalla } from "./helpers.js";

// Cubre el sorteo inicial online (piece 5l): antes, deal_hand elegía quién
// reparte primero con un floor(random()) silencioso — acá se verifica que
// ahora hay un paso intermedio real: sortear_reparto_inicial saca una
// carta al azar por asiento y escribe el resultado en
// rooms.sorteo_inicial, las 4 sesiones lo ven vía Realtime (la misma
// suscripción a `rooms` que ya usa useSala.js) mostrando la MISMA pantalla
// de sorteo con el MISMO ganador, y recién unos segundos después arranca
// la mano 0 con ese asiento repartiendo (dealer_seat) — verificado en la
// mesa real una vez pasada la fase de bidding, que es donde MesaCircular
// (y su label "PIE") se renderiza.
//
// La comparación de "mismas cartas" se hace con el innerHTML completo del
// <svg> del sorteo entre las 4 sesiones en vez de decodificar cada carta a
// mano: SorteoOnline es una función pura de (nJug, players, sorteo) sin
// ningún dato relativo al viewer (a diferencia de la mesa de juego, acá no
// hay "(vos)" ni manos ocultas), así que si las 4 sesiones reciben el
// mismo sorteo por Realtime, el markup tiene que ser byte-idéntico.

function leerEnv() {
  const texto = fs.readFileSync(".env", "utf8");
  const vars = {};
  for (const linea of texto.split("\n")) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

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

// Mismo patrón que online-hand-refresh.spec.js: con estructura=[1,1] solo
// hay una opción válida real para el pie, así que "primer número
// disponible" alcanza para las dos subfases (mano y pie) sin calcular nada.
async function confirmarPedidoEnQuienCorresponda(pages) {
  for (let intento = 1; intento <= 10; intento++) {
    const p = await paginaConConfirma(pages);
    // timeout acotado: el tick de 1s del reloj de bidding puede desmontar
    // y volver a montar este botón a mitad de un click sin timeout,
    // colgando el test entero en vez de dejar que este for reintente
    // (visto en la práctica contra el proyecto real).
    const ok = await p.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    const confirmBtn = panelConfirma(p);
    if (!(await confirmBtn.isEnabled({ timeout: 3000 }).catch(() => false))) continue;
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
  }
  throw new Error("el pedido no se confirmó tras varios intentos");
}

test("online: sorteo inicial real, mismo resultado en las 4 sesiones y dealer correcto", async ({ browser }) => {
  test.setTimeout(150_000);

  const contexts = await Promise.all(NOMBRES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    // Manos de 1 carta, sin ases: llega rápido a la fase 'playing' (donde
    // se ve el label "PIE"), no hace falta más para verificar el dealer.
    const code = await crearYUnirseSalaOnline(pages, NOMBRES, { nJug: 4, estructuraCustom: "1,1", sinAses: true });

    // Las 4 se marcan listas -> dispara sortearRepartoInicial (no
    // repartirMano directo).
    for (const p of pages) {
      await alternarListoEnPantalla(p);
    }

    // Las 4 sesiones pasan a la pantalla de sorteo (reemplaza el lobby de
    // "listo" — ver PantallaOnlineSala.jsx).
    for (const p of pages) {
      await expect(p.getByText("SORTEO", { exact: true })).toBeVisible({ timeout: 15000 });
    }

    // Mismo sorteo, byte a byte, en las 4 sesiones.
    const svgHtml = await Promise.all(pages.map((p) => p.locator("svg").first().innerHTML()));
    expect(new Set(svgHtml).size, "el markup del sorteo no coincide entre sesiones").toBe(1);

    // El nombre del ganador (único texto con fill #f0d080 en esta pantalla)
    // tiene que ser uno de los 4 jugadores.
    const ganadorNombre = await pages[0].locator('svg text[fill="#f0d080"]').textContent();
    expect(NOMBRES).toContain(ganadorNombre);

    // Chequeo directo contra la base: sorteo_inicial.ganador_seat resuelve
    // al mismo nombre (el orden de join = seat, ver crearYUnirseSalaOnline
    // en helpers.js), confirmando que lo que muestran las 4 sesiones es
    // realmente lo que el server guardó, no una casualidad de render.
    const env = leerEnv();
    const resp = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/rooms?code=eq.${code}&select=sorteo_inicial`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } }
    );
    const filas = await resp.json();
    expect(filas).toHaveLength(1);
    const { sorteo_inicial } = filas[0];
    expect(sorteo_inicial).toBeTruthy();
    expect(sorteo_inicial.cartas).toHaveLength(4);
    expect(NOMBRES[sorteo_inicial.ganador_seat]).toBe(ganadorNombre);

    // Pasados los ~3s del timer de cada sesión, deal_hand reparte la mano 0
    // usando ese asiento como dealer_seat — llega a bidding directo (no
    // hay fase 'dealing' para la mano 0).
    for (const p of pages) {
      await expect(p.getByText("CONFIRMA")).toBeVisible({ timeout: 15000 }).catch(() => {});
    }
    // Con estructura de 1 carta, el pie no tiene ningún pedido válido
    // propio (opcionesValidas colapsa a un solo valor) — desde piece D
    // (batch overnight post-5r, ver 20260706190000_pie_forced_bid_auto_
    // resolve.sql) submit_bid resuelve los dos pedidos en la misma llamada
    // de mano y salta directo a 'playing', así que ya no hay un segundo
    // panel de "pie" que confirmar acá (antes de esa pieza, esta línea se
    // llamaba dos veces).
    await confirmarPedidoEnQuienCorresponda(pages); // mano (y pie, auto-resuelto)

    // Ya en fase 'playing': la mesa (MesaCircular) muestra "PIE" en el
    // asiento que ganó el sorteo. `text` en el nodetest XPath no matchea
    // <text> de SVG (namespace distinto del HTML de la página) — hace
    // falta local-name() para que la búsqueda de hermano funcione ahí.
    for (const p of pages) {
      const nombreTxt = p.locator("svg text", { hasText: ganadorNombre }).first();
      const estadoTxt = nombreTxt.locator("xpath=following-sibling::*[local-name()='text'][1]");
      await expect(estadoTxt).toContainText("PIE", { timeout: 15000 });
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
