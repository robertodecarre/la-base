import { useEffect, useRef, useState } from "react";
import { posEnCirculo } from "../engine/structures";
import { CartaSVG } from "./cards/CartaSVG";
import { marcarFlipSorteo } from "../lib/game";
import { colors, fonts } from "../theme";

// ══════════════════════════════════════════════
// SORTEO ANIMADO (piece H, batch overnight post-5r) — reemplaza el
// revelado instantáneo de SorteoOnline por el viaje+giro de
// direccion-sorteo-animado.html: sortear_reparto_inicial ya resolvió
// cartas+ganador server-side en una sola pasada (esa lógica no cambia acá,
// ver 20260706150000_sorteo_inicial_rpc.sql) — esto solo cambia CUÁNDO se
// revela al cliente. El viaje+giro de cada carta es puramente visual/
// local (cada sesión lo reproduce a su propio ritmo, sin coordinarse); el
// flip de la propia carta es un click local con feedback optimista;
// el flip de las cartas ajenas se sincroniza por Realtime vía
// rooms.sorteo_inicial.flipped (marcar_flip_sorteo RPC, piece H) — no
// hace falta compartir posición/gesto continuo (esa es la pieza J,
// todavía diferida), alcanza con un boolean on/off por asiento.
//
// Duraciones/easing/rotación calcados de la referencia, no aproximados:
// viaje 0.62s cubic-bezier(.2,.8,.3,1), escala pico 1.08, giro 540/720deg
// (signo por seat%2 — ver nota en la referencia sobre por qué es paridad
// de asiento y no una regla geométrica de "lado de la mesa"), stagger
// 90ms entre asientos, flip 0.5s cubic-bezier(.34,1.56,.64,1).
const CW = 40, CH = 58;
const STAGGER_MS = 90;
const VIAJE_MS = 620;
const GRACIA_MS = 1800; // "1.5-2s" pedido, sin precisión exigida
const GRACIA_TARDIA_MS = 300; // sesión que ya vio todo resuelto — sin re-esperar de más

const KEYFRAMES = `
@keyframes lbSorteoViaje {
  0%   { opacity: 1; transform: translate(0,0) rotate(0deg) scale(1); }
  55%  { transform: translate(var(--tx-mid), var(--ty-mid)) rotate(var(--rot-mid)) scale(1.08); }
  100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot-final)) scale(1); }
}
@keyframes lbSorteoPulso {
  0%   { r: 30; opacity: 0.9; }
  100% { r: 48; opacity: 0; }
}
.lb-sorteo-viajera {
  animation: lbSorteoViaje 0.62s cubic-bezier(.2,.8,.3,1) forwards;
  transform-box: fill-box;
  transform-origin: center;
}
`;

// DEVIACIÓN TÉCNICA DOCUMENTADA (piece H): la referencia hace el flip con
// un rotateY(180deg) 3D real + backface-visibility:hidden en dos caras
// superpuestas. Confirmado directo contra el propio archivo de referencia
// (abierto en Chromium vía Playwright, sin tocar nada): backface-
// visibility no se respeta en <g> de SVG en Chromium — 3D transforms
// sobre SVG no arman un contexto 3D real, así que las DOS caras quedan
// visibles superpuestas todo el tiempo, incluso en reposo. No es un bug
// de esta implementación: la referencia tiene el mismo problema (se
// puede reproducir abriendo direccion-sorteo-animado.html directo). En
// vez de calcar fielmente un efecto que no se ve bien en el motor real,
// se usa un flip 2D "achicar y cambiar de cara a la mitad" (scaleX 1→0,
// swap de contenido, 0→1) — misma duración total (0.5s) y el mismo
// cubic-bezier(.34,1.56,.64,1) de la referencia en ambas mitades. El
// resultado visual difiere del giro 3D de la referencia, pero es el que
// realmente se ve correctamente (una sola cara visible en todo momento).
function CartaAsientoSorteo({ pos, carta, flipped, clickable, onClick }) {
  const [cara, setCara] = useState(flipped ? "frente" : "dorso");
  const [escalaX, setEscalaX] = useState(1);
  const yaAnimado = useRef(flipped);

  useEffect(() => {
    if (!flipped || yaAnimado.current) return;
    yaAnimado.current = true;
    setEscalaX(0);
    const t = setTimeout(() => {
      setCara("frente");
      setEscalaX(1);
    }, 250);
    return () => clearTimeout(t);
  }, [flipped]);

  return (
    <g
      transform={`translate(${pos.x - CW / 2},${pos.y - CH / 2 + 6})`}
      style={{ cursor: clickable ? "pointer" : "default" }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? "Dar vuelta tu carta" : undefined}
    >
      <g style={{
        transformBox: "fill-box", transformOrigin: "center",
        transition: "transform 0.25s cubic-bezier(.34,1.56,.64,1)",
        transform: `scaleX(${escalaX})`,
      }}>
        {cara === "dorso" ? <CartaSVG bocaAbajo w={CW} h={CH} /> : <CartaSVG carta={carta} w={CW} h={CH} />}
      </g>
    </g>
  );
}

