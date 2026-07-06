import { test, expect } from "@playwright/test";
import { iniciarPartida, repartirMano, NOMBRES_POR_CANT } from "./helpers.js";

// Regresión de la fix en 70076fe: el cálculo de "mano" usaba nJugTotal
// hardcodeado a 6 en vez de la cantidad real de jugadores. Corre para
// 4, 6 y 8 jugadores para asegurarse de que no vuelva a romperse.
for (const nJug of [4, 6, 8]) {
  test(`mano rota correctamente con ${nJug} jugadores`, async ({ page }) => {
    const nombres = NOMBRES_POR_CANT[nJug];
    const { pieName } = await iniciarPartida(page, { nJug });

    const pieIdx = nombres.indexOf(pieName);
    expect(pieIdx).toBeGreaterThanOrEqual(0);
    const manoEsperada = nombres[(pieIdx + nJug - 1) % nJug];

    await repartirMano(page);

    // El jugador "mano" debe mostrar la etiqueta MANO en su cuadro (el texto
    // de estado combina flags como "PIE · MANO · ▶ SU TURNO · ★CAP" en un
    // solo nodo, así que se busca como substring, no como texto exacto).
    const grupoMano = page.locator("svg g", { hasText: manoEsperada }).first();
    await expect(grupoMano).toContainText("MANO");

    // El jugador "pie" (quien reparte) debe mostrar PIE.
    const grupoPie = page.locator("svg g", { hasText: pieName }).first();
    await expect(grupoPie).toContainText("PIE");
  });
}
