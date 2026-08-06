import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layoutMesa } from "../engine/mesaOvalada";
import { CartaSVG } from "./cards/CartaSVG";
import { ReactionFace } from "./ReactionFace";
import { SenasIcon, SenasOverlay } from "./SenasUI";
import { marcarFlipSorteo, marcarArrancamosSorteo } from "../lib/game";
import { senasEfectivas } from "../lib/senas";
import { colors, fonts, ctaStyle } from "../theme";

// A diferencia de MesaCircular.jsx (que compite por alto limitado, ver
// useAspectFit.js), esta pantalla nunca estuvo acotada por alto — antes
// del rediseño solo tenía un maxWidth:640 fijo, el alto seguía sin límite
// (scroll de página si hacía falta). Medir SOLO el ancho (sin depender del
// alto del contenedor, que acá no está definido de antemano) evita la
// dependencia circular que si hace falta resolver en MesaCircular.jsx.
function useWidthFit(vbW, vbH) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: vbW, height: vbH });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth;
      if (!cw) return;
      setSize({ width: cw, height: (cw / vbW) * vbH });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vbW, vbH]);

  return { containerRef, size };
}

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
// todavía diferida), alcanza con un boolean on/off por asiento. Piece R:
// una vez que todos flipearon, ya no hay auto-avance por timer — las
// cartas quedan asentadas y cada asiento tiene que confirmar "ARRANCAMOS"
// (mismo patrón boolean-por-asiento, ahora en rooms.sorteo_inicial.
// arrancamos vía marcar_arrancamos_sorteo) antes de avisar al padre.
//
// Rediseño de mesa ovalada (follow-up): esta pantalla ahora comparte
// mesaOvalada.js con MesaCircular.jsx (misma pista+paño, mismos anclajes
// de asiento/carita) en vez de su propio layout circular con
// posEnCirculo — quedó pendiente en el primer pase del rediseño (la mesa
// real y el sorteo son pantallas separadas, se armó el sorteo aparte a
// propósito para no arriesgar la mesa real, pero el resultado fue que acá
// las caritas seguían tapadas por la carta encima — mismo bug de capas
// que ya se había arreglado en la mesa real, ver mesaOvalada.js — y el
// sentido de giro de los asientos también salía espejado respecto de la
// mesa real). Reusar el mismo módulo también arregla las dos cosas de
// una: mismo push-out cara/carta, mismo sentido horario con seat
// creciente.
//
// Duraciones/easing/rotación calcados de la referencia, no aproximados:
// viaje 0.62s cubic-bezier(.2,.8,.3,1), escala pico 1.08, giro 540/720deg
// (signo por seat%2 — ver nota en la referencia sobre por qué es paridad
// de asiento y no una regla geométrica de "lado de la mesa"), stagger
// 90ms entre asientos, flip 0.5s cubic-bezier(.34,1.56,.64,1).
const CW = 40, CH = 58;
const STAGGER_MS = 90;
const VIAJE_MS = 620;
const GRACIA_TARDIA_MS = 300; // sesión que reconecta con todo ya confirmado — sin esto, onCumplido() dispara en el mismo tick del mount y la pantalla de sorteo nunca llega a pintarse

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
function CartaAsientoSorteo({ pos, carta, flipped, clickable, onClick, w, h }) {
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
      transform={`translate(${pos.x - w / 2},${pos.y - h / 2 + 6})`}
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
        {cara === "dorso" ? <CartaSVG bocaAbajo w={w} h={h} /> : <CartaSVG carta={carta} w={w} h={h} />}
      </g>
    </g>
  );
}