export function SorteoAnimado({ roomId, nJug, players, mySeat, sorteo, onCumplido }) {
  const SIZE = 500, CX = 250, CY = 250;
  const RX = nJug === 8 ? 200 : 190;
  const RY = nJug === 8 ? 180 : 170;

  const cartaPorSeat = {};
  for (const { seat, carta } of sorteo.cartas) cartaPorSeat[seat] = carta;
  const flippedRemoto = sorteo.flipped ?? {};

  // Late-mount (piece B/piece H, mismo patrón que sorteoCumplido): si al
  // montar YA estaban todos los asientos dados vuelta (sesión que
  // reconecta después de que todo el mundo ya terminó), no hay nada que
  // animar — mostrar el estado final de una y salir rápido, sin repetir
  // el viaje ni forzar una gracia larga que nadie necesita.
  const yaResueltoAlMontar = useRef(null);
  if (yaResueltoAlMontar.current === null) {
    yaResueltoAlMontar.current = Array.from({ length: nJug }, (_, s) => s).every((s) => !!flippedRemoto[s]);
  }

  const [misFlipLocal, setMisFlipLocal] = useState(false);
  const [llegadas, setLlegadas] = useState(() => (yaResueltoAlMontar.current ? new Set(Array.from({ length: nJug }, (_, s) => s)) : new Set()));
  const [viajando, setViajando] = useState(() => new Set());
  const [legendaVisible, setLegendaVisible] = useState(yaResueltoAlMontar.current);
  const cumplidoAvisado = useRef(false);

  const estaFlippeado = (seat) => (seat === mySeat ? (misFlipLocal || !!flippedRemoto[seat]) : !!flippedRemoto[seat]);
  const todosFlipeados = Array.from({ length: nJug }, (_, s) => s).every(estaFlippeado);

  // Programa el viaje+aterrizaje de cada asiento, una sola vez, salvo que
  // ya estuviera todo resuelto al montar (arriba).
  useEffect(() => {
    if (yaResueltoAlMontar.current) return;
    const timers = [];
    for (let seat = 0; seat < nJug; seat++) {
      const delay = seat * STAGGER_MS;
      timers.push(setTimeout(() => {
        setViajando((v) => new Set(v).add(seat));
        timers.push(setTimeout(() => {
          setLlegadas((l) => new Set(l).add(seat));
        }, VIAJE_MS));
      }, delay));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leyenda + aviso al padre: aparece recién cuando TODOS dieron vuelta su
  // carta (Realtime-sincronizado vía sorteo.flipped, salvo la propia que
  // usa el feedback optimista local). El padre decide qué pantalla mostrar
  // después (PantallaOnlineSala.jsx) — acá solo se avisa una vez.
  useEffect(() => {
    if (!todosFlipeados || cumplidoAvisado.current) return;
    const tLeyenda = setTimeout(() => setLegendaVisible(true), 200);
    const gracia = yaResueltoAlMontar.current ? GRACIA_TARDIA_MS : GRACIA_MS;
    const tCumplido = setTimeout(() => {
      cumplidoAvisado.current = true;
      onCumplido();
    }, gracia);
    return () => { clearTimeout(tLeyenda); clearTimeout(tCumplido); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosFlipeados]);

  // A diferencia de sortearRepartoInicial/repartirMano (que cualquier
  // sesión puede reintentar sola porque todas llaman a la misma RPC
  // ungated), marcar_flip_sorteo solo lo puede llamar el dueño del
  // asiento — sin una sesión redundante que reintente por mí, un fallo
  // silencioso acá deja a las OTRAS 3 esperando para siempre un flip que
  // esta sesión ya ve como hecho (misFlipLocal). Reintento acotado en vez
  // de un catch mudo de una sola vez.
  const onClickPropia = async () => {
    if (mySeat == null || !llegadas.has(mySeat) || estaFlippeado(mySeat)) return;
    setMisFlipLocal(true);
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await marcarFlipSorteo(roomId);
        return;
      } catch {
        if (intento < 3) await new Promise((r) => setTimeout(r, 1000 * intento));
      }
    }
  };

  const ganador = players.find((p) => p.seat === sorteo.ganador_seat);
  const nombreJugador = (seat) => players.find((p) => p.seat === seat)?.name ?? `#${seat}`;
  const colorEquipo = (seat) => (seat % 2 === 0 ? colors.team.local.accent : colors.team.visitante.accent);

  const hint = !todosFlipeados
    ? (estaFlippeado(mySeat)
        ? `Esperando a los demás… (${Array.from({ length: nJug }, (_, s) => s).filter(estaFlippeado).length}/${nJug})`
        : "Tocá tu carta cuando llegue a tu lugar para darla vuelta.")
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 16 }}>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 15, letterSpacing: 6, color: colors.text.secondary, textShadow: "0 0 8px rgba(140,160,240,0.5)" }}>SORTEO</div>
      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, letterSpacing: 2, color: "rgba(170,182,242,0.55)", marginTop: -8 }}>¿QUIÉN REPARTE PRIMERO?</div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxWidth: 500, overflow: "visible" }}>
        <defs><style>{KEYFRAMES}</style></defs>

        <ellipse cx={CX} cy={CY} rx={RX + 55} ry={RY + 50} fill="rgba(20,26,64,0.55)" stroke="#4a5aa8" strokeWidth={2} />

        {/* mazo central */}
        <rect x={CX - 22} y={CY - 31} width={44} height={62} rx={5} fill="#171f4a" stroke="#4a5aa8" strokeWidth={2}
          style={!yaResueltoAlMontar.current ? { animation: "lbSorteoPulso 0.5s ease-in-out infinite alternate" } : undefined} />

        {Array.from({ length: nJug }, (_, seat) => {
          const pos = posEnCirculo(seat, RX, RY, CX, CY, nJug);
          const esMia = seat === mySeat;
          const flipped = estaFlippeado(seat);
          const llegada = llegadas.has(seat);
          const esGanador = todosFlipeados && seat === sorteo.ganador_seat;

          const tx = pos.x - CX, ty = pos.y - CY;
          const rotSigno = seat % 2 === 0 ? 1 : -1;

          return (
            <g key={seat}>
              <rect x={pos.x - 46} y={pos.y - 52} width={92} height={96} rx={8}
                fill={esGanador ? "rgba(255,140,60,0.12)" : "rgba(10,14,38,0.6)"}
                stroke={esGanador ? "#ffab8a" : "rgba(120,140,220,0.25)"} strokeWidth={esGanador ? 2 : 1} />
              <text x={pos.x} y={pos.y - 58} textAnchor="middle" fontFamily={fonts.body} fontWeight={600} fontSize={11} fill={colorEquipo(seat)}>
                {nombreJugador(seat)}
              </text>

              {/* carta viajera: dos <g> separados a propósito (ver
                  comentario en la referencia) — el exterior fija la
                  posición de salida (mazo) con un atributo transform
                  estático, el interior lleva la animación CSS. Si fuera
                  el mismo <g>, la animación reemplazaría por completo el
                  atributo transform en vez de componerlo, y la carta
                  saldría desde (0,0) en vez del mazo. */}
              {viajando.has(seat) && !llegada && (
                <g transform={`translate(${CX - CW / 2},${CY - CH / 2})`}>
                  <g className="lb-sorteo-viajera" style={{
                    "--tx": `${tx}px`, "--ty": `${ty}px`,
                    "--tx-mid": `${tx * 0.6}px`, "--ty-mid": `${ty * 0.6 - 30}px`,
                    "--rot-mid": `${540 * rotSigno}deg`, "--rot-final": `${720 * rotSigno}deg`,
                  }}>
                    <CartaSVG bocaAbajo w={CW} h={CH} />
                  </g>
                </g>
              )}

              {/* carta asentada: ver CartaAsientoSorteo — flip 2D (no el
                  rotateY 3D real de la referencia, ver comentario ahí) */}
              {llegada && (
                <CartaAsientoSorteo
                  pos={pos} carta={cartaPorSeat[seat]} flipped={flipped}
                  clickable={esMia && !flipped} onClick={esMia ? onClickPropia : undefined}
                />
              )}

              {esMia && llegada && !flipped && (
                <circle cx={pos.x} cy={pos.y} r={30} fill="none" stroke="rgba(255,171,138,0.65)" strokeWidth={1.5}
                  style={{ animation: "lbSorteoPulso 1.4s ease-out infinite", pointerEvents: "none" }} />
              )}
            </g>
          );
        })}

        {/* leyenda ganador */}
        <g style={{ opacity: legendaVisible ? 1 : 0, transition: "opacity 0.5s" }}>
          <text x={CX} y={CY - 6} textAnchor="middle" fontFamily={fonts.display} fontWeight={700} fontStyle="italic" fontSize={9} letterSpacing={2} fill="rgba(170,182,242,0.6)">DA</text>
          <text x={CX} y={CY + 14} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontStyle="italic" fontSize={16} letterSpacing={1} fill={colorEquipo(sorteo.ganador_seat)}>
            {ganador?.name ?? "—"}
          </text>
        </g>
      </svg>

      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, letterSpacing: 1, color: "rgba(170,182,242,0.5)", textAlign: "center", minHeight: 18 }}>
        {hint}
      </div>
    </div>
  );
}
