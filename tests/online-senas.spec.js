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

// Rediseño de barra de señas (reemplaza el ícono+overlay modal de arriba
// en la mesa real por una barra horizontal persistente, ver SenasUI.jsx's
// SenasBar) — la barra ya no se "abre" (nadie más podía ver que la
// abriste); ahora está SIEMPRE montada en las 4 sesiones, y lo único que
// sigue siendo puramente local es colapsarla/expandirla. El resto del
// contrato de pieza J (gesto visible en todas las sesiones, se apaga
// solo, nunca se filtra qué SIGNIFICA) sigue intacto — se re-verifica acá
// contra la barra nueva.
test("online: la barra de señas es persistente en todas las sesiones, colapsarla es privado, y un gesto mandado se ve en todas y se apaga solo", async ({ browser }) => {
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

    // La barra está SIEMPRE montada (no un ícono que hay que abrir) en las
    // 4 sesiones, y arranca expandida.
    for (const p of pages) {
      await expect(p.getByText("SEÑAS", { exact: true })).toBeVisible();
      await expect(p.getByRole("button", { name: "Colapsar señas" })).toBeVisible();
    }

    // Colapsar mi propia barra es puramente local (mismo criterio que
    // tableroAbierto/relojAbierto ya tenían) — otra sesión no lo ve.
    await host.getByRole("button", { name: "Colapsar señas" }).click();
    await expect(host.getByRole("button", { name: "Expandir señas" })).toBeVisible();
    await expect(rival.getByRole("button", { name: "Colapsar señas" })).toBeVisible();
    await host.getByRole("button", { name: "Expandir señas" }).click();

    // Mandar el gesto "shhh" (dura 2000ms, ver duracionGesto en
    // ReactionFace.jsx) — se identifica por el globo "PUTO!", ahora un
    // overlay de texto en MesaCircular en vez de estar dibujado a mano
    // dentro del SVG de la cara (ver ReactionFace.jsx). data-gesture-key
    // sigue targeteando la card sin depender de ninguna etiqueta visible.
    await host.locator('[data-gesture-key="shhh"]').first().click();

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

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Rediseño de barra de señas, feature #2: color tags son puramente
// personales (localStorage, ver lib/senasPrefs.js) — nunca se comparten,
// ni siquiera con el propio compañero de equipo, ni sobreviven a otra
// sesión del mismo navegador.
test("online: la marca de color en una card de señas es personal (localStorage), no se comparte con el compañero", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const [host, , teammate] = pages; // P0 y P2 son equipo LOCAL (asientos pares)

    const cardHost = host.locator('[data-gesture-key="guino"]');
    const rosado = cardHost.getByTitle("Marcar rosado");
    const celeste = cardHost.getByTitle("Marcar celeste");

    await expect(rosado).toHaveCSS("box-shadow", "none");
    await rosado.click();
    await expect(rosado).not.toHaveCSS("box-shadow", "none");
    await expect(celeste).toHaveCSS("box-shadow", "none");

    // El compañero (misma sala, mismo gesto, OTRO browser context — sin
    // localStorage compartido) nunca ve la marca.
    const cardTeammate = teammate.locator('[data-gesture-key="guino"]');
    await expect(cardTeammate.getByTitle("Marcar rosado")).toHaveCSS("box-shadow", "none");

    // Toggle-off: clickear el mismo color de nuevo la borra.
    await rosado.click();
    await expect(rosado).toHaveCSS("box-shadow", "none");
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Rediseño de barra de señas, feature #2: viñetas de gestos largos son
// editables por equipo (set_senas_bubble) pero, igual que el gesto en sí
// (useGestos.js), PÚBLICAS al dispararse — el rival también ve el texto
// editado, no solo el propio equipo. Apagar la viñeta la saca del todo.
test("online: editar/apagar la viñeta de un gesto largo se refleja para TODOS al dispararlo, rival incluido", async ({ browser }) => {
  test.setTimeout(150_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const [host, ...resto] = pages; // P0 LOCAL; resto incluye al rival VISITANTE

    await host.getByRole("button", { name: "Gestos", exact: true }).click();
    const cardEnojo = host.locator('[data-gesture-key="enojo"]');
    await cardEnojo.getByTitle("Editar texto de la viñeta").click();
    const input = cardEnojo.locator("input").last();
    await input.fill("Nuevo texto de prueba");
    await input.blur();
    // Margen para que set_senas_bubble + el eco de Realtime de rooms.
    // senas_mapping lleguen antes de disparar el gesto.
    await host.waitForTimeout(1500);

    await cardEnojo.click();
    for (const p of pages) {
      await expect(p.getByText("Nuevo texto de prueba")).toBeVisible({ timeout: 5000 });
    }
    for (const p of pages) {
      await expect(p.getByText("Nuevo texto de prueba")).toHaveCount(0, { timeout: 6000 });
    }

    // Apagar la viñeta — al volver a disparar, ningún texto aparece en
    // ninguna sesión (ni el nuevo ni el default viejo).
    await cardEnojo.getByTitle("Activar/desactivar viñeta").click();
    await host.waitForTimeout(1500);
    await cardEnojo.click();
    await host.waitForTimeout(2200); // dura 2000ms + margen
    for (const p of pages) {
      await expect(p.getByText("Nuevo texto de prueba")).toHaveCount(0);
    }
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Rediseño de barra de señas, feature #2: arrastrar para reordenar
// (set_senas_order) persiste server-side y un compañero de equipo ve el
// mismo orden nuevo — no un estado puramente local del que arrastró.
test("online: arrastrar una card de señas para reordenar persiste y el compañero ve el mismo orden", async ({ browser }) => {
  test.setTimeout(150_000);
  const nombres = ["P0", "P1", "P2", "P3"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);
    await pasarSorteoAnimado(pages);
    for (const p of pages) {
      await expect(p.getByText(/Mano 1/)).toBeVisible({ timeout: 45000 });
    }

    const [host, , teammate] = pages; // P0 y P2 son equipo LOCAL

    const primeraHost = () => host.locator('[data-gesture-key]').first();
    const terceraHost = host.locator('[data-gesture-key]').nth(2);
    const claveTercera = await terceraHost.getAttribute("data-gesture-key");

    await terceraHost.dragTo(primeraHost());

    await expect(async () => {
      expect(await primeraHost().getAttribute("data-gesture-key")).toBe(claveTercera);
    }).toPass({ timeout: 5000 });

    // Se guardó server-side (set_senas_order, no gateado a 'waiting' — a
    // diferencia de set_senas_mapping, funciona durante la partida real):
    // el compañero ve el mismo orden nuevo tras la propagación por
    // Realtime de rooms.senas_mapping.
    await expect(async () => {
      const primeraCompanero = teammate.locator('[data-gesture-key]').first();
      expect(await primeraCompanero.getAttribute("data-gesture-key")).toBe(claveTercera);
    }).toPass({ timeout: 8000 });
  } finally {
    for (const c of contexts) await c.close();
  }
});

// Mírenme (mecanismo real, ver migración 20260805000000 y game_state.
// mirenme) — pedido/mirada por equipo, nunca visible para el rival.
test("online: Mírenme — pedido y mirada por equipo, invisible para el rival, cancelación manual tiene prioridad", async ({ browser }) => {
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

    const [p0, p1, p2, p3] = pages; // P0/P2 LOCAL, P1/P3 VISITANTE

    // P0 pide "Mírenme".
    await p0.getByRole("button", { name: "Mírenme", exact: true }).click();
    await expect(p0.getByRole("button", { name: "Dejar de ver", exact: true })).toBeVisible({ timeout: 8000 });

    // Su compañero P2 ve el chip "Te miro" para el pedido de P0; el rival
    // (P1/P3) NUNCA ve ningún chip de Mírenme asociado a P0 — nunca se
    // transmite al equipo contrario.
    await expect(p2.getByRole("button", { name: /Te miro/ })).toBeVisible({ timeout: 8000 });
    for (const rival of [p1, p3]) {
      await expect(rival.getByRole("button", { name: /Te miro/ })).toHaveCount(0);
      await expect(rival.getByRole("button", { name: /Dejar de ver/ })).toHaveCount(0);
    }

    // P2 mira: el botón le cambia a "Dejar de ver a P0".
    await p2.getByRole("button", { name: /Te miro/ }).click();
    await expect(p2.getByRole("button", { name: /Dejar de ver a/ })).toBeVisible({ timeout: 8000 });

    // P2 deja de ver: el chip vuelve a "Te miro" — el pedido de P0 sigue
    // activo, P2 puede volver a mirar el MISMO pedido.
    await p2.getByRole("button", { name: /Dejar de ver a/ }).click();
    await expect(p2.getByRole("button", { name: /Te miro/ })).toBeVisible({ timeout: 8000 });
    await p2.getByRole("button", { name: /Te miro/ }).click();
    await expect(p2.getByRole("button", { name: /Dejar de ver a/ })).toBeVisible({ timeout: 8000 });

    // P0 cancela su propio pedido manualmente (prioridad, aunque P2 lo
    // sigue mirando) — el botón de P0 vuelve a "Mírenme", y el chip de P2
    // para ese pedido desaparece del todo.
    await p0.getByRole("button", { name: "Dejar de ver", exact: true }).click();
    await expect(p0.getByRole("button", { name: "Mírenme", exact: true })).toBeVisible({ timeout: 8000 });
    await expect(p2.getByRole("button", { name: /Te miro|Dejar de ver a/ })).toHaveCount(0, { timeout: 8000 });

    expect(erroresConsola, `errores de consola:\n${erroresConsola.join("\n")}`).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
