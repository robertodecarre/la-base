import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, asegurarSesion } from "../lib/supabase";
import { duracionGesto, GESTURES } from "../components/ReactionFace";

// ══════════════════════════════════════════════
// USE GESTOS — capa de señas en vivo (pieza J). Realtime BROADCAST, no una
// escritura a una tabla: es un evento efímero (quién hizo qué cara, por
// cuánto tiempo), no estado que necesite persistir ni disparar triggers —
// una fila/UPDATE en `players` por cada gesto sería carga de Postgres sin
// ningún beneficio (nadie necesita leer "el último gesto" fuera de este
// momento en vivo).
//
// Todo cliente conectado ve el mismo gesto por la misma duración, sin
// importar de qué equipo es — no hay visibilidad asimétrica entre
// compañero y rival (ver spec: la duración corta de la mayoría de los
// gestos es lo que hace costoso espiar, no un filtro de a quién se le
// muestra). `self: true` en la config del canal hace que el propio emisor
// pase por el mismo camino de "recibido por broadcast" que todos los
// demás, en vez de mostrar su propio gesto al instante — el timer de
// reveal arranca al RECIBIR el evento (acá, en el handler `.on`), nunca al
// emitirlo, así que el jitter de red no cambia cuánto dura para ningún
// espectador puntual, tampoco para quien lo mandó.
export function useGestos(roomId, mySeat) {
  const [gestosPorAsiento, setGestosPorAsiento] = useState({});
  const channelRef = useRef(null);
  const timeoutsRef = useRef({});

  useEffect(() => {
    if (!roomId) return;
    let cancelado = false;

    (async () => {
      await asegurarSesion();
      if (cancelado) return;

      const channel = supabase.channel(`senas:${roomId}`, {
        config: { broadcast: { self: true } },
      });

      channel.on("broadcast", { event: "gesto" }, ({ payload }) => {
        const { seat, gestureKey } = payload || {};
        if (seat == null || !GESTURES[gestureKey]) return;

        if (timeoutsRef.current[seat]) clearTimeout(timeoutsRef.current[seat]);
        setGestosPorAsiento((prev) => ({ ...prev, [seat]: gestureKey }));
        timeoutsRef.current[seat] = setTimeout(() => {
          setGestosPorAsiento((prev) => {
            if (!(seat in prev)) return prev;
            const { [seat]: _quitado, ...resto } = prev;
            return resto;
          });
          delete timeoutsRef.current[seat];
        }, duracionGesto(gestureKey));
      });

      channel.subscribe();
      channelRef.current = channel;
    })();

    return () => {
      cancelado = true;
      Object.values(timeoutsRef.current).forEach(clearTimeout);
      timeoutsRef.current = {};
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId]);

  const enviarGesto = useCallback(
    (gestureKey) => {
      if (!channelRef.current || mySeat == null || !GESTURES[gestureKey]) return;
      channelRef.current.send({
        type: "broadcast",
        event: "gesto",
        payload: { seat: mySeat, gestureKey },
      });
    },
    [mySeat]
  );

  return { gestosPorAsiento, enviarGesto };
}
