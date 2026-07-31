import { posEnCirculo } from "../engine/structures";
import { CartaSVG } from "./cards/CartaSVG";
import { colors, fonts } from "../theme";

// ══════════════════════════════════════════════
// SVG COMPONENTES
// ══════════════════════════════════════════════
// Puntos de bases ganadas — reemplaza las estrellas doradas: totalBases
// puntos por jugador, rellenos (color de equipo) las ya ganadas, huecos
// las que faltan. A diferencia de EstrellasPedido (pedidas/hechas puede
// diferir por jugador), acá todos comparten el mismo totalBases de la
// mano.
function PuntosBasesSVG({ ganadas, total, cx, y, color }) {
  if (!total) return null;
  const gap = 9, r = 3;
  const startX = cx - (total * gap - (gap - r * 2)) / 2;
  return (
    <>
      {Array.from({ length: total }).map((_, i) => (
        <circle key={i} cx={startX + i * gap + r} cy={y} r={r}
          fill={i < ganadas ? color : "none"}
          stroke={color} strokeWidth={1} opacity={i < ganadas ? 1 : 0.4}/>
      ))}
    </>
  );
}

function CartasManoSVG({ mano, cx, cy, seleccionable, onTirar, expandido, onToggleExpandir, cartaLevantada, onLevantarCarta, bocaAbajo, cw, ch }) {
  if (!mano.length) return null;
  // Modo expandido: gap fijo para ver bien las cartas
  // Modo contraído: gap mínimo
  const gap = expandido ? Math.min(cw*1.15, (cw*3.9)/Math.max(mano.length,1)) : Math.min(cw*0.64, (cw*2.5)/Math.max(mano.length,1));
  const totalW = cw + gap*(mano.length-1);
  const startX = cx - totalW/2;

  return (
    <>
      {/* Botón expandir/contraer — solo si hay más de 1 carta */}
      {onToggleExpandir && mano.length > 1 && (
        <g onClick={(e)=>{e.stopPropagation();onToggleExpandir();}} style={{cursor:"pointer"}}>
          <rect x={cx-14} y={cy+ch/2+4} width={28} height={12} rx={3}
            fill="rgba(0,0,0,0.5)" stroke="rgba(140,160,240,0.4)" strokeWidth={0.8}/>
          <text x={cx} y={cy+ch/2+13} textAnchor="middle" fontSize={8} fill={colors.text.secondary} fontFamily={fonts.body}>
            {expandido?"▲ cerrar":"▼ ver"}
          </text>
        </g>
      )}
      {mano.map((carta,i)=>{
        const x = startX + i*gap;
        const esLevantada = cartaLevantada === i;
        // En modo contraído: carta levantada sube ch*0.5
        const yOffset = (!expandido && esLevantada) ? -ch*0.5 : 0;
        const y = cy - ch/2 + yOffset;

        const handleClick = (e) => {
          e.stopPropagation();
          if (!seleccionable) return;
          if (expandido || mano.length === 1) {
            // Modo expandido o carta única: un click tira directamente
            onTirar(i);
          } else {
            // Modo contraído: primer click levanta, segundo click tira
            if (esLevantada) {
              onTirar(i);
            } else {
              onLevantarCarta(i);
            }
          }
        };

        return (
          <g key={carta.uid} style={{cursor:seleccionable?"pointer":"default"}} onClick={handleClick}>
            {seleccionable && (
              <rect x={x-2} y={y-2} width={cw+4} height={ch+4} rx={4}
                fill={esLevantada?"rgba(255,130,80,0.22)":"rgba(255,130,80,0.08)"}
                stroke={esLevantada?colors.cta.border:"rgba(255,130,80,0.35)"} strokeWidth={esLevantada?1.5:1}/>
            )}
            <g transform={`translate(${x},${y})`}
               style={{transition:"transform 0.15s"}}>
              <CartaSVG carta={carta} w={cw} h={ch} bocaAbajo={bocaAbajo}/>
            </g>
          </g>
        );
      })}
    </>
  );
}

