import { test, expect } from "@playwright/test";
import { crearYUnirseSalaOnline, alternarListoEnPantalla } from "./helpers.js";

// Regresión de un bug real de producción: un tester reportó que el sorteo
// nunca aparecía — la partida pasaba directo de "listo" a la mano 0. Causa
// raíz en PantallaOnlineSala.jsx: el render chequeaba `if (gameState)
// return <PantallaPartidaOnline>` ANTES que `if (room.sorteo_inicial)
// return <SorteoOnline>`, asumiendo que todo cliente siempre iba a
// observar un estado intermedio con sorteo_inicial seteado pero gameState
// todavía null. Eso no está garantizado para una sesión que monta/
// reconecta tarde (pestaña en segundo plano, fetch inicial lento, recarga
// de página): useSala hace un solo fetch inicial de room+game_state juntos
// al montar, así que si esa sesión monta DESPUÉS de que otra ya completó
// todo el ciclo sorteo→deal_hand (unos pocos segundos), ve ambos ya
// resueltos de entrada y el chequeo de gameState gana primero, saltando
// derecho a la mesa sin haber mostrado nunca el sorteo — exactamente lo
// que vio el tester.
//
// El fix agrega sorteoCumplido: un flag LOCAL a cada sesión. Piece H
// (batch overnight post-5r) cambió CUÁNDO se activa — ya no es un timer
// ciego de ~3s desde que se observa tieneSorteo, sino recién cuando los
// nJug asientos dieron vuelta su carta (Realtime-sincronizado vía
// rooms.sorteo_inicial.flipped) más una gracia breve para leer la
// leyenda. Este test reproduce el mount tardío con un reload real a
// mitad de la mano 0 (no las 4 sesiones montando juntas, que es lo que ya
// cubre online-sorteo-inicial.spec.js y no alcanza a agarrar este caso) —
// y confirma que la sesión que reconecta después de que todo ya se
// resolvió NO repite la animación de viaje ni el click-para-dar-vuelta:
// ve el estado final (todas las cartas boca arriba, leyenda visible) de
// una, tal como pide la pieza.
test("online: una sesión que recarga después de que la mano 0 ya se repartió igual ve el sorteo", async ({ browser }) => {
  test.setTimeout(120_000);
  const nombres = ["Roberto", "Tincho", "Vale", "Naza"];
  const contexts = await Promise.all(nombres.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await crearYUnirseSalaOnline(pages, nombres, { nJug: 4, estructuraCustom: "1,1", sinAses: true });
    for (const p of pages) await alternarListoEnPantalla(p);

    for (const p of pages) {
      await expect(p.getByText("SORTEO", { exact: true })).toBeVisible({ timeout: 15000 });
    }

    // Las 4 sesiones dan vuelta su propia carta — sin esto, con piece H,
    // sorteoCumplido nunca se activa y nadie llega nunca a "MANO 1/2".
    for (let i = 0; i < pages.length; i++) {
      await pages[i].getByRole("button", { name: "Dar vuelta tu carta" }).click({ timeout: 10000 });
    }

    // Señal universal de "la mano 0 ya se repartió", visible en CUALQUIER
    // sesión sin importar de quién sea el turno de pedir (a diferencia de
    // "CONFIRMA", que solo lo ve el capitán activo en ese momento): el
    // meta del resumen ("MANO 1/2") solo existe una vez gameState existe.
    await expect(pages[0].getByText("MANO 1/2", { exact: false })).toBeVisible({ timeout: 45000 });

    // Recargar pages[3] simula exactamente un mount tardío: useSala vuelve
    // a hacer su fetch inicial desde cero, y en este punto room.sorteo_
    // inicial (con flipped={0:true,1:true,2:true,3:true}) Y game_state ya
    // existen los dos en la base.
    await pages[3].reload();

    // Tiene que ver el sorteo igual (no saltar directo a la mesa)...
    await expect(pages[3].getByText("SORTEO", { exact: true })).toBeVisible({ timeout: 5000 });

    // ...mostrando el estado YA resuelto — sin el botón de "dar vuelta"
    // (todos, incluida esta sesión, ya flipearon antes del reload) ni el
    // hint de "tocá tu carta".
    await expect(pages[3].getByRole("button", { name: "Dar vuelta tu carta" })).toHaveCount(0);
    await expect(pages[3].getByText(/Tocá tu carta/)).toHaveCount(0);

    // ...y sin repetir la animación de viaje, pasa a la mesa casi de
    // inmediato (gracia corta para el caso "ya resuelto al montar", no la
    // gracia normal de ~1.8s) — no quedarse trabada mostrándolo para
    // siempre.
    await expect(pages[3].getByText("MANO 1/2", { exact: false })).toBeVisible({ timeout: 6000 });
  } finally {
    for (const c of contexts) await c.close();
  }
});
