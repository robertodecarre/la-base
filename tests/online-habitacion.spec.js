import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado, jugarCartaDelTurnoActual } from "./helpers.js";

// Piece G (batch overnight post-5r):
//   1. El botón "Siguiente base" se movió de un <Btn> HTML debajo de la
//      mesa a un botón SVG en la esquina inferior derecha de "la
//      habitación" (el canvas cuadrado de MesaCircular, fuera de la elipse
//      redonda de la mesa — hay espacio de sobra en las esquinas). Quien
//      ganó la base ve el botón real (role=button, name="Siguiente base");
//      el resto ve el mismo cartel pero como texto de espera.
//   2. El indicador "LA ESTÁ HACIENDO" (quién va ganando la base en curso,
//      mientras se juega) se sacó del todo — ya no debería aparecer nunca.
//
// A propósito NO toca la pantalla/animación de sorteo ni gestos de mano
// sincronizados (fuera de alcance para este batch). Usa estructura de 2
// cartas (en vez de 1) para que la base tenga al menos una jugada de por
// medio ANTES de que se complete, dejando una ventana real donde el viejo
// "LA ESTÁ HACIENDO" habría aparecido — con 1 carta, las 4 juegan casi a
// la vez y esa ventana es demasiado angosta para verificar la ausencia
// con confianza.

test("online: siguiente base vive en la esquina de la habitación, y LA ESTÁ HACIENDO ya no existe", async ({ browser }) => {
  test.setTimeout(180_000);
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
    await host.getByPlaceholder(/máx/).fill("2,2");
    const asesCheckboxes = host.locator('input[type="checkbox"]');
    for (let i = 0; i < 3; i++) await asesCheckboxes.nth(i).uncheck();
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
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    // Bidea (mano + pie, ambos con opción real en una mano de 2 cartas —
    // sin kamikaze disponible, totalBases<=2, así que "primer disponible"
    // alcanza para las dos subfases).
    const panelConfirma = (page) => page.getByRole("button", { name: /CONFIRMA/ });
    // "1" (el valor del medio con totalBases=2) deja SIEMPRE dos opciones
    // válidas para el pie ({0,2}) — a diferencia de 0 o 2, que fuerzan una
    // sola opción y auto-resuelven el pedido del pie en la misma llamada
    // de mano (piece D). Esta prueba necesita las DOS jugadas de mano/pie
    // reales, con la base jugándose de a poco en el medio, así que evita
    // a propósito el caso forzado.
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
    await confirmarUno("1"); // mano — deja 2 opciones reales para el pie
    await confirmarUno(); // pie

    // Juega UNA sola carta (cualquier sesión con el turno activo) y
    // confirma, en ese momento — la base sigue en curso, ni completa ni
    // resuelta — que "LA ESTÁ HACIENDO" ya no existe en ninguna sesión
    // (confirma la remoción, no solo su ausencia post-resolución).
    let jugadaUna = false;
    for (let i = 0; i < 30 && !jugadaUna; i++) {
      for (const p of pages) {
        if (await jugarCartaDelTurnoActual(p).catch(() => false)) { jugadaUna = true; break; }
      }
      if (!jugadaUna) await new Promise((r) => setTimeout(r, 300));
    }
    expect(jugadaUna, "no se pudo jugar ninguna carta").toBe(true);
    for (const p of pages) {
      await expect(p.getByText("LA ESTÁ HACIENDO")).toHaveCount(0);
    }

    // Termina de jugar la base entera (quedan 3 jugadas más) hasta llegar
    // a 'resolving'.
    let enResolving = false;
    for (let i = 0; i < 40 && !enResolving; i++) {
      for (const p of pages) await jugarCartaDelTurnoActual(p).catch(() => {});
      for (const p of pages) {
        if (await p.getByRole("button", { name: "Siguiente base" }).isVisible().catch(() => false)) { enResolving = true; break; }
        if (await p.getByText(/confirme…/).isVisible().catch(() => false)) { enResolving = true; break; }
      }
      if (!enResolving) await new Promise((r) => setTimeout(r, 300));
    }
    expect(enResolving, "la base no llegó a 'resolving' a tiempo").toBe(true);

    // Llega a 'resolving': solo quien ganó la base ve el botón real
    // (esquina de la habitación); el resto ve el cartel de espera, nunca
    // el botón.
    let ganadorPage = null;
    for (let i = 0; i < 20 && !ganadorPage; i++) {
      for (const p of pages) {
        if (await p.getByRole("button", { name: "Siguiente base" }).isVisible().catch(() => false)) { ganadorPage = p; break; }
      }
      if (!ganadorPage) await new Promise((r) => setTimeout(r, 500));
    }
    expect(ganadorPage, "ninguna sesión mostró el botón de siguiente base a tiempo").toBeTruthy();

    for (const p of pages) {
      if (p === ganadorPage) continue;
      await expect(p.getByRole("button", { name: "Siguiente base" })).toHaveCount(0);
      await expect(p.getByText(/confirme…/)).toBeVisible();
    }

    // "LA ESTÁ HACIENDO" tampoco existe en 'resolving' (ya se reemplaza por
    // "LA HIZO", que sí sigue existiendo — no se está probando texto
    // vacío por accidente).
    for (const p of pages) {
      await expect(p.getByText("LA ESTÁ HACIENDO")).toHaveCount(0);
      await expect(p.getByText("LA HIZO")).toBeVisible();
    }

    await ganadorPage.getByRole("button", { name: "Siguiente base" }).click();
    for (const p of pages) {
      await expect(p.getByText(/base 2\/2/)).toBeVisible({ timeout: 15000 });
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