// Ícono de "libreta" (piece F, batch overnight post-5r) — togglea el
// overlay del Tablero (historial de manos). Siempre entre los dos
// capitanes: choose_team garantiza que el capitán de LOCAL es SIEMPRE
// seat 0 y el de VISITANTE SIEMPRE seat 1 (el primero en elegir cada
// equipo), así que están siempre en asientos adyacentes — el ícono se
// planta en el punto medio de esas dos posiciones (siempre a escala 1,
// sin importar si alguno de los dos es mySeat, para que no salte de
// lugar según quién mire). SVG dibujado a mano (tapa + anillado +
// líneas), no un ícono importado, para no salirse de la estética chrome.
function LibretaIcon({ x, y, abierta, onToggle }) {
  const w = 22, h = 26;
  const activo = colors.cta.border, inactivo = colors.panel.border;
  return (
    <g transform={`translate(${x - w / 2},${y - h / 2})`} style={{ cursor: "pointer" }}
       role="button" aria-label={abierta ? "Cerrar libreta" : "Ver libreta"}
       onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <rect x={0} y={0} width={w} height={h} rx={3}
        fill={abierta ? "rgba(255,130,80,0.18)" : "rgba(10,14,38,0.85)"}
        stroke={abierta ? activo : inactivo} strokeWidth={abierta ? 1.6 : 1.2}
        filter={abierta ? "url(#glow)" : undefined}/>
      {/* anillado */}
      {[0.22, 0.5, 0.78].map((f) => (
        <circle key={f} cx={3} cy={h * f} r={1.3} fill="none" stroke={abierta ? activo : "rgba(200,210,255,0.5)"} strokeWidth={1}/>
      ))}
      {/* líneas de texto */}
      {[0.35, 0.55, 0.75].map((f) => (
        <line key={f} x1={7} y1={h * f} x2={w - 3} y2={h * f} stroke={abierta ? activo : "rgba(200,210,255,0.45)"} strokeWidth={1}/>
      ))}
    </g>
  );
}

// Ícono de "reloj" (piece O, batch overnight post-5r) — mismo patrón de
// click-to-expand que LibretaIcon, plantado justo al lado (mismo eje Y,
// offset en X) para que ambos lean como un solo grupo de íconos "info
// secundaria" entre los capitanes. Togglea el overlay con DisplayReloj
// (ver RelojOverlay en PantallaPartidaOnline.jsx) — a diferencia de la
// libreta, este ícono solo se monta si la sala tiene reloj configurado
// (hayReloj), para no mostrar un botón que abre un panel vacío.
function ClockIcon({ x, y, abierta, onToggle }) {
  const r = 12;
  const activo = colors.cta.border, inactivo = colors.panel.border;
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }}
       role="button" aria-label={abierta ? "Cerrar reloj" : "Ver reloj"}
       onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <circle cx={0} cy={0} r={r}
        fill={abierta ? "rgba(255,130,80,0.18)" : "rgba(10,14,38,0.85)"}
        stroke={abierta ? activo : inactivo} strokeWidth={abierta ? 1.6 : 1.2}
        filter={abierta ? "url(#glow)" : undefined}/>
      <line x1={0} y1={0} x2={0} y2={-r * 0.55} stroke={abierta ? activo : "rgba(200,210,255,0.6)"} strokeWidth={1.4} strokeLinecap="round"/>
      <line x1={0} y1={0} x2={r * 0.4} y2={r * 0.15} stroke={abierta ? activo : "rgba(200,210,255,0.6)"} strokeWidth={1.4} strokeLinecap="round"/>
    </g>
  );
}

