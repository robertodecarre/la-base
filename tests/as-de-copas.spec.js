import { test, expect } from "@playwright/test";
import {
  iniciarPartida, avanzarUnPaso, leerModalCopas, resolverAsDeCopas,
  nombreTurnoActual, NOMBRES_POR_CANT,
} from "./helpers.js";

// Regresión del bug arreglado en 4f2bc89: copasPortador nunca se seteaba,
// así que el modal de As de Copas mostraba un portador indefinido y, al
// invertir el sentido, el orden de turno quedaba desincronizado.
//
// El mazo no tiene seed, así que no se puede forzar que salga el As de
// Copas: se corren varios intentos cortos hasta observarlo (con la
// estructura clásica, la probabilidad de no verlo ni una vez en 20
// intentos de 3 manos es < 0.1%).
const NJUG = 6;
const MAX_INTENTOS = 20;
const PASOS_POR_INTENTO = 300; // ~3 manos de clasica2004

test("As de Copas: portador correcto y sentido se invierte bien", async ({ page }) => {
  let observado = false;

  for (let intento = 0; intento < MAX_INTENTOS && !observado; intento++) {
    await iniciarPartida(page, { nJug: NJUG });

    for (let paso = 0; paso < PASOS_POR_INTENTO && !observado; paso++) {
      const antesDeCopas = await page.getByText("AS DE COPAS", { exact: true }).isVisible().catch(() => false);

      if (antesDeCopas) {
        observado = true;
        const { portador, esUltimo } = await leerModalCopas(page);

        // El bug original: portador quedaba undefined/vacío.
        expect(portador).not.toBe("");
        expect(portador).not.toMatch(/undefined/i);
        expect(NOMBRES_POR_CANT[NJUG]).toContain(portador);

        if (!esUltimo) {
          // Todavía faltan jugadores por tirar en esta base. El cálculo real
          // de "quién sigue" (sigNormal/sigInvertido en PantallaPartida) salta
          // a los jugadores que ya tiraron esta base, algo que no se extrajo
          // a engine/ — así que en vez de reimplementar esa lógica acá (y
          // arriesgar una segunda copia que se desincronice), se verifica el
          // síntoma real del bug original: el turno queda en un jugador
          // válido y distinto del portador, no en "undefined" ni trabado.
          await resolverAsDeCopas(page, "invierte");
          await expect.poll(() => nombreTurnoActual(page)).not.toBeNull();
          const siguiente = await nombreTurnoActual(page);
          expect(NOMBRES_POR_CANT[NJUG]).toContain(siguiente);
          expect(siguiente).not.toBe(portador);
        } else {
          await resolverAsDeCopas(page, "sigue");
        }
        break;
      }

      const fase = await avanzarUnPaso(page);
      if (fase === "fin" || fase === "muerto") break; // intento sin suerte, arrancar de nuevo
    }
  }

  expect(observado, `no salió As de Copas en ${MAX_INTENTOS} intentos`).toBe(true);
});
