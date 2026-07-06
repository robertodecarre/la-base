import { expect } from "@playwright/test";

export const NOMBRES_POR_CANT = {
  4: ["Micho", "Tincho", "Leo", "Negro"],
  6: ["Micho", "Tincho", "Leo", "Negro", "Gordo", "CabezonIA"],
  8: ["Micho", "Tincho", "Leo", "Negro", "Gordo", "CabezonIA", "Flaco", "Pelado"],
};

// Deja todo en la configuración por defecto salvo la cantidad de jugadores,
// para no depender de qué cartas caen en el reparto (no hay seed de random).
export async function iniciarPartida(page, { nJug = 6 } = {}) {
  await page.goto("/");
  if (nJug !== 6) {
    await page.getByRole("button", { name: String(nJug), exact: true }).click();
  }
  await page.getByRole("button", { name: "COMENZAR SORTEO" }).click();

  // Sorteo: tocar el mazo, leer quién da (pie), comenzar partida.
  await page.getByText("TOCAR").click();
  const daLabel = page.getByText("DA", { exact: true });
  await expect(daLabel).toBeVisible();
  // "xpath=.." (sin nombre de elemento) evita el problema de que un XPath
  // sin prefijo de namespace no matchea <text> en el namespace SVG.
  const grupoGanador = daLabel.locator("xpath=..");
  const pieName = (await grupoGanador.textContent()).replace("DA", "").trim();

  await page.getByRole("button", { name: "COMENZAR PARTIDA" }).click();
  return { pieName };
}

// Reparte la mano actual (fase "repartir" -> "pedir").
export async function repartirMano(page) {
  await page.getByRole("button", { name: /^Repartir/ }).click();
}

// Resuelve la fase de pedir con la primera opción disponible en cada subfase.
export async function pedirLoQueSea(page) {
  for (let i = 0; i < 2; i++) {
    const confirmBtn = page.getByRole("button", { name: /CONFIRMA/ });
    if (!(await confirmBtn.isVisible().catch(() => false))) return;
    const numBtn = page.getByRole("button", { name: /^\d+$/ }).first();
    await numBtn.click();
    await confirmBtn.click();
    await page.waitForTimeout(50);
  }
}

// Grupo <g> del jugador cuyo turno está activo ahora mismo, o null si ninguno.
function grupoTurnoActivo(page) {
  return page.locator("svg g", { hasText: "▶ SU TURNO" }).first();
}

export async function nombreTurnoActual(page) {
  const grupo = grupoTurnoActivo(page);
  if ((await grupo.count()) === 0) return null;
  return (await grupo.locator("text").first().textContent()).trim();
}

// Juega una carta del jugador activo. Cualquier carta es legal en cualquier
// momento (no hay regla de "seguir el palo"), así que no hace falta saber
// qué cartas tiene nadie: alcanza con jugar la última carta de su mano,
// expandiendo la mano primero si el modo contraído la esconde detrás de un
// segundo click ("levantar" antes de "tirar").
export async function jugarCartaDelTurnoActual(page) {
  const grupo = grupoTurnoActivo(page);
  if ((await grupo.count()) === 0) return false;

  const verBtn = grupo.getByText("▼ ver");
  if (await verBtn.isVisible().catch(() => false)) {
    await verBtn.dispatchEvent("click");
  }
  // Los <g> de cada carta son hijos directos del grupo del jugador (el
  // fragment de CartasManoSVG no agrega wrapper al DOM), así que ":scope > g"
  // agarra la última carta y no un sub-elemento decorativo cualquiera.
  // dispatchEvent en vez de click: el handler está en el <g> por bubbling
  // de evento, así que no importa qué píxel exacto "recibe" el click, pero
  // el hit-testing de SVG solo pinta ciertas zonas (huecos en los palos
  // decorativos, cartas superpuestas por el gap ajustado), lo que hacía que
  // el actionability check de Playwright reintentara indefinidamente.
  const ultimaCarta = grupo.locator(":scope > g").last();
  await ultimaCarta.dispatchEvent("click");
  return true;
}

