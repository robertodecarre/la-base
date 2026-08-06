import { layoutMesa, pairAnchor } from "../engine/mesaOvalada";
import { CartaSVG } from "./cards/CartaSVG";
import { ReactionFace } from "./ReactionFace";
import { bubbleEfectivo } from "../lib/senas";
import { useAspectFit } from "../hooks/useAspectFit";
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

// Burbuja de viñeta de gesto largo — historieta real (fondo crema, borde
// oscuro, colita apuntando a la carita), calcada del propio tratamiento
// del mockup de referencia (Mesa Ovalada), portado de HTML/CSS a SVG puro
// (el resto de la mesa ya es SVG). Antes era texto suelto sin contenedor,
// además anclado en el mismo punto que el nombre/★CAP en los asientos
// "sombrero" — se solapaban (bug real reportado en vivo). Ahora se ancla
// en bubbleBaseX/Y/bubbleTailX/Y (mesaOvalada.js): el hueco real entre la
// carita y las cartas, que existe del lado de ADENTRO de la carita en
// TODOS los asientos por igual, mientras que el nombre siempre vive del
// lado de AFUERA — nunca compiten por el mismo espacio.
//
// bubbleWidth: SVG no tiene medición de texto en vivo acá (no hay canvas
// disponible en el momento del render) — heurística de ancho promedio de
// glyph, mismo tradeoff que el propio mockup acepta con su
// white-space:nowrap (nunca hace reflow real, un texto excepcionalmente
// largo puede sobrepasar la burbuja) — cubre de sobra el caso típico
// (viñetas cortas tipo "PUTO!" o una frase corta).
function bubbleWidth(text, fontSize) {
  return Math.max(50, Math.min(text.length * fontSize * 0.56 + 20, 260));
}

const BUBBLE_FILL = "#f3f1ea", BUBBLE_STROKE = "#20222c", BUBBLE_TEXT = "#20222c";

function GestureBubble({ baseX, baseY, tailX, tailY, text, fontSize }) {
  const dx0 = tailX - baseX, dy0 = tailY - baseY;
  const w = bubbleWidth(text, fontSize);
  const h = fontSize * 1.9;
  const left = baseX - w / 2, right = baseX + w / 2, top = baseY - h / 2, bottom = baseY + h / 2;

  // La colita sale del borde de la caja más cercano a la dirección real
  // hacia la carita (dx0/dy0) — vertical (arriba/abajo) si esa dirección
  // es mayormente vertical, horizontal si no, así se ve bien tanto en los
  // asientos de los tramos rectos (arriba/abajo) como en las puntas
  // redondeadas (costados/diagonales).
  let tailBaseA, tailBaseB;
  if (Math.abs(dy0) >= Math.abs(dx0)) {
    const edgeY = dy0 >= 0 ? bottom : top;
    tailBaseA = { x: baseX - 7, y: edgeY };
    tailBaseB = { x: baseX + 7, y: edgeY };
  } else {
    const edgeX = dx0 >= 0 ? right : left;
    tailBaseA = { x: edgeX, y: baseY - 7 };
    tailBaseB = { x: edgeX, y: baseY + 7 };
  }

  return (
    <g pointerEvents="none">
      {/* Relleno de la colita hasta la base (tapado después por la caja,
          que dibuja su propio relleno+borde encima) + su contorno propio
          SOLO en los dos lados que quedan visibles (nunca la base, que
          queda debajo de la caja) — así no queda una costura de borde
          duplicado donde la colita se une a la caja. */}
      <path d={`M ${tailBaseA.x},${tailBaseA.y} L ${tailX},${tailY} L ${tailBaseB.x},${tailBaseB.y} Z`} fill={BUBBLE_FILL}/>
      <path d={`M ${tailBaseA.x},${tailBaseA.y} L ${tailX},${tailY} L ${tailBaseB.x},${tailBaseB.y}`} fill="none" stroke={BUBBLE_STROKE} strokeWidth={2} strokeLinejoin="round"/>
      <rect x={left} y={top} width={w} height={h} rx={h * 0.4} fill={BUBBLE_FILL} stroke={BUBBLE_STROKE} strokeWidth={2}/>
      <text x={baseX} y={baseY + fontSize * 0.35} textAnchor="middle" fill={BUBBLE_TEXT} fontFamily={fonts.body} fontWeight={700} fontSize={fontSize}>
        {text}
      </text>
    </g>
  );
}

