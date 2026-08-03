import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla, pasarSorteoAnimado } from "./helpers.js";
import { SIN_SENA } from "../src/lib/senas.js";

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

// Batch fix #5 (post-pieza-J): el panel "Personalizar señas del equipo"
// (lobby) no mostraba NINGÚN indicio de a qué gesto correspondía cada
// input — ahora cada fila lleva la vista previa real de ReactionFace más
// una etiqueta legible. También confirma el DEFAULT_SENAS nuevo (9 gestos
// con significado default de verdad, pedidos por Roberto; el resto
// arranca con el placeholder neutro "sin significado asignado", nunca un
// significado inventado).
test("online: el panel de señas del lobby muestra la cara + nombre de cada gesto, y los defaults son los 9 pedidos", async ({ page }) => {
  test.setTimeout(60_000);
  const erroresConsola = [];
  page.on("pageerror", (err) => erroresConsola.push(err.message));

  await page.goto("/");
  await page.getByRole("button", { name: /Crear sala/ }).click();
  await page.getByPlaceholder("Ej: Tincho").fill("Tincho");
  await page.getByRole("button", { name: "Crear sala", exact: true }).click();
  await page.getByText("ELEGÍ TU EQUIPO").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "LOCAL" }).click();
  await page.getByText("CÓDIGO PARA COMPARTIR").waitFor({ timeout: 20000 });

  await page.getByRole("button", { name: "Personalizar señas del equipo" }).click();
  await expect(page.getByText("SEÑAS DEL EQUIPO")).toBeVisible();

  // Cada fila del panel es un <input> con un <svg> (la cara) justo antes —
  // confirma que la vista previa por gesto está ahí, no solo el input
  // suelto que había antes. Conteo a nivel de página (no por-fila con
  // `div:has(...)`, que matchea CUALQUIER ancestro y no solo la fila —
  // nada más en esta pantalla del lobby dibuja <svg> ni <input>, así que
  // un conteo global es exacto igual).
  const inputs = page.locator('input[type="text"], input:not([type])');
  const cantidadInputs = await inputs.count();
  expect(cantidadInputs, "un input por gesto editable (19, todos menos neutral)").toBe(19);
  const cantidadPreviews = await page.locator("svg").count();
  expect(cantidadPreviews, "una vista previa ReactionFace por gesto editable (19)").toBe(19);

  // Un gesto CON default (pedido tal cual: "beso" -> "Tengo 2 bajas") — el
  // placeholder tiene que ser ese texto exacto, no el inventado viejo
  // ("confío en el pedido").
  await expect(page.locator('input[placeholder="Tengo 2 bajas"]')).toBeVisible();
  await expect(page.getByText("Beso", { exact: true })).toBeVisible();

  // Un gesto SIN default (p.ej. "wow", nunca estuvo en la lista pedida) —
  // placeholder neutro, nunca un significado inventado.
  await expect(page.locator('input[placeholder="sin significado asignado"]').first()).toBeVisible();
  const cantidadSinDefault = await page.locator('input[placeholder="sin significado asignado"]').count();
  // 19 editables - 9 con default pedido = 10 sin default.
  expect(cantidadSinDefault, "10 gestos quedan sin default (19 editables - 9 pedidos)").toBe(10);

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
    // cara dibuja (ver GESTURES.shhh.hand). "shhh" no está entre los 9
    // gestos con default de DEFAULT_SENAS (batch fix #5) — su fila en el
    // picker no tiene ningún texto propio para clickear (muestra el hint
    // genérico SIN_SENA, compartido con otras 9 filas sin default), así
    // que se targetea por data-gesture-key (agregado a propósito para
    // esto, no depende de la etiqueta visible de ningún gesto).
    await host.locator('button[data-gesture-key="shhh"]').click();

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
    // la hoja privada, nunca superpuesta a la cara en la mesa). "shhh" no
    // tiene default propio (ver arriba), así que lo que NO debería
    // filtrarse acá es el hint genérico SIN_SENA.
    for (const p of pages) {
      await expect(p.getByText(SIN_SENA, { exact: true })).toHaveCount(0);
    }

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