// "Llevar base" (piece G, batch overnight post-5r — renombrado y agrandado
// 2x en piece W, mismo batch) — antes vivía como <Btn> HTML debajo de la
// mesa, en PantallaPartidaOnline.jsx; ahora se planta en la esquina
// inferior derecha de "la habitación": el canvas CUADRADO de este SVG
// (SIZE×SIZE) es más grande que la elipse redonda de la mesa que contiene
// (outerRX/outerRY), así que las esquinas quedan con espacio de sobra sin
// usar — ahí es "la habitación", fuera del círculo. Mismo verde que el
// <Btn verde> que reemplaza (colors.positive, ver #positivoG en <defs>).
// Mismo componente cubre las dos audiencias: quien ganó la base ve el
// botón real, el resto ve el mismo cartel pero como texto de espera con
// el nombre de quien tiene que confirmar. Piece W: posición/gating sin
// cambios (mismo anclaje x,y en la esquina inferior derecha) — solo
// tamaño (w/h y todo lo de adentro, 2x el original 118x30) y label.
function SiguienteBaseHabitacion({ x, y, esGanador, nombreGanador, enviando, onConfirmar }) {
  if (esGanador) {
    const w = 236, h = 60;
    return (
      <g transform={`translate(${x - w},${y - h})`} style={{ cursor: enviando ? "default" : "pointer" }}
         role="button" aria-label={enviando ? "Confirmando llevar base" : "Llevar base"}
         onClick={(e) => { e.stopPropagation(); if (!enviando) onConfirmar(); }}>
        <rect x={0} y={0} width={w} height={h} rx={999}
          fill={enviando ? "rgba(30,40,80,0.6)" : "url(#positivoG)"}
          stroke={enviando ? colors.panel.border : "#7ef0ae"} strokeWidth={2.8}/>
        <text x={w / 2} y={h / 2 + 8} textAnchor="middle" fill={colors.text.primary} fontSize={21} fontFamily={fonts.display} fontWeight={800} fontStyle="italic" letterSpacing={1}>
          {enviando ? "CONFIRMANDO…" : "LLEVAR BASE →"}
        </text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`} textAnchor="end">
      <text y={-16} fill="rgba(200,210,255,0.4)" fontSize={8.5} fontFamily={fonts.body} fontStyle="italic">Esperando a que</text>
      <text y={-4} fill="rgba(220,230,255,0.6)" fontSize={9.5} fontFamily={fonts.body} fontWeight={700}>{nombreGanador} confirme…</text>
    </g>
  );
}

// Config geométrica por cantidad de jugadores. RX/RY (radio del anillo de
// asientos) se mantienen igual que antes del reskin — no es parte de este
// pase, solo el tamaño de la mesa central, el anillo de cartas jugadas y
// el canvas (que ahora necesita más margen para el asiento propio
// agrandado, ver GEOM.pushOwn). direccion-mesa-8p.html se trató aparte
// (no un 6p escalado): mesa/anillo de cartas propios, no reusa los de 6p.
const GEOM = {
  8: {
    RX: 200, RY: 185,
    canvasSize: 680, cx: 340, cy: 340,
    outerRX: 290, outerRY: 270,
    mesaRX: 165, mesaRY: 145,
    cartaMesaRX: 129, cartaMesaRY: 106,
    boxW: 108, boxH: 96,
  },
  default: {
    RX: 220, RY: 200,
    canvasSize: 740, cx: 370, cy: 370,
    outerRX: 310, outerRY: 285,
    mesaRX: 150, mesaRY: 112,
    cartaMesaRX: 120, cartaMesaRY: 98,
    boxW: 112, boxH: 98,
  },
};
// Cuánto más lejos del centro se ancla el asiento propio (agrandado) — el
// resto de los asientos usa RX/RY tal cual.
const PUSH_OWN = 1.22;
// Cartas de la mesa y de la mano: 10% más grandes que el tamaño previo al
// reskin (34x50 mesa, 28x40 mano). El asiento propio (contenedor Y mano)
// además se escala 1.5x contra el resto de los asientos — piece K (batch
// overnight post-5r) sube esto desde 1.4x, reemplazando el factor viejo
// en vez de apilar un 50% adicional sobre él.
const CARTA_MESA = { w: 37, h: 55 };
const CARTA_MANO = { w: 31, h: 44 };
const MYSEAT_SCALE = 1.5;

// Piece Q (batch overnight post-5r): keyframe del viaje de reparto,
// calcado de direccion-reparto-mano-animado.html (0.36s, pico de escala
// 1.05, giro 380/520deg según paridad de asiento — mismo criterio que el
// sorteo, ver SorteoAnimado.jsx). Separado del keyframe del sorteo (otra
// duración/escala/giro) en vez de reusarlo con variables — son dos
// mockups distintos con valores propios, no una sola animación
// parametrizada.
const REPARTO_KEYFRAMES = `
@keyframes lbRepartoViaje {
  0%   { opacity: 1; transform: translate(0,0) rotate(0deg) scale(1); }
  55%  { transform: translate(var(--tx-mid), var(--ty-mid)) rotate(var(--rot-mid)) scale(1.05); }
  100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot-final)) scale(1); }
}
.lb-reparto-viajera {
  animation: lbRepartoViaje 0.36s cubic-bezier(.2,.8,.3,1) forwards;
  transform-box: fill-box;
  transform-origin: center;
}
`;

// Carta viajera del reparto — misma estructura de doble <g> que el
// sorteo (posición estática afuera, animación CSS adentro) y el mismo
// motivo (una animación CSS sobre `transform` reemplaza cualquier
// atributo transform estático en el mismo elemento en vez de componerlo).
// Siempre boca abajo: ninguna sesión puede ver la cara de una carta
// ajena en vuelo (esa mano ni siquiera llega al cliente, ver useSala.js),
// y la propia tampoco se revela hasta que "aterriza" en el abanico —
// igual que repartir cartas de verdad, no se ven boca arriba en el aire.
function CartaViajeraReparto({ destino, origen }) {
  const tx = destino.x - origen.x, ty = destino.y - origen.y;
  const rotSigno = destino.seat % 2 === 0 ? 1 : -1;
  return (
    <g transform={`translate(${origen.x - CARTA_MANO.w / 2},${origen.y - CARTA_MANO.h / 2})`}>
      <g className="lb-reparto-viajera" style={{
        "--tx": `${tx}px`, "--ty": `${ty}px`,
        "--tx-mid": `${tx * 0.55}px`, "--ty-mid": `${ty * 0.55 - 24}px`,
        "--rot-mid": `${380 * rotSigno}deg`, "--rot-final": `${520 * rotSigno}deg`,
      }}>
        <CartaSVG bocaAbajo w={CARTA_MANO.w} h={CARTA_MANO.h} />
      </g>
    </g>
  );
}

// Fracción del semieje de la elipse "mesa" (mesaRX/mesaRY) que ocupa el
// recuadro del centro durante 'bidding' — piece Y (batch overnight post-5r,
// reemplaza el recuadro fijo 280x300 de piece S, que sobresalía de la
// elipse interna y tapaba la mesa). Ancho/alto en fracciones DISTINTAS (no
// un único k): la elipse mesa es bastante más ancha que alta (mesaRX>mesaRY
// en las dos variantes de GEOM), así que un rectángulo con las esquinas
// estrictamente adentro (fórmula (a/mesaRX)²+(b/mesaRY)²≤1) fuerza un alto
// muy chico para caber. El panel ya no dibuja su propio fondo/borde (piece
// Y): lo único que se ve son los controles (chips de número, texto)
// centrados adentro, así que un poco de margen matemático de sobra en las
// esquinas del rectángulo invisible no se nota — verificado con captura
// contra el óvalo real, no asumido.
const CENTRO_BIDDING_WK = 0.78;
const CENTRO_BIDDING_HK = 0.85;

// `mySeat` es para la mesa online (pieza 5e): en hotseat es undefined y el
// tablero se comporta como siempre (cualquier mano visible es jugable en su
// turno, porque las cuatro manos son reales — un solo dispositivo compartido
// no tiene nada que ocultar). Online, la única mano real es la propia; el
// resto llega ya boca abajo desde el caller (ver PantallaPartidaOnline.jsx),
// y acá alcanza con no dejar tirar cartas ajenas aunque sea su turno.
export function MesaCircular({ jugadores, cartasMesa, turnoIdx, pieIdx, manoIdx, onTirar, fase, ganadorBase, pedidos, capLocal, capVisitante, expandidos, onToggleExpandir, cartasLevantadas, onLevantarCarta, mySeat, totalBases, tableroAbierto, onToggleTablero, onSiguienteBase, enviandoResolucion, hayReloj, relojAbierto, onToggleReloj, cartasViajandoReparto, contenidoBidding, resultadoMano }) {
  const nJug = jugadores.length || 6;
  const G = GEOM[nJug] || GEOM.default;
  const { RX, RY, canvasSize: SIZE, cx: CX, cy: CY, outerRX, outerRY, mesaRX, mesaRY, cartaMesaRX, cartaMesaRY, boxW, boxH } = G;
  // Punto medio entre los dos capitanes (siempre seat 0 y seat 1) a
  // escala 1 — ver comentario de LibretaIcon.
  const posCapLocal = posEnCirculo(0, RX, RY, CX, CY, nJug);
  const posCapVisitante = posEnCirculo(1, RX, RY, CX, CY, nJug);
  const libretaPos = { x: (posCapLocal.x + posCapVisitante.x) / 2, y: (posCapLocal.y + posCapVisitante.y) / 2 };
  const clockPos = { x: libretaPos.x + 28, y: libretaPos.y };

  const svg = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{width:"100%",userSelect:"none"}}>
      <defs>
        <radialGradient id="mesaFondo" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#24306e"/><stop offset="55%" stopColor="#0d1230"/><stop offset="100%" stopColor="#060814"/>
        </radialGradient>
        <linearGradient id="panelFondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171f4a"/><stop offset="100%" stopColor="#0a0e26"/>
        </linearGradient>
        <linearGradient id="localG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a6ac0"/><stop offset="45%" stopColor="#253a80"/><stop offset="100%" stopColor="#16234f"/>
        </linearGradient>
        <linearGradient id="visitanteG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8703f"/><stop offset="45%" stopColor="#8a3c1c"/><stop offset="100%" stopColor="#4f1f0e"/>
        </linearGradient>
        <linearGradient id="positivoG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ae08a"/><stop offset="55%" stopColor="#1e9c5a"/><stop offset="100%" stopColor="#0e5c34"/>
        </linearGradient>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glowTurno" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <style>{REPARTO_KEYFRAMES}</style>
      </defs>

      <ellipse cx={CX} cy={CY} rx={outerRX} ry={outerRY} fill="url(#mesaFondo)" stroke={colors.panel.border} strokeWidth={2}/>
      <ellipse cx={CX} cy={CY} rx={outerRX-4} ry={outerRY-4} fill="none" stroke="rgba(140,160,240,0.15)" strokeWidth={1}/>

      {jugadores.map((_,idx)=>{
        const pos=posEnCirculo(idx,RX,RY,CX,CY,nJug);
        return <line key={`ln-${idx}`} x1={CX} y1={CY} x2={pos.x} y2={pos.y} stroke="rgba(140,160,240,0.06)" strokeWidth={1} strokeDasharray="3,7"/>;
      })}
      <ellipse cx={CX} cy={CY} rx={mesaRX} ry={mesaRY} fill="url(#panelFondo)" stroke={colors.panel.border} strokeWidth={2}/>
      <ellipse cx={CX} cy={CY} rx={mesaRX-5} ry={mesaRY-5} fill="none" stroke="rgba(140,160,240,0.12)" strokeWidth={1}/>

      {cartasMesa.map((item,i)=>{
        const p=posEnCirculo(item.jugadorIdx,cartaMesaRX,cartaMesaRY,CX,CY,nJug);
        return <g key={`cm-${i}`} transform={`translate(${p.x-CARTA_MESA.w/2},${p.y-CARTA_MESA.h/2})`}><CartaSVG carta={item.carta} w={CARTA_MESA.w} h={CARTA_MESA.h}/></g>;
      })}

      {ganadorBase!==null ? (
        <g>
          <text x={CX} y={CY-2} textAnchor="middle" fill="rgba(170,182,242,0.55)" fontSize={9} letterSpacing={2} fontFamily={fonts.display} fontWeight={800} fontStyle="italic">LA HIZO</text>
          <text x={CX} y={CY+10} textAnchor="middle" fill={colors.team[ganadorBase%2===0?"local":"visitante"].readyBorder} fontSize={15} fontFamily={fonts.display} fontWeight={800} fontStyle="italic" filter="url(#glow)">{jugadores[ganadorBase]?.nombre}</text>
        </g>
      ) : null}

      {/* Piece DD: anuncio del resultado de LA MANO (no de la base) en el
          centro de la mesa cuando cierra — mismo tratamiento tipográfico/
          de color por equipo que la pantalla de "FIN DE LA PARTIDA"
          (colors.team.*.accent vía resultadoMano.color, itálica bold
          fonts.display), para que se lean como screens hermanas en vez de
          diseños sueltos. Se apila debajo de "LA HIZO" (que sigue
          mostrando quién ganó la ÚLTIMA base, sin cambios) — dos datos
          distintos, no se reemplazan entre sí. */}
      {resultadoMano ? (
        <g>
          <text x={CX} y={CY+34} textAnchor="middle" fill={resultadoMano.color} fontSize={17} fontFamily={fonts.display} fontWeight={800} fontStyle="italic" letterSpacing={0.5} filter="url(#glow)">{resultadoMano.texto}</text>
          {resultadoMano.nombres.length>0 && (
            <text x={CX} y={CY+50} textAnchor="middle" fill="rgba(220,230,255,0.7)" fontSize={10} fontFamily={fonts.body} fontWeight={600}>{resultadoMano.nombres.join(" · ")}</text>
          )}
        </g>
      ) : null}

      {jugadores.map((j,idx)=>{
        const esMiAsiento = mySeat===idx;
        const push = esMiAsiento ? PUSH_OWN : 1;
        const pos=posEnCirculo(idx,RX*push,RY*push,CX,CY,nJug);
        const esTurno=idx===turnoIdx&&fase==="jugar";
        const puedeElegir = mySeat==null ? esTurno : (esTurno && idx===mySeat);
        const esPie=idx===pieIdx, esMano=idx===manoIdx;
        // idx%2 en vez de j.eq: MesaCircular solo se monta una vez arrancó
        // la partida, momento en el que la invariante seat%2==team ya está
        // garantizada server-side (ver choose_team_rpc.sql) — idx acá ES
        // el seat.
        const equipo = idx%2===0 ? "local" : "visitante";
        const t = colors.team[equipo];
        const escala = esMiAsiento ? MYSEAT_SCALE : 1;
        const bw=boxW*escala, bh=boxH*escala, bx=pos.x-bw/2, by=pos.y-bh/2;
        const pedido=pedidos?.[idx%2===0?0:1];
        // Dos señales distintas y no intercambiables: el borde neón marca
        // de QUIÉN es el turno (universal, no depende del equipo); el
        // tamaño +40% (arriba, `escala`) marca CUÁL asiento es el propio,
        // de forma permanente incluso cuando el turno neón está activo.
        const borderColor = esTurno ? colors.turn.color : (esMiAsiento ? t.readyBorder : t.border);
        const borderWidth = esTurno ? 3 : (esMiAsiento ? 2.5 : 1.5);
        const filtro = esTurno ? "url(#glowTurno)" : undefined;
        const cw = CARTA_MANO.w * escala, ch = CARTA_MANO.h * escala;
        return (
          <g key={`jug-${idx}`}>
            <g filter={filtro}>
              <rect x={bx} y={by} width={bw} height={bh} rx={16}
                fill={`url(#${equipo==="local"?"localG":"visitanteG"})`}
                stroke={borderColor} strokeWidth={borderWidth}/>
            </g>
            <text x={pos.x} y={by+14*escala} textAnchor="middle" fill={colors.text.primary} fontSize={12*escala} fontFamily={fonts.display} fontWeight={800} fontStyle="italic">
              {j.nombre}{(idx===capLocal||idx===capVisitante)?" ★CAP":""}
            </text>
            <text x={pos.x} y={by+25*escala} textAnchor="middle" fill={esTurno?colors.turn.color:"rgba(220,230,255,0.65)"} fontSize={7.5*escala} letterSpacing={1} fontFamily={esTurno?fonts.display:fonts.body} fontWeight={esTurno?800:600} fontStyle={esTurno?"italic":"normal"}>
              {[esPie&&"PIE",esMano&&"MANO",esTurno&&"▶ SU TURNO",esMiAsiento&&"VOS"].filter(Boolean).join(" · ")}
            </text>
            {pedido!=null&&(
              <text x={pos.x} y={by+35*escala} textAnchor="middle" fill="rgba(220,230,255,0.6)" fontSize={8*escala} fontFamily={fonts.body}>pide: {pedido}</text>
            )}
            <CartasManoSVG mano={j.mano} cx={pos.x} cy={by+59*escala} cw={cw} ch={ch}
              seleccionable={puedeElegir} onTirar={(ci)=>onTirar(idx,ci)}
              expandido={expandidos?.[idx]||false}
              onToggleExpandir={()=>onToggleExpandir(idx)}
              cartaLevantada={cartasLevantadas?.[idx]??-1}
              onLevantarCarta={(ci)=>onLevantarCarta(idx,ci)}
              bocaAbajo={mySeat!=null && idx!==mySeat}
            />
            <PuntosBasesSVG ganadas={j.bases} total={totalBases||0} cx={pos.x} y={by+bh-6*escala} color={t.accent}/>
          </g>
        );
      })}

      {cartasViajandoReparto?.map(({ seat, key }) => {
        const push = seat === mySeat ? PUSH_OWN : 1;
        const destino = { ...posEnCirculo(seat, RX * push, RY * push, CX, CY, nJug), seat };
        return <CartaViajeraReparto key={key} destino={destino} origen={{ x: CX, y: CY }} />;
      })}

      {onToggleTablero && (
        <LibretaIcon x={libretaPos.x} y={libretaPos.y} abierta={!!tableroAbierto} onToggle={onToggleTablero}/>
      )}
      {onToggleReloj && hayReloj && (
        <ClockIcon x={clockPos.x} y={clockPos.y} abierta={!!relojAbierto} onToggle={onToggleReloj}/>
      )}

      {fase==="resolviendo" && ganadorBase!=null && onSiguienteBase && (
        <SiguienteBaseHabitacion
          x={SIZE-24} y={SIZE-24}
          esGanador={mySeat===ganadorBase}
          nombreGanador={jugadores[ganadorBase]?.nombre}
          enviando={!!enviandoResolucion}
          onConfirmar={onSiguienteBase}
        />
      )}
    </svg>
  );

  // Piece S: el panel de pedir (mano/pie + declarar kamikaze) y sus
  // variantes de solo-lectura ("esperando a...", "repartiendo tu mano…")
  // vivían debajo de "la habitación", afuera de la mesa — ahora ocupan el
  // centro vacío de la elipse. PanelPedir es HTML real (botones, inputs),
  // no se reescribió en primitivas SVG; se overlaya con CSS position
  // absolute en vez de <foreignObject> — probado en la práctica que
  // foreignObject anidado en <svg> puede perder actualizaciones de layout
  // bajo Chromium+Playwright cuando su contenido cambia de tamaño (el panel
  // de pedir se vio "atascado" no-visible tras la confirmación de mano,
  // reproducido 2/2 veces en tests\online-habitacion.spec.js aislado,
  // desaparecía al volver a un <div> HTML normal). CX/CY son siempre
  // SIZE/2 (mitad del canvas cuadrado) en las dos variantes de GEOM, así
  // que el centro siempre cae en 50%/50% sin importar nJug — no hace falta
  // leer RX/RY acá. PantallaPartidaOnline.jsx sigue siendo dueña de TODA
  // la lógica de qué mostrar (turno propio, reparto en curso, kamikaze
  // activo, etc.) — este componente solo lo centra, sin saber nada de
  // bidding.
  // Ancho/alto en % del contenedor (que es 1:1 con SIZE, ver comentario de
  // CENTRO_BIDDING_K): así el recuadro escala exactamente igual que el SVG
  // bajo cualquier reflow/resize, en vez de un tamaño en px fijo que se
  // desincroniza del <svg> (que sí escala fluido por su viewBox) — overflow
  // "auto" es una red de seguridad para pedidos con muchas bases (más
  // filas de números) en vez de volver a sobresalir de la elipse.
  const biddingWPct = (2 * mesaRX * CENTRO_BIDDING_WK / SIZE) * 100;
  const biddingHPct = (2 * mesaRY * CENTRO_BIDDING_HK / SIZE) * 100;

  const contenido = (
    <div style={{position:"relative",width:"100%"}}>
      {svg}
      {fase==="bidding" && contenidoBidding && (
        <div style={{
          position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)",
          width:`${biddingWPct}%`, height:`${biddingHPct}%`,
          display:"flex", alignItems:"flex-start", justifyContent:"center",
          overflow:"auto",
        }}>
          {contenidoBidding}
        </div>
      )}
    </div>
  );
  return contenido;
}