// rotDeg gira cada carta hacia el centro de la mesa, como una mano
// sostenida en ángulo — la carita nunca rota (ver mesaOvalada.js), solo el
// abanico. Se aplica directo en el `transform` del <g> QUE YA EXISTE por
// carta (compuesto junto al translate existente, `rotate(...) translate(x,y)`)
// en vez de envolver todo en un <g> nuevo — un wrapper nuevo rompería el
// conteo de "hijos directos = cartas" que varios tests y tests/helpers.js's
// jugarCartaDelTurnoActual asumen (ver el comentario largo sobre esto
// mismo en ReactionFace.jsx, mismo motivo).
function CartasManoSVG({ mano, cx, cy, seleccionable, onTirar, expandido, onToggleExpandir, cartaLevantada, onLevantarCarta, bocaAbajo, cw, ch, rotDeg=0 }) {
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
          <g key={carta.uid} style={{cursor:seleccionable?"pointer":"default"}} onClick={handleClick}
             transform={rotDeg?`rotate(${rotDeg},${cx},${cy})`:undefined}>
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

// "Llevar base" (piece G/W) — esquina inferior derecha de "la habitación":
// el margen del viewBox (mesaOvalada.js) deja espacio de sobra ahí, fuera
// del óvalo de la mesa. Mismo componente cubre las dos audiencias: quien
// ganó la base ve el botón real, el resto ve el mismo cartel pero como
// texto de espera con el nombre de quien tiene que confirmar.
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

// Cartas de la mesa y de la mano: mismos tamaños fijos que antes del
// rediseño de la mesa ovalada (10% más grandes que el tamaño previo al
// primer reskin, 34x50 mesa / 28x40 mano) — esto no cambia con la forma
// de la mesa, solo cambia DÓNDE se ubican (mesaOvalada.js).
const CARTA_MESA = { w: 37, h: 55 };
const CARTA_MANO = { w: 31, h: 44 };

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

// Fracción del semieje de la mesa (hw+r horizontal, r vertical) que ocupa
// el recuadro del centro durante 'bidding' — mismo criterio que antes del
// rediseño (verificado con captura contra la forma real, ahora la pista
// ovalada en vez de la elipse): ancho/alto en fracciones DISTINTAS porque
// la mesa sigue siendo bastante más ancha que alta.
const CENTRO_BIDDING_WK = 0.78;
const CENTRO_BIDDING_HK = 0.85;

// Colores de la mesa en sí (borde de madera + paño verde) — igual que las
// caritas (ReactionFace.jsx) y las cartas (CartaSVG), son colores de
// ilustración SVG específicos de esta pieza, no tokens generales de UI:
// se quedan acá en vez de theme.js, mismo criterio ya establecido para
// ambos. Calcados del mockup de referencia (Mesa Ovalada para La Base),
// no aproximados.
const MADERA_FILL = "#3c2a1c", MADERA_STROKE = "#6b4a2a";
const PAÑO_FILL = "#1f4a34", PAÑO_STROKE = "#3a6b4d";

// `mySeat` es para la mesa online (pieza 5e): en hotseat es undefined y el
// tablero se comporta como siempre (cualquier mano visible es jugable en su
// turno, porque las cuatro manos son reales — un solo dispositivo compartido
// no tiene nada que ocultar). Online, la única mano real es la propia; el
// resto llega ya boca abajo desde el caller (ver PantallaPartidaOnline.jsx),
// y acá alcanza con no dejar tirar cartas ajenas aunque sea su turno.
export function MesaCircular({ jugadores, cartasMesa, turnoIdx, pieIdx, manoIdx, onTirar, fase, ganadorBase, pedidos, capLocal, capVisitante, expandidos, onToggleExpandir, cartasLevantadas, onLevantarCarta, mySeat, totalBases, tableroAbierto, onToggleTablero, onSiguienteBase, enviandoResolucion, hayReloj, relojAbierto, onToggleReloj, mirenmeTeamObj, senasMappingCompleto, cartasViajandoReparto, contenidoBidding, resultadoMano }) {
  const nJug = jugadores.length || 6;
  const mesa = layoutMesa(nJug, mySeat);
  const { seats, outerPath, innerPath, hw, r, cx: CX, cy: CY, vbMinX, vbMinY, vbW, vbH } = mesa;
  // Tamaño real en píxeles al que hay que renderizar el <svg> (y el
  // envoltorio del panel de pedir, que se alinea con ESE tamaño exacto,
  // no con el del contenedor completo) — ver useAspectFit.js para por qué
  // esto se mide en JS en vez de con CSS puro.
  const { containerRef, size } = useAspectFit(vbW, vbH);
  // Punto entre los dos capitanes (siempre seat 0 y seat 1) — pairAnchor
  // (mesaOvalada.js) empuja el punto medio hacia afuera del centro en vez
  // de usar la cuerda entre sus anclas tal cual (esa cuerda cae más cerca
  // del centro que cualquiera de los dos asientos, lo que para nJug=4
  // terminaba metiendo el ícono DENTRO del panel de pedir — confirmado con
  // Playwright real, el CONFIRMA le tapaba el click). No depende de
  // mySeat: siempre a la misma posición sin importar quién mire.
  const libretaPos = pairAnchor(nJug, 0, 1);
  const clockPos = { x: libretaPos.x + 28, y: libretaPos.y };

  const svg = (
    <svg viewBox={mesa.viewBox} width={size.width} height={size.height} style={{display:"block",userSelect:"none"}}>
      <defs>
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

      {/* Mesa ovalada tipo "pista" — borde de madera + paño verde, ver
          mesaOvalada.js (_stadiumPath, calcado del mockup de referencia). */}
      <path d={outerPath} fill={MADERA_FILL} stroke={MADERA_STROKE} strokeWidth={6}/>
      <path d={innerPath} fill={PAÑO_FILL} stroke={PAÑO_STROKE} strokeWidth={2}/>

      {cartasMesa.map((item,i)=>{
        const seat = seats[item.jugadorIdx];
        if (!seat) return null;
        const p = seat.tableCardPoint;
        return (
          <g key={`cm-${i}`} transform={`rotate(${seat.rot} ${p.x} ${p.y})`}>
            <g transform={`translate(${p.x-CARTA_MESA.w/2},${p.y-CARTA_MESA.h/2})`}>
              <CartaSVG carta={item.carta} w={CARTA_MESA.w} h={CARTA_MESA.h}/>
            </g>
          </g>
        );
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
        const seat = seats[idx];
        const esMiAsiento = mySeat===idx;
        const esTurno=idx===turnoIdx&&fase==="jugar";
        const puedeElegir = mySeat==null ? esTurno : (esTurno && idx===mySeat);
        const esPie=idx===pieIdx, esMano=idx===manoIdx;
        // idx%2 en vez de j.eq: MesaCircular solo se monta una vez arrancó
        // la partida, momento en el que la invariante seat%2==team ya está
        // garantizada server-side (ver choose_team_rpc.sql) — idx acá ES
        // el seat.
        const equipo = idx%2===0 ? "local" : "visitante";
        const t = colors.team[equipo];
        // Factor de escala de texto/pips (seat.escala, mesaOvalada.js) —
        // derivado del radio real de la carita de este asiento (ya incluye
        // el empuje de "asiento propio" y el afinado por nJug), mismo rol
        // que la vieja variable `escala`.
        const escala = seat.escala;
        const pedido=pedidos?.[idx%2===0?0:1];
        // Dos señales distintas y no intercambiables: el anillo de turno
        // (glow detrás de la carita) marca DE QUIÉN es el turno (universal,
        // no depende del equipo); el tamaño de la carita (seat.faceR, ya
        // agrandado por mySeatScale) marca CUÁL asiento es el propio, de
        // forma permanente incluso cuando el anillo de turno está activo.
        const nameColor = esTurno ? colors.turn.color : t.accent;

        // Mírenme (rediseño de barra de señas): mirenmeTeamObj ya llega
        // escopeado a MI equipo (ver PantallaPartidaOnline.jsx), así que
        // para un asiento rival esta clave simplemente nunca existe — el
        // círculo/ojo nunca se calculan para el equipo contrario, ni hace
        // falta chequear equipo acá. Círculo rojo alrededor de la cara del
        // pedido: visible solo para el propio pedido y quien lo esté
        // mirando ahora mismo (spec explícita); ícono de ojo junto a la
        // cara de cada mirador: visible para todo el equipo (spec no lo
        // restringe como al círculo).
        const misMirenme = mirenmeTeamObj;
        const watchersDeEsteAsiento = misMirenme?.[String(idx)];
        const circuloMirenmeVisible = !!watchersDeEsteAsiento && watchersDeEsteAsiento.length > 0 &&
          (idx === mySeat || watchersDeEsteAsiento.map(String).includes(String(mySeat)));
        const ojoMirenmeVisible = Object.values(misMirenme || {}).some((arr) => (arr || []).map(String).includes(String(idx)));
        const mirenmeR = seat.faceR * 1.65;

        // Viñeta de gesto largo (rediseño de barra de señas): a diferencia
        // de mirenme, la viñeta es pública (mismo alcance que el gesto en
        // sí, ver useGestos.js) — se resuelve con el senas_mapping COMPLETO
        // (las dos claves de equipo), no solo el propio, para poder
        // mostrar la viñeta de un gesto rival también.
        const bubbleCfg = j.gestureKey && j.gestureKey !== "neutral"
          ? bubbleEfectivo(senasMappingCompleto?.[`team${idx % 2}`], j.gestureKey)
          : null;

        // Apilado de texto hacia afuera de la carita (nombre, luego
        // rol+pedido en una sola línea, luego las bases ganadas) —
        // seat.rolY/seat.basesY (mesaOvalada.js) son la MISMA fuente que
        // usa el cálculo del margen del viewBox, así nunca se desincroniza
        // con lo que en verdad entra en cuadro.
        const rolTexto = [esPie&&"PIE",esMano&&"MANO",esTurno&&"▶ SU TURNO",esMiAsiento&&"VOS"].filter(Boolean).join(" · ");
        const pedidoTexto = pedido!=null ? `pide: ${pedido}` : "";
        const rolLineaY = seat.rolY;

        return (
          <g key={`jug-${idx}`}>
            {esTurno && (
              <circle cx={seat.faceCx} cy={seat.faceCy} r={seat.faceR*1.35} fill="none" stroke={colors.turn.color} strokeWidth={2} opacity={0.6} filter="url(#glowTurno)"/>
            )}
            {circuloMirenmeVisible && (
              <circle cx={seat.faceCx} cy={seat.faceCy} r={mirenmeR} fill="none" stroke={colors.negative} strokeWidth={2.5} opacity={0.85} filter="url(#glow)"/>
            )}

            {/* Pieza J: cara de reacción/señas — NUNCA rota (ver
                mesaOvalada.js), a diferencia de las cartas. Apariencia
                guardada por el propio jugador (SeleccionEquipo/
                PantallaOnlineSala.jsx), gesto activo llegado por broadcast
                (useGestos.js, PantallaPartidaOnline.jsx). Anclada más
                afuera del centro de la mesa que las cartas (seat.faceX/Y
                vs. seat.ax/ay) — esto es lo que evita el bug de capas
                (cara tapada por las cartas): no dependen del orden del DOM
                para no superponerse, están en zonas distintas de la mesa. */}
            <ReactionFace gestureKey={j.gestureKey || "neutral"} appearance={j.appearance}
              size={seat.faceSize} x={seat.faceX} y={seat.faceY}/>

            <text x={seat.nameX} y={seat.nameY} textAnchor="middle" fill={nameColor} fontSize={12*escala} fontFamily={fonts.display} fontWeight={800} fontStyle="italic">
              {j.nombre}{(idx===capLocal||idx===capVisitante)?" ★CAP":""}
            </text>
            {rolTexto && (
              <text x={seat.nameX} y={rolLineaY} textAnchor="middle" fill={esTurno?colors.turn.color:"rgba(220,230,255,0.65)"} fontSize={7.5*escala} letterSpacing={1} fontFamily={esTurno?fonts.display:fonts.body} fontWeight={esTurno?800:600} fontStyle={esTurno?"italic":"normal"}>
                {rolTexto}
              </text>
            )}
            {pedidoTexto && (
              <text x={seat.nameX} y={rolLineaY + (rolTexto ? seat.outDir*10*escala : 0)} textAnchor="middle" fill="rgba(220,230,255,0.6)" fontSize={8*escala} fontFamily={fonts.body}>{pedidoTexto}</text>
            )}

            {ojoMirenmeVisible && (
              <text x={seat.faceCx + mirenmeR*0.7} y={seat.faceCy - mirenmeR*0.6} textAnchor="middle" fontSize={13*escala}>👁</text>
            )}
            {bubbleCfg?.on && bubbleCfg.text && (
              <GestureBubble baseX={seat.bubbleBaseX} baseY={seat.bubbleBaseY} tailX={seat.bubbleTailX} tailY={seat.bubbleTailY} text={bubbleCfg.text} fontSize={11*escala}/>
            )}

            <PuntosBasesSVG ganadas={j.bases} total={totalBases||0} cx={seat.nameX} y={seat.basesY} color={t.accent}/>

            {/* Abanico de cartas — anclado en seat.ax/ay (más cerca del
                centro que la cara) y rotado hacia el centro; dibujado
                DESPUÉS de la cara en el DOM (queda "adelante") pero ya no
                depende de eso para no taparla: geométricamente están
                separadas. */}
            <CartasManoSVG mano={j.mano} cx={seat.ax} cy={seat.ay} cw={seat.cw} ch={seat.ch} rotDeg={seat.rot}
              seleccionable={puedeElegir} onTirar={(ci)=>onTirar(idx,ci)}
              expandido={expandidos?.[idx]||false}
              onToggleExpandir={()=>onToggleExpandir(idx)}
              cartaLevantada={cartasLevantadas?.[idx]??-1}
              onLevantarCarta={(ci)=>onLevantarCarta(idx,ci)}
              bocaAbajo={mySeat!=null && idx!==mySeat}
            />
          </g>
        );
      })}

      {cartasViajandoReparto?.map(({ seat: seatIdx, key }) => {
        const seat = seats[seatIdx];
        if (!seat) return null;
        const destino = { x: seat.ax, y: seat.ay, seat: seatIdx };
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
          x={vbMinX+vbW-24} y={vbMinY+vbH-24}
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
  // centro vacío del óvalo. PanelPedir es HTML real (botones, inputs), no
  // se reescribió en primitivas SVG; se overlaya con CSS position absolute
  // en vez de <foreignObject> — probado en la práctica que foreignObject
  // anidado en <svg> puede perder actualizaciones de layout bajo
  // Chromium+Playwright cuando su contenido cambia de tamaño (el panel de
  // pedir se vio "atascado" no-visible tras la confirmación de mano,
  // reproducido 2/2 veces en tests\online-habitacion.spec.js aislado,
  // desaparecía al volver a un <div> HTML normal). CX/CY caen siempre en
  // el centro exacto del viewBox (mesaOvalada.js: el margen es simétrico
  // en las 4 direcciones), así que 50%/50% sigue sirviendo sin importar
  // nJug. Ancho/alto en % del contenedor (que ahora es 1:1 con el propio
  // viewBox por el aspect-ratio de abajo, ver mesaFlexAreaStyle en
  // PantallaPartidaOnline.jsx): así el recuadro escala exactamente igual
  // que el <svg> bajo cualquier reflow/resize.
  const biddingWPct = ((2 * (hw + r) * CENTRO_BIDDING_WK) / vbW) * 100;
  const biddingHPct = ((2 * r * CENTRO_BIDDING_HK) / vbH) * 100;

  // La mesa se autodimensiona dentro de lo que sobra (mismo modelo que el
  // propio mockup de referencia) — el contenedor de afuera (BloqueMesa/
  // mesaFlexAreaStyle en PantallaPartidaOnline.jsx) solo necesita darle
  // flex:1+minHeight:0; este componente no necesita que el caller sepa
  // nada de su viewBox.
  //
  // El tamaño real del <svg> (size.width/size.height) se mide en JS
  // (useAspectFit, containerRef en el <div> de afuera) en vez de con CSS
  // puro — dos intentos con CSS (aspect-ratio en el div envolvente;
  // después width/height como atributos + wrapper inline-block)
  // resolvieron mal el tamaño real en casos reales, medido con
  // getBoundingClientRect, no en teoría — ver el comentario largo en
  // useAspectFit.js. El wrapper de acá adentro usa ESE tamaño exacto
  // (width/height en px, no %), así el panel de pedir (posicionado en %
  // ADENTRO de este wrapper) siempre queda alineado con el paño real —
  // antes, cuando el wrapper podía quedar más grande que el contenido
  // visible del <svg>, el panel de pedir se salía del paño por un costado
  // — bug real atrapado por online-panel-pedir-mesa.spec.js.
  return (
    <div ref={containerRef} style={{position:"relative",width:"100%",height:"100%",minHeight:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"relative",width:size.width,height:size.height}}>
        {svg}
        {fase==="bidding" && contenidoBidding && (
          <div style={{
            position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)",
            width:`calc(${biddingWPct}% - 2px)`, height:`calc(${biddingHPct}% - 2px)`,
            boxSizing:"border-box",
            display:"flex", alignItems:"flex-start", justifyContent:"center",
            overflow:"auto",
          }}>
            {contenidoBidding}
          </div>
        )}
      </div>
    </div>
  );
}
