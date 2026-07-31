import { test, expect } from "@playwright/test";
import fs from "fs";
import { crearYUnirseSalaOnline, alternarListoEnPantalla } from "./helpers.js";

// Cubre el sorteo inicial online (piece 5l): antes, deal_hand elegía quién
// reparte primero con un floor(random()) silencioso — acá se verifica que
// ahora hay un paso intermedio real: sortear_reparto_inicial saca una
// carta al azar por asiento y escribe el resultado en
// rooms.sorteo_inicial, las 4 sesiones lo ven vía Realtime (la misma
// suscripción a `rooms` que ya usa useSala.js) mostrando la MISMA pantalla
// de sorteo con el MISMO ganador, y recién después de que las 4 dan
// vuelta su propia carta arranca la mano 0 con ese asiento repartiendo
// (dealer_seat) — verificado en la mesa real una vez pasada la fase de
// bidding, que es donde MesaCircular (y su label "PIE") se renderiza.
//
// Piece H (batch overnight post-5r) reemplazó el revelado instantáneo por
// viaje+giro+click-para-dar-vuelta (ver SorteoAnimado.jsx) — el markup ya
// NO es viewer-agnóstico (cada sesión ve su propia carta como clickeable,
// "mia"/"ajena"), así que la comparación de "mismo resultado" que antes
// hacía esta prueba (innerHTML byte-idéntico entre las 4 sesiones) ya no
// aplica. En su lugar: cada sesión da vuelta su propia carta de verdad
// (ejercitando el click real + marcar_flip_sorteo + Realtime), y se
// compara el NOMBRE DEL GANADOR que muestra la leyenda "DA" en las 4
// sesiones entre sí y contra rooms.sorteo_inicial.ganador_seat leído
// directo de la base — mismo nivel de garantía que antes, ahora pasando
// por la interacción real en vez de solo el markup.
//
// Piece R (batch overnight post-5r): agrega el paso de confirmación
// compartida "ARRANCAMOS" — las cartas ya no se limpian solas después del
// flip, cada sesión tiene que apretar el botón (ejercitando el click real +
// marcar_arrancamos_sorteo + Realtime) antes de que deal_hand corra.

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

    // Cada sesión da vuelta SU PROPIA carta — el botón (role=button,
    // aria-label "Dar vuelta tu carta") solo existe una vez que la carta
    // de esa sesión llegó a su asiento (viaje 0.62s + stagger por
    // asiento), Playwright espera solo hasta que aparece.
    for (let i = 0; i < pages.length; i++) {
      await pages[i].getByRole("button", { name: "Dar vuelta tu carta" }).click({ timeout: 10000 });
    }

    // Esperar a que las 4 sesiones vean, cada una por su cuenta, que TODOS
    // ya dieron vuelta — el botón ARRANCAMOS aparece recién ahí (ver
    // SorteoAnimado.jsx). Necesario antes de leer la base directo: el
    // click de arriba solo garantiza que ESTA sesión marcó su propio flip
    // local; que las OTRAS 3 sesiones ya vean el flip de, por ejemplo, la
    // última página clickeada depende de que marcar_flip_sorteo haya
    // terminado de escribir Y de que Realtime ya lo haya propagado — sin
    // esperar esto, el click de ARRANCAMOS de más abajo podría correr
    // antes de que esa sesión vea todosFlipeados=true (visto en la
    // práctica: pasaba justo con el último asiento clickeado).
    for (const p of pages) {
      await expect(p.getByRole("button", { name: "ARRANCAMOS" })).toBeVisible({ timeout: 15000 });
    }

    // Leyenda "DA -nombre-": mismo ganador en las 4 sesiones. El texto
    // existe en el DOM desde el montaje (solo la opacidad lo revela), así
    // que leerlo no depende de esperar la transición — lo que importa acá
    // es que el CONTENIDO coincida entre sesiones.
    const nombresGanador = await Promise.all(pages.map(async (p) => {
      const etiquetaDA = p.locator("svg text", { hasText: "DA" }).first();
      const nombreTxt = etiquetaDA.locator("xpath=following-sibling::*[local-name()='text'][1]");
      return nombreTxt.textContent();
    }));
    expect(new Set(nombresGanador).size, "las 4 sesiones no coinciden en el ganador").toBe(1);
    const ganadorNombre = nombresGanador[0];
    expect(NOMBRES).toContain(ganadorNombre);

    // Piece R: las cartas se quedan asentadas — deal_hand todavía NO corrió
    // (sin sondear la base activamente para no crear una carrera con el
    // paso de abajo, se confirma indirectamente: el panel "CONFIRMA" de
    // bidding todavía no puede estar visible en ninguna sesión porque
    // ninguna confirmó ARRANCAMOS todavía).
    for (const p of pages) {
      await expect(p.getByText("CONFIRMA")).toHaveCount(0);
    }

    // Cada sesión confirma "ARRANCAMOS" — recién cuando las 4 lo hicieron,
    // marcar_arrancamos_sorteo completa rooms.sorteo_inicial.arrancamos y
    // PantallaOnlineSala.jsx dispara repartirMano().
    for (const p of pages) {
      await p.getByRole("button", { name: "ARRANCAMOS" }).click({ timeout: 10000 });
    }

    // Chequeo directo contra la base: sorteo_inicial.ganador_seat resuelve
    // al mismo nombre (el orden de join = seat, ver crearYUnirseSalaOnline
    // en helpers.js), confirmando que lo que muestran las 4 sesiones es
    // realmente lo que el server guardó, no una casualidad de render.
    // También confirma que flipped Y arrancamos quedaron completos para
    // los 4 asientos.
    const env = leerEnv();
    let sorteo_inicial;
    await expect(async () => {
      const resp = await fetch(
        `${env.VITE_SUPABASE_URL}/rest/v1/rooms?code=eq.${code}&select=sorteo_inicial`,
        { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } }
      );
      const filas = await resp.json();
      expect(filas).toHaveLength(1);
      sorteo_inicial = filas[0].sorteo_inicial;
      expect(sorteo_inicial.arrancamos, "las 4 sesiones ya deberían haber confirmado ARRANCAMOS").toEqual({ "0": true, "1": true, "2": true, "3": true });
    }).toPass({ timeout: 15000 });
    expect(sorteo_inicial).toBeTruthy();
    expect(sorteo_inicial.cartas).toHaveLength(4);
    expect(sorteo_inicial.flipped, "las 4 sesiones ya deberían haber marcado su flip").toEqual({ "0": true, "1": true, "2": true, "3": true });
    expect(NOMBRES[sorteo_inicial.ganador_seat]).toBe(ganadorNombre);

    // Piece CC: el ganador tiene que tener jerarquía ESTRICTAMENTE más
    // alta que cualquier otro asiento — antes, un empate en la jerarquía
    // más alta se resolvía a favor del asiento más bajo (sortear_reparto_
    // inicial ya no puede devolver ese caso: redibuja la mesa entera hasta
    // que el resultado escrito en rooms.sorteo_inicial ya no tenga empate,
    // ver 20260706270000_sorteo_redraw_on_tie.sql). Un solo trial real no
    // prueba el redraw en sí (la aleatoriedad puede no empatar esta vez),
    // pero si el tiebreak viejo volviera, esta aserción eventualmente
    // fallaría apenas el sorteo real empate — cobertura de regresión
    // permanente sobre el mismo dato que ya lee este spec, en vez de un
    // spec nuevo separado (ver también scripts/verify-sorteo-redraw-
    // tie.mjs, que sí fuerza el escenario con muchos trials contra el
    // proyecto real).
    const jerarquiaDe = (carta) => (carta.valor === 1 && carta.palo.n === "Bastos" ? 100 : carta.valor);
    const jerGanador = jerarquiaDe(sorteo_inicial.cartas[sorteo_inicial.ganador_seat].carta);
    for (const { seat, carta } of sorteo_inicial.cartas) {
      if (seat === sorteo_inicial.ganador_seat) continue;
      expect(jerarquiaDe(carta), `asiento ${seat} no debería empatar/superar al ganador`).toBeLessThan(jerGanador);
    }

    // Una vez las 4 confirmaron ARRANCAMOS, deal_hand reparte la mano 0
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
