import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla } from "./helpers.js";

// Piece C+D (batch overnight post-5r).
//
// C: el reloj online quedaba clavado en 0:00. Causa raíz (ver
// 20260706180000_deal_hand_clock_fix.sql): deal_hand's clock start/preserve
// logic, agregada correctamente por 20260706130000_clock_expired.sql, se
// perdió en silencio dos migraciones después (20260706150000_sorteo_
// inicial_rpc.sql reemplazó deal_hand entero para sumar el dealer_seat del
// sorteo, pero partiendo de una copia del cuerpo previa al reloj) — un bug
// preexistente a este batch, no introducido acá, que además arrastraron
// sin querer las dos migraciones de piece 5r de esta misma sesión
// (choose_team_rpc.sql y deal_hand_sorteo_fix.sql) al copiar ese mismo
// cuerpo ya roto. game_state.clock llegaba `null` por Realtime pase lo que
// pase, así que restante() en PantallaPartidaOnline.jsx siempre caía al
// default 0 — no era un bug de frontend.
//
// D: cuando el pie no tiene ninguna opción real de pedido (el caso general
// de opcionesValidas colapsando a un solo valor — siempre cierto en una
// mano de 1 carta), submit_bid ahora resuelve los dos pedidos en la misma
// llamada de mano y salta directo a 'playing' (ver 20260706190000_pie_
// forced_bid_auto_resolve.sql) — el capitán del pie nunca ve un panel de
// pedir para confirmar, y el reloj nunca arranca para ese turno forzado.
//
// A propósito NO toca la pantalla/animación de sorteo ni nada de gestos de
// mano sincronizados (fuera de alcance para este batch).

test("online: el reloj corre de verdad durante el pedido de mano, y con 1 carta el pie nunca tiene que confirmar", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  const erroresConsola = [];
  for (const p of pages) {
    p.on("pageerror", (err) => erroresConsola.push(err.message));
  }

  try {
    const host = pages[0];
    await host.goto("/");
    await host.getByRole("button", { name: /Crear sala/ }).click();
    await host.getByPlaceholder("Ej: Tincho").fill(nombres[0]);
    await host.getByRole("button", { name: "4", exact: true }).click();
    await host.locator("select").first().selectOption("custom");
    await host.getByPlaceholder(/máx/).fill("1,1");
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
    // Activa el reloj — sin esto game_state.clock queda null a propósito
    // (sala sin reloj) y no habría nada que probar para la mitad C.
    await host.getByText("Jugar con reloj").click();
    await host.getByRole("button", { name: /Muerte súbita/ }).click();
    await host.getByRole("button", { name: "Crear sala", exact: true }).click();
    await expect(host.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
    await host.getByRole("button", { name: "LOCAL" }).click();
    await expect(host.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });
    const code = (await host.getByText("CÓDIGO PARA COMPARTIR").locator("xpath=following-sibling::div[1]").textContent()).trim();

    for (let i = 1; i < 4; i++) {
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
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // C — el reloj está corriendo (para el equipo mano) y de verdad cuenta
    // hacia abajo, no solo muestra "CORRIENDO" clavado en el valor inicial.
    // Lee el body entero como texto y toma la línea M:SS que aparece justo
    // antes de "● CORRIENDO" — DisplayReloj renderiza LOCAL/tiempo/flag de
    // corriendo en ese orden dentro del mismo bloque, así que esa línea es
    // siempre el tiempo del equipo que está corriendo, sin depender de
    // ninguna estructura de <div> específica que un rework visual futuro
    // pueda reordenar.
    await expect(host.getByText("● CORRIENDO")).toBeVisible({ timeout: 10000 });
    const leerTiempoCorriendo = async () => {
      const lineas = (await host.locator("body").innerText()).split("\n").map((l) => l.trim());
      const idx = lineas.indexOf("● CORRIENDO");
      if (idx <= 0) return null;
      const m = lineas[idx - 1].match(/^(\d+):(\d{2})$/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
    };
    const t0 = await leerTiempoCorriendo();
    expect(t0, "no se pudo leer el tiempo del equipo corriendo").not.toBeNull();
    await new Promise((r) => setTimeout(r, 2500));
    const t1 = await leerTiempoCorriendo();
    expect(t1, "el reloj no bajó — sigue clavado como antes del fix").toBeLessThan(t0);

    // D — mano confirma su único pedido real (0 o 1 en una mano de 1
    // carta); el pie nunca debería llegar a ver su propio panel de pedir.
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    let manoPage = null;
    for (let intento = 0; intento < 30 && !manoPage; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(manoPage, "ninguna sesión mostró el panel de pedir de mano a tiempo").toBeTruthy();

    let confirmado = false;
    for (let intento = 0; intento < 10 && !confirmado; intento++) {
      const ok = await manoPage.getByRole("button", { name: /^\d+$/ }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (ok) {
        const btn = panelConfirma(manoPage);
        if (await btn.isEnabled({ timeout: 3000 }).catch(() => false)) {
          await btn.click({ timeout: 5000 }).catch(() => {});
        }
      }
      confirmado = !(await panelConfirma(manoPage).isVisible().catch(() => false));
      if (!confirmado) await new Promise((r) => setTimeout(r, 500));
    }
    expect(confirmado, "mano no logró confirmar su pedido").toBe(true);

    // Las 4 sesiones tienen que pasar directo a 'playing' (base 1/1) sin
    // que NADIE haya visto ni tocado un panel de pedir de pie.
    for (const p of pages) {
      await expect(p.getByText(/PIE — ¿CUÁNTAS PEDÍS\?/)).toHaveCount(0);
    }
    for (const p of pages) {
      await expect(p.getByText(/base 1\/1/)).toBeVisible({ timeout: 15000 });
    }
    // Y con la fase ya en 'playing', DisplayReloj deja de montarse del
    // todo (piece C+D solo corre el reloj durante 'bidding') — sin
    // "CORRIENDO" en pantalla en ningún lado.
    for (const p of pages) {
      await expect(p.getByText("● CORRIENDO")).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
