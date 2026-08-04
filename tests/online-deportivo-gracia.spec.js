import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Batch fix (post-mano_seat-split): modo "deportivo" no tenía NINGÚN
// comportamiento de timeout implementado más allá de un pase cosmético
// (piece HH) — a diferencia de "muerte" (que ya termina el partido solo,
// ver online-muerte-subita.spec.js), acá el reloj llegaba a 0 y no pasaba
// nada. Ahora, una vez que el presupuesto principal de un equipo se agota
// en modo deportivo, arranca una gracia de 10s extra (mostrada en un
// segundo contador, color distinto — colors.grace, nunca visto en el
// reloj normal) antes de la derrota automática (claim_deportivo_timeout,
// mismo modelo de "claim" que muerte, sin proceso en segundo plano).
//
// Este test cubre la rama "bidea DENTRO de la gracia" — la más nueva e
// interesante (que el partido NO termine, que la insignia desaparezca):
// la rama "se queda sin tiempo del todo" reusa exactamente el mismo
// end_cause='clock_expired' y la misma pantalla de FIN DE PARTIDA que
// online-muerte-subita.spec.js ya cubre en detalle — no se duplica acá,
// la diferencia de comportamiento server-side (10s de gracia extra) ya
// está verificada contra el proyecto real en
// scripts/verify-deportivo-timeout.mjs.
test("online: modo deportivo — al agotar el reloj principal aparece la gracia, y bidear durante la gracia no termina el partido", async ({ browser }) => {
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
    // Reloj activado, modo deportivo, 1 minuto (mínimo real alcanzable
    // desde la UI — mismo motivo que online-muerte-subita.spec.js).
    await host.getByText("Jugar con reloj").click();
    await host.locator('input[type="number"]').fill("1");
    // "Muerte súbita" es el default del segmented control — deportivo es
    // la otra opción, sin el texto "Muerte" en el nombre.
    await host.getByRole("button", { name: /Deportivo/i }).click();
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
    // agotar el presupuesto principal. La insignia "GRACIA" tiene que
    // aparecer en TODAS las sesiones (el reloj persistente se muestra
    // durante bidding sin necesitar abrir el ícono). Margen generoso
    // (80s) para el minuto real + red/CI.
    for (const p of pages) {
      await expect(p.getByText("GRACIA").first()).toBeVisible({ timeout: 80_000 });
    }

    // Nunca debería terminar el partido solo por LLEGAR a la gracia —
    // solo si la gracia se agota sin bidear (rama no cubierta acá, ver
    // comentario de arriba).
    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toHaveCount(0);
    }

    // Bidea dentro de los 10s de gracia — cualquier valor válido de mano
    // alcanza, no importa el resultado final de la mano para este test.
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    let manoPage = null;
    for (let intento = 0; intento < 30 && !manoPage; intento++) {
      for (const p of pages) {
        if (await panelConfirma(p).isVisible().catch(() => false)) { manoPage = p; break; }
      }
      if (!manoPage) await new Promise((r) => setTimeout(r, 200));
    }
    expect(manoPage, "algún capitán tiene que ver el panel de pedir a tiempo").toBeTruthy();
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
    expect(confirmado, "el bid dentro de la gracia se confirmó").toBe(true);

    // El partido sigue — nunca "FIN DE LA PARTIDA", y la insignia de
    // gracia desaparece (el equipo que bideó ya no tiene el reloj
    // corriendo, así que graciaTeam vuelve a null).
    for (const p of pages) {
      await expect(p.getByText("FIN DE LA PARTIDA")).toHaveCount(0);
      await expect(p.getByText("GRACIA")).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