export async function elegirAsDeOros(page) {
  const boton = page.locator('div:has-text("AS DE OROS") button').first();
  await boton.click();
}

function modalCopas(page) {
  return page.locator("div", { has: page.getByText("AS DE COPAS", { exact: true }) }).first();
}

// Lee el modal de As de Copas sin resolverlo: quién lo tiró (portador) y si
// es la última carta pendiente de la ronda (esUltimo) o si todavía faltan
// jugadores por tirar en esta base.
export async function leerModalCopas(page) {
  const modal = modalCopas(page);
  const portador = (await modal.locator("b").first().textContent()).trim();
  const texto = await modal.textContent();
  const esUltimo = texto.includes("la próxima base");
  return { portador, esUltimo };
}

export async function resolverAsDeCopas(page, opcion) {
  const modal = modalCopas(page);
  const boton = opcion === "invierte" ? modal.getByText("Se da vuelta") : modal.getByText("Sigue");
  await boton.click();
}

export async function faseActual(page) {
  if (await page.getByRole("button", { name: /^Repartir/ }).isVisible().catch(() => false)) return "repartir";
  if (await page.getByRole("button", { name: /CONFIRMA/ }).isVisible().catch(() => false)) return "pedir";
  if (await page.getByText("AS DE OROS", { exact: true }).isVisible().catch(() => false)) return "oros-menu";
  if (await page.getByText("AS DE COPAS", { exact: true }).isVisible().catch(() => false)) return "copas-menu";
  if (await page.getByRole("button", { name: "SIGUIENTE BASE →" }).isVisible().catch(() => false)) return "resolver";
  if (await page.getByRole("button", { name: /^CERRAR MANO/ }).isVisible().catch(() => false)) return "cerrar";
  if (await page.getByText("FIN DE PARTIDA").isVisible().catch(() => false)) return "fin";
  if (await page.getByText("TIEMPO AGOTADO").isVisible().catch(() => false)) return "muerto";
  if ((await grupoTurnoActivo(page).count()) > 0) return "jugar";
  return "desconocida";
}

// Motor genérico que avanza el juego un paso según la fase visible.
// onCopas, si se pasa, se llama cada vez que aparece el menú de As de Copas
// (para que el test pueda hacer sus propias aserciones antes de resolverlo).
export async function avanzarUnPaso(page, { onCopas } = {}) {
  const fase = await faseActual(page);
  switch (fase) {
    case "repartir": await repartirMano(page); return fase;
    case "pedir": await pedirLoQueSea(page); return fase;
    case "jugar": await jugarCartaDelTurnoActual(page); return fase;
    case "oros-menu": await elegirAsDeOros(page); return fase;
    case "copas-menu": {
      if (onCopas) await onCopas(page);
      else await resolverAsDeCopas(page, "sigue");
      return fase;
    }
    case "resolver": await page.getByRole("button", { name: "SIGUIENTE BASE →" }).click(); return fase;
    case "cerrar": await page.getByRole("button", { name: /^CERRAR MANO/ }).click(); return fase;
    default: return fase;
  }
}

// Juega solo la mano en curso: reparte, pide, juega todas las bases y
// cierra. Se detiene apenas se cierra esa mano (no sigue con la próxima).
export async function jugarUnaManoCompleta(page, { maxPasos = 500, onCopas } = {}) {
  for (let i = 0; i < maxPasos; i++) {
    const fase = await avanzarUnPaso(page, { onCopas });
    if (fase === "cerrar") return faseActual(page); // "repartir" | "fin" | "muerto"
    if (fase === "fin" || fase === "muerto") return fase;
  }
  throw new Error(`jugarUnaManoCompleta: no terminó en ${maxPasos} pasos`);
}

// Corre la partida hasta terminar (fin/muerto) o hasta agotar maxPasos.
export async function jugarPartidaCompleta(page, { maxPasos = 4000, onCopas } = {}) {
  for (let i = 0; i < maxPasos; i++) {
    const fase = await avanzarUnPaso(page, { onCopas });
    if (fase === "fin" || fase === "muerto") return fase;
  }
  throw new Error(`jugarPartidaCompleta: no terminó en ${maxPasos} pasos`);
}
