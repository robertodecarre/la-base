import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece F (batch overnight post-5r) — el Tablero (historial de manos) deja
// de estar siempre visible; ahora vive detrás de un ícono de "libreta"
// entre los dos capitanes (siempre asientos 0 y 1 — choose_team garantiza
// que el capitán de cada equipo es el primero en elegirlo, ver
// LibretaIcon en MesaCircular.jsx), que togglea un overlay con el Tablero
// en layout vertical (una fila por mano, no una columna). También remueve
// el panel "pidió X · hizo Y" que vivía debajo del Tablero en la pantalla
// de cierre de mano — duplicaba, en texto, los mismos números que
// ResumenMarcador ya muestra arriba con estrellas.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch).

test("online: el historial de manos vive detrás del ícono de libreta, no siempre visible", async ({ browser }) => {
  test.setTimeout(150_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const host = pages[0];

    // El ícono de libreta está presente y el overlay arranca cerrado.
    const libretaBtn = host.getByRole("button", { name: "Ver libreta" });
    await expect(libretaBtn).toBeVisible();
    await expect(host.getByText("LIBRETA")).toHaveCount(0);

    // Piece O (batch overnight post-5r): esta sala se creó sin reloj (ver
    // crearYUnirseSalaOnline — no togglea "Jugar con reloj"), así que el
    // ícono de reloj al lado de la libreta ni se monta (MesaCircular solo
    // lo agrega si hayReloj) — no tiene sentido un botón que abre un panel
    // vacío.
    await expect(host.getByRole("button", { name: "Ver reloj" })).toHaveCount(0);

    // Click abre el overlay con el Tablero (layout vertical: encabezado
    // MANO/CARTAS/LOCAL/VISITANTE, una fila por mano).
    await libretaBtn.click();
    await expect(host.getByText("LIBRETA")).toBeVisible();
    await expect(host.getByRole("columnheader", { name: "MANO" })).toBeVisible();
    await expect(host.getByRole("columnheader", { name: "CARTAS" })).toBeVisible();
    await expect(host.getByRole("row").filter({ hasText: "1" }).first()).toBeVisible();

    // Cerrar (botón ✕) vuelve a esconderlo, y el ícono cambia de estado
    // (aria-label refleja "abrir" de nuevo).
    await host.getByRole("button", { name: "✕" }).click();
    await expect(host.getByText("LIBRETA")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Ver libreta" })).toBeVisible();

    // Bidea (mano 1 carta, pie se auto-resuelve — piece D) y juega la
    // única base para llegar a 'closing'.
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
    for (let intento = 0; intento < 10 && !confirmado; intento++) {
      const ok = await manoPage.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (ok) {
        const btn = panelConfirma(manoPage);
        if (await btn.isEnabled({ timeout: 3000 }).catch(() => false)) await btn.click({ timeout: 5000 }).catch(() => {});
      }
      confirmado = !(await panelConfirma(manoPage).isVisible().catch(() => false));
      if (!confirmado) await new Promise((r) => setTimeout(r, 500));
    }
    expect(confirmado).toBe(true);

    let enClosing = false;
    for (let i = 0; i < 40 && !enClosing; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      for (const p of pages) {
        if (await p.getByText(/terminada/).isVisible().catch(() => false)) { enClosing = true; break; }
      }
      if (!enClosing) await new Promise((r) => setTimeout(r, 250));
    }
    expect(enClosing, "la mano no llegó a 'closing' a tiempo").toBe(true);

    // El panel redundante "pidió X · hizo Y" ya no está — el resumen de
    // arriba (ResumenMarcador, con estrellas) es la única fuente de esa
    // info en esta pantalla.
    for (const p of pages) {
      await expect(p.getByText(/pidió \d+ · hizo \d+/)).toHaveCount(0);
    }
    // La libreta sigue disponible en la pantalla de cierre también.
    await expect(host.getByRole("button", { name: "Ver libreta" })).toBeVisible();

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Piece N (batch overnight post-5r): la libreta ahora muestra las
// estrellas pedido/hecho de la mano EN CURSO apenas hay pedidos, sin
// esperar a que cierre (antes solo mostraba manos ya cerradas, en
// hand_results). Estructura de 2 cartas (no 1,1 como el test de arriba) a
// propósito: con 1 carta el pedido forzado del pie (piece D) suele
// terminar en 0★ para ambos equipos, y EstrellasPedido no renderiza nada
// para pedidas===0 — no serviría para probar que las estrellas aparecen.
test("online: la libreta muestra las estrellas de la mano en curso antes de que cierre", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "2,2", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const host = pages[0];

    // Antes de pedir: la libreta no tiene ninguna fila con estrellas
    // todavía (gameState.bids sigue null para ambos equipos).
    await host.getByRole("button", { name: "Ver libreta" }).click();
    await expect(host.getByText("LIBRETA")).toBeVisible();
    // Acotado a la tabla del Tablero: "★CAP" (capitanes) y los "★" de
    // PanelPedir también matchean getByText("★") en el resto de la
    // pantalla, sin relación con esta feature.
    await expect(host.getByRole("table").getByText("★")).toHaveCount(0);
    await host.getByRole("button", { name: "✕" }).click();

    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    // "1" con totalBases=2 deja 2 opciones reales para el pie ({0,2}), pero
    // lo que importa acá es que el pedido de MANO sea != 0 para garantizar
    // al menos una estrella visible — no importa cuál de los dos equipos
    // es mano esta mano.
    async function confirmarUno(valorPreferido) {
      for (let intento = 1; intento <= 24; intento++) {
        let p = null;
        for (let i = 0; i < 30 && !p; i++) {
          for (const pg of pages) if (await panelConfirma(pg).isVisible().catch(() => false)) { p = pg; break; }
          if (!p) await new Promise((r) => setTimeout(r, 200));
        }
        expect(p, "ninguna sesión mostró el panel de pedir a tiempo").toBeTruthy();
        const boton = valorPreferido != null && await p.getByRole("button", { name: valorPreferido, exact: true }).isVisible().catch(() => false)
          ? p.getByRole("button", { name: valorPreferido, exact: true })
          : p.getByRole("button", { name: /^\d+$/ }).first();
        const ok = await boton.click({ timeout: 5000 }).then(() => true).catch(() => false);
        if (!ok) continue;
        const btn = panelConfirma(p);
        if (await btn.isEnabled({ timeout: 3000 }).catch(() => false)) await btn.click({ timeout: 5000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
        if (!(await panelConfirma(p).isVisible().catch(() => false))) return;
      }
      throw new Error("el pedido no se confirmó tras varios intentos");
    }
    await confirmarUno("1"); // mano
    await confirmarUno(); // pie

    // Ahora en 'playing', mid-hand, todavía lejos de 'closing' — la
    // aserción central: la libreta ya muestra estrellas para la mano 1 sin
    // que haya cerrado.
    await host.getByRole("button", { name: "Ver libreta" }).click();
    await expect(host.getByText("LIBRETA")).toBeVisible();
    await expect(host.getByRole("table").getByText("★").first()).toBeVisible();

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
