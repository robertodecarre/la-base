import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Piece NN (batch overnight post-EE) — antes, si el reloj se agotaba en
// modo "muerte" (muerte súbita) mientras el puntaje estaba empatado (0-0
// al arrancar, por ejemplo), la pantalla de fin de partida caía en
// "¡EMPATE!": equipoGanador solo miraba totalLocal/totalVisitante, nunca
// game_state.end_cause. Ahora clock_expired declara SIEMPRE un perdedor
// (el equipo cuyo reloj corría cuando se agotó, congelado en
// game_state.clock.running — ver claim_timeout, 20260706130000_clock_
// expired.sql), con mensajes específicos por perspectiva: rojo "Hahahah
// se quedaron sin tiempo" para el equipo que perdió, verde "Ganaron
// porque los otros virgos se quedaron sin tiempo" para el otro.
//
// El reclamo es automático — apenas el reloj local de CUALQUIER sesión
// llega a 0 en modo muerte durante 'bidding', esa sesión llama
// claim_timeout sola (ver el useEffect en PantallaPartidaOnline.jsx), sin
// que nadie tenga que tocar nada. crearYUnirseSalaOnline no expone el
// campo de minutos, así que se arma la sala a mano por la UI real (mismo
// patrón que online-reloj-pedido-forzado.spec.js) con el mínimo permitido
// (1 minuto — el input tiene min=1 y además "0" cae al fallback ||5 en
// PantallaOnlineCrear.jsx, así que 0 no es alcanzable desde la UI) y
// después se espera el minuto real hasta que expire solo.

test("online: muerte súbita agotada declara un perdedor, nunca empate", async ({ browser }) => {
  test.setTimeout(150_000);
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
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
    // Reloj activado, modo muerte súbita, 1 minuto por equipo (el mínimo
    // que la UI permite) — nadie va a pedir nada, así que el reloj de
    // mano corre solo hasta agotarse.
    await host.getByText("Jugar con reloj").click();
    // Default es 10 minutos (useState(10) en PantallaOnlineCrear.jsx) —
    // hay que bajarlo al mínimo real alcanzable desde la UI (1: el input
    // tiene min=1, y además "0" cae al fallback ||5 en el propio
    // onChange, así que 0 no es alcanzable de ninguna forma) para no
    // esperar 10 minutos reales.
    await host.locator('input[type="number"]').fill("1");
    await host.getByRole("button", { name: /Muerte súbita/ }).click();
    await host.getByRole("button", { name: "Crear sala", exact: true }).click();
    await expect(host.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });
    await host.getByRole("button", { name: "LOCAL" }).click();
    await expect(host.getByText("CÓDIGO PARA COMPARTIR")).toBeVisible({ timeout: 20000 });
    const code = (await host.getByText("CÓDIGO PARA COMPARTIR").locator("xpath=following-sibling::div[1]").textContent()).trim();

    for (let i = 1; i < pages.length; i++) {
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

    // Nadie pide nada — el reloj de mano (1 minuto) corre solo hasta
    // agotarse, y ahí cualquier sesión reclama sola. Timeout generoso
    // (90s) para el minuto real + margen de red/CI.
    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toBeVisible({ timeout: 90_000 });
    }

    // Nunca "¡EMPATE!" para un final por tiempo — siempre uno de los dos
    // mensajes nuevos, consistentes entre las 4 sesiones sobre quién es
    // cuál.
    for (const p of pages) {
      await expect(p.getByText("¡EMPATE!")).toHaveCount(0);
    }

    const mensajesVistos = await Promise.all(pages.map(async (p) => {
      if (await p.getByText("Hahahah se quedaron sin tiempo").isVisible().catch(() => false)) return "perdio";
      if (await p.getByText("Ganaron porque los otros virgos se quedaron sin tiempo").isVisible().catch(() => false)) return "gano";
      return null;
    }));
    expect(mensajesVistos, "las 4 sesiones tienen que ver uno de los dos mensajes de timeout").not.toContain(null);
    // 4 jugadores, 2 por equipo — el mensaje "perdio"/"gano" tiene que
    // partirse 2 y 2 (nunca las 4 sesiones de acuerdo en el mismo, ya que
    // eso significaría que no distingue equipos de verdad).
    expect(mensajesVistos.filter((m) => m === "perdio").length, "2 sesiones ven el mensaje de derrota").toBe(2);
    expect(mensajesVistos.filter((m) => m === "gano").length, "2 sesiones ven el mensaje de victoria").toBe(2);

    // Color: rojo para quien perdió, verde para quien ganó — no los
    // colores de equipo habituales (piece HH), a propósito distintos acá.
    const paginaPerdio = pages[mensajesVistos.indexOf("perdio")];
    const paginaGano = pages[mensajesVistos.indexOf("gano")];
    const colorPerdio = await paginaPerdio.getByText("Hahahah se quedaron sin tiempo").evaluate((el) => getComputedStyle(el).color);
    const colorGano = await paginaGano.getByText("Ganaron porque los otros virgos se quedaron sin tiempo").evaluate((el) => getComputedStyle(el).color);
    expect(colorPerdio, "mensaje de derrota en rojo (colors.negative)").toBe("rgb(255, 106, 106)");
    expect(colorGano, "mensaje de victoria en verde (colors.positive.border)").toBe("rgb(126, 240, 174)");

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
