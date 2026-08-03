import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";

// Pieza J — señas (gestos de cara compartidos + remapeo por equipo).
//
// A propósito NO toca bidding/jugar cartas ni ninguna otra mecánica de
// juego — esta suite solo cubre lo nuevo: el customizador de cara en la
// pantalla de selección de equipo, el ícono de señas en la mesa (privado:
// abrirlo no se ve de las otras sesiones) y que un gesto mandado por una
// sesión aparece en TODAS las sesiones y se apaga solo.

test("online: el customizador de cara en ELEGÍ TU EQUIPO cambia la vista previa sin errores", async ({ page }) => {
  test.setTimeout(60_000);
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));

  await page.goto("/");
  await page.getByRole("button", { name: /Crear sala/ }).click();
  await page.getByPlaceholder("Ej: Tincho").fill("Tincho");
  await page.getByRole("button", { name: "Crear sala", exact: true }).click();

  await expect(page.getByText("ELEGÍ TU EQUIPO")).toBeVisible({ timeout: 15000 });

  // Vista previa: un solo <svg width="72"> en esta pantalla (el preview del
  // customizador, ReactionFace size=72) — sin anteojos todavía, así que
  // solo tiene los <rect> de cejas (2).
  const preview = page.locator('svg[width="72"]');
  await expect(preview).toBeVisible();
  const rectsSinAnteojos = await preview.locator("rect").count();

  // Elegir un corte de pelo, un color y prender anteojos — cada click
  // dispara guardarApariencia (set_appearance) contra el proyecto real de
  // Supabase; acá solo se verifica que la UI reacciona y no rompe nada,
  // la persistencia server-side ya está cubierta por
  // scripts/verify-senas-appearance.mjs.
  await page.getByRole("button", { name: "Mohawk" }).click();
  await page.getByRole("button", { name: "Rubio" }).click();
  await page.getByRole("checkbox").check();

  // Los anteojos agregan 2 <rect> más (dos lentes) al preview — señal
  // estructural de que el toggle realmente re-renderizó la cara.
  await expect(async () => {
    const rectsConAnteojos = await preview.locator("rect").count();
    expect(rectsConAnteojos).toBe(rectsSinAnteojos + 2);
  }).toPass({ timeout: 5000 });

  expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
});

test("online: el ícono de señas es privado y un gesto mandado se ve en todas las sesiones y se apaga solo", async ({ browser }) => {
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

    const [host, rival] = pages;

    // El ícono de señas está presente en todas las sesiones, overlay
    // arranca cerrado.
    for (const p of pages) {
      await expect(p.getByRole("button", { name: "Ver señas" })).toBeVisible();
      await expect(p.getByText("SEÑAS", { exact: true })).toHaveCount(0);
    }

    // Privacidad: host abre su hoja de señas — ninguna OTRA sesión debe
    // verla (ni un rival ni, a propósito, tampoco se transmite a nadie).
    await host.getByRole("button", { name: "Ver señas" }).click();
    await expect(host.getByText("SEÑAS", { exact: true })).toBeVisible();
    for (const p of pages.slice(1)) {
      await expect(p.getByText("SEÑAS", { exact: true })).toHaveCount(0);
    }

    // Mandar el gesto "shhh" (dura 2000ms, ver duracionGesto en
    // ReactionFace.jsx) — se identifica por el globo "PUTO!" que solo esa
    // cara dibuja (ver GESTURES.shhh.hand). La fila del picker usa la
    // etiqueta default (DEFAULT_SENAS.shhh, sin remapear en este test).
    await host.getByText("no digas nada más", { exact: true }).click();

    // Abrir la hoja se cierra sola al mandar (SenasOverlay: onEnviar +
    // onCerrar en el mismo click).
    await expect(host.getByText("SEÑAS", { exact: true })).toHaveCount(0);

    // Todas las sesiones —incluida la que lo mandó, vía el propio broadcast
    // con self:true— ven "PUTO!" aparecer casi al mismo tiempo, sin
    // importar de qué equipo son (no hay visibilidad asimétrica).
    for (const p of pages) {
      await expect(p.getByText("PUTO!")).toBeVisible({ timeout: 5000 });
    }

    // Y se apaga solo (vuelve a 'neutral') sin que nadie tenga que hacer
    // nada — bien pasado los 2000ms nominales, con margen para jitter de
    // red/render.
    for (const p of pages) {
      await expect(p.getByText("PUTO!")).toHaveCount(0, { timeout: 6000 });
    }

    // Ningún lado muestra jamás qué SIGNIFICA el gesto mientras se
    // reproduce — ni al rival ni a nadie (la decodificación vive solo en
    // la hoja privada, nunca superpuesta a la cara en la mesa).
    for (const p of pages) {
      await expect(p.getByText("no digas nada más", { exact: true })).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