export function SorteoAnimado({ roomId, nJug, players, mySeat, sorteo, onCumplido, senasMapping, gestosPorAsiento, enviarGesto }) {
  const mesa = layoutMesa(nJug, mySeat);
  const { seats, outerPath, innerPath, cx: CX, cy: CY, vbMinX, vbMinY, vbW, vbH } = mesa;
  const { containerRef, size } = useWidthFit(vbW, vbH);

  // Feature #1 (batch post-mano_seat-split): señas usables durante el
  // sorteo igual que durante la partida — gestosPorAsiento/enviarGesto
  // llegan del MISMO canal de broadcast que PantallaPartidaOnline usa
  // (levantado en PantallaOnlineSala.jsx, el padre común), sin cableado
  // propio acá. senasAbierto es puramente local (nunca se ve que la abrís,
  // mismo criterio de privacidad que en la mesa real).
  const [senasAbierto, setSenasAbierto] = useState(false);
  const misSenas = senasEfectivas(senasMapping);

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

  // Piece R: una vez que todos dieron vuelta su carta, las cartas quedan
  // asentadas en la mesa (nada se limpia/transiciona sola) y hace falta
  // una confirmación explícita de cada asiento — mismo jsonb boolean-por-
  // asiento que sorteo.flipped, ahora en sorteo.arrancamos (marcar_
  // arrancamos_sorteo, piece R). El padre (PantallaOnlineSala.jsx) usa
  // este mismo campo para recién ahí disparar repartirMano() — onCumplido
  // acá solo mueve la vista de ESTA sesión, no reparte nada.
  const [misArranqueLocal, setMisArranqueLocal] = useState(false);
  const arrancamosRemoto = sorteo.arrancamos ?? {};
  const estaArrancado = (seat) => (seat === mySeat ? (misArranqueLocal || !!arrancamosRemoto[seat]) : !!arrancamosRemoto[seat]);
  const todosArrancados = todosFlipeados && Array.from({ length: nJug }, (_, s) => s).every(estaArrancado);

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

  // Leyenda: aparece apenas TODOS dieron vuelta su carta (Realtime-
  // sincronizado vía sorteo.flipped, salvo la propia que usa el feedback
  // optimista local) — se queda arriba de las cartas asentadas mientras
  // se espera la confirmación de ARRANCAMOS, ya no dispara nada por su
  // cuenta.
  useEffect(() => {
    if (!todosFlipeados) return;
    const tLeyenda = setTimeout(() => setLegendaVisible(true), 200);
    return () => clearTimeout(tLeyenda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosFlipeados]);

  // Aviso al padre: recién cuando los nJug asientos confirmaron ARRANCAMOS
  // (Realtime-sincronizado vía sorteo.arrancamos, salvo la propia que usa
  // el feedback optimista local, mismo patrón que flipped). El padre
  // decide qué pantalla mostrar después (PantallaOnlineSala.jsx) — acá
  // solo se avisa una vez. Si al montar ya estaba todo confirmado (sesión
  // que reconecta tarde), todosArrancados ya nace en true en el primer
  // render — sin una gracia mínima acá, este efecto dispararía onCumplido()
  // en el mismo tick del mount y la pantalla de sorteo nunca llegaría a
  // pintarse en pantalla; con un click real de por medio (caso normal) la
  // gracia es 0 porque ya hubo tiempo de sobra viendo la leyenda mientras
  // se esperaba la confirmación de los demás.
  useEffect(() => {
    if (!todosArrancados || cumplidoAvisado.current) return;
    const gracia = yaResueltoAlMontar.current ? GRACIA_TARDIA_MS : 0;
    const t = setTimeout(() => {
      cumplidoAvisado.current = true;
      onCumplido();
    }, gracia);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosArrancados]);

  // A diferencia de sortearRepartoInicial/repartirMano (que cualquier
  // sesión puede reintentar sola porque todas llaman a la misma RPC
  // ungated), marcar_flip_sorteo/marcar_arrancamos_sorteo solo los puede
  // llamar el dueño del asiento — sin una sesión redundante que reintente
  // por mí, un fallo silencioso acá deja a las OTRAS esperando para
  // siempre una confirmación que esta sesión ya ve como hecha. Reintento
  // acotado en vez de un catch mudo de una sola vez, mismo patrón en las
  // dos.
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

  const onClickArrancamos = async () => {
    if (mySeat == null || !todosFlipeados || estaArrancado(mySeat)) return;
    setMisArranqueLocal(true);
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await marcarArrancamosSorteo(roomId);
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
    : (estaArrancado(mySeat)
        ? `Esperando a los demás… (${Array.from({ length: nJug }, (_, s) => s).filter(estaArrancado).length}/${nJug})`
        : "");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 16 }}>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 15, letterSpacing: 6, color: colors.text.secondary, textShadow: "0 0 8px rgba(140,160,240,0.5)" }}>SORTEO</div>
      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, letterSpacing: 2, color: "rgba(170,182,242,0.55)", marginTop: -8 }}>¿QUIÉN REPARTE PRIMERO?</div>

      {/* Mismo modelo de autodimensionado que MesaCircular.jsx — la mesa
          ovalada compartida ya no es un cuadrado fijo (500x500), así que
          el contenedor tiene que respetar SU proporción real (mesa.vbW/
          vbH) en vez de forzar un viewBox cuadrado sobre una forma que no
          lo es. Tamaño medido en JS (useAspectFit), no con CSS puro — ver
          el comentario largo en useAspectFit.js sobre por qué. maxWidth:
          640 en el contenedor (no en el <svg>) es el mismo tope que tenía
          esta pantalla antes del rediseño — el sorteo se queda a una
          escala más modesta que "la habitación" real (que ahora puede
          llegar a 900px, ver MESA_PANEL_MAX_W en PantallaPartidaOnline.jsx),
          a propósito: es una pantalla de tránsito, no la mesa donde se
          juega la mano. */}
      <div ref={containerRef} style={{ position: "relative", width: "100%", maxWidth: 640 }}>
      <div style={{ position: "relative", width: size.width, height: size.height }}>
      <svg viewBox={mesa.viewBox} width={size.width} height={size.height} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <style>{KEYFRAMES}</style>
          {/* Mismo filtro que MesaCircular.jsx — SenasIcon (SenasUI.jsx) lo
              referencia como "url(#glow)" cuando está abierto, y este es
              un <svg> distinto (no hereda los <defs> de la mesa real). */}
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Misma mesa ovalada (madera+paño) que MesaCircular.jsx — antes
            de este rediseño el sorteo tenía su propio óvalo genérico
            gris-azulado, con cada asiento en un recuadro propio; ahora
            comparte la pista real, sin recuadro por asiento (el paño
            hace de fondo común, igual que en la mesa real). */}
        <path d={outerPath} fill="#3c2a1c" stroke="#6b4a2a" strokeWidth={6}/>
        <path d={innerPath} fill="#1f4a34" stroke="#3a6b4d" strokeWidth={2}/>

        {/* mazo central */}
        <rect x={CX - 22} y={CY - 31} width={44} height={62} rx={5} fill="#171f4a" stroke="#4a5aa8" strokeWidth={2}
          style={!yaResueltoAlMontar.current ? { animation: "lbSorteoPulso 0.5s ease-in-out infinite alternate" } : undefined} />

        {seats.map((seat) => {
          const s = seat.idx;
          const esMia = s === mySeat;
          const flipped = estaFlippeado(s);
          const llegada = llegadas.has(s);
          const esGanador = todosFlipeados && s === sorteo.ganador_seat;

          const tx = seat.ax - CX, ty = seat.ay - CY;
          const rotSigno = s % 2 === 0 ? 1 : -1;
          const escala = seat.scale;

          return (
            <g key={s}>
              {/* Rediseño: anillo distintivo del asiento PROPIO — antes la
                  única señal era la carta "un poco más grande" (mismo
                  factor de escala que ya traía la carita/carta), lo que en
                  un monitor real no se notaba lo suficiente como primer
                  momento de orientación en la mesa. Un anillo de un color
                  que no se usa para nada más en esta pantalla (el lima de
                  "turno" — acá no hay concepto de turno todavía, así que
                  no compite con ningún otro significado) + la etiqueta
                  "VOS" (mismo texto/criterio que la mesa real) — visibles
                  desde el arranque, no solo cuando llega la carta. */}
              {esMia && (
                <circle cx={seat.faceCx} cy={seat.faceCy} r={seat.faceR * 1.4} fill="none" stroke={colors.turn.color} strokeWidth={2.5} opacity={0.75} filter="url(#glow)"/>
              )}
              {esGanador && (
                <circle cx={seat.faceCx} cy={seat.faceCy} r={seat.faceR * 1.65} fill="none" stroke={colors.cta.border} strokeWidth={2} opacity={0.85} filter="url(#glow)"/>
              )}

              <text x={seat.nameX} y={seat.nameY} textAnchor="middle" fontFamily={fonts.body} fontWeight={600} fontSize={11 * escala} fill={colorEquipo(s)}>
                {nombreJugador(s)}{esMia ? " · VOS" : ""}
              </text>

              {/* Cara de reacción/señas — anclada más afuera que la carta
                  (seat.faceX/Y, ver mesaOvalada.js), nunca rota: mismo
                  arreglo de capas que ya tenía la mesa real (antes acá la
                  carta se dibujaba en el mismo punto que la cara y la
                  tapaba). Jugadores sin apariencia guardada todavía (no
                  pasaron por el customizador) caen en los defaults de
                  ReactionFace. */}
              <ReactionFace gestureKey={gestosPorAsiento?.[s] || "neutral"} appearance={players.find((p) => p.seat === s)?.appearance}
                size={seat.faceSize} x={seat.faceX} y={seat.faceY}/>

              {/* carta viajera: dos <g> separados a propósito (ver
                  comentario en la referencia) — el exterior fija la
                  posición de salida (mazo) con un atributo transform
                  estático, el interior lleva la animación CSS. Si fuera
                  el mismo <g>, la animación reemplazaría por completo el
                  atributo transform en vez de componerlo, y la carta
                  saldría desde (0,0) en vez del mazo. */}
              {viajando.has(s) && !llegada && (
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
                  rotateY 3D real de la referencia, ver comentario ahí) —
                  anclada en seat.ax/ay, igual que el abanico de la mesa
                  real. */}
              {llegada && (
                <CartaAsientoSorteo
                  pos={{ x: seat.ax, y: seat.ay }} carta={cartaPorSeat[s]} flipped={flipped}
                  clickable={esMia && !flipped} onClick={esMia ? onClickPropia : undefined}
                  w={CW * escala} h={CH * escala}
                />
              )}

              {esMia && llegada && !flipped && (
                <circle cx={seat.ax} cy={seat.ay} r={30 * escala} fill="none" stroke="rgba(255,171,138,0.65)" strokeWidth={1.5}
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

        {enviarGesto && (
          <SenasIcon x={vbMinX + vbW - 30} y={vbMinY + 30} abierta={senasAbierto} onToggle={() => setSenasAbierto((v) => !v)}/>
        )}
      </svg>
      </div>
      </div>

      {senasAbierto && (
        <SenasOverlay senas={misSenas} onEnviar={enviarGesto} onCerrar={() => setSenasAbierto(false)}/>
      )}

      {todosFlipeados && (
        <div style={{ width: "100%", maxWidth: 260 }}>
          <button onClick={onClickArrancamos} disabled={estaArrancado(mySeat)} style={ctaStyle({ disabled: estaArrancado(mySeat) })}>
            {estaArrancado(mySeat) ? "✓ ARRANCAMOS" : "ARRANCAMOS"}
          </button>
        </div>
      )}

      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, letterSpacing: 1, color: "rgba(170,182,242,0.5)", textAlign: "center", minHeight: 18 }}>
        {hint}
      </div>
    </div>
  );
}
