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
// reskin (34x50 mesa, 28x40 mano). El asiento propio además multiplica su
// mano por 1.4 (ver MYSEAT_SCALE).
const CARTA_MESA = { w: 37, h: 55 };
const CARTA_MANO = { w: 31, h: 44 };
const MYSEAT_SCALE = 1.4;

// `mySeat` es para la mesa online (pieza 5e): en hotseat es undefined y el
// tablero se comporta como siempre (cualquier mano visible es jugable en su
// turno, porque las cuatro manos son reales — un solo dispositivo compartido
// no tiene nada que ocultar). Online, la única mano real es la propia; el
// resto llega ya boca abajo desde el caller (ver PantallaPartidaOnline.jsx),
// y acá alcanza con no dejar tirar cartas ajenas aunque sea su turno.
export function MesaCircular({ jugadores, cartasMesa, turnoIdx, pieIdx, manoIdx, onTirar, fase, ganadorBase, pedidos, capLocal, capVisitante, ganaActual, expandidos, onToggleExpandir, cartasLevantadas, onLevantarCarta, mySeat, totalBases }) {
  const nJug = jugadores.length || 6;
  const G = GEOM[nJug] || GEOM.default;
  const { RX, RY, canvasSize: SIZE, cx: CX, cy: CY, outerRX, outerRY, mesaRX, mesaRY, cartaMesaRX, cartaMesaRY, boxW, boxH } = G;

  return (
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
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glowTurno" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
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
      ) : fase==="jugar" && cartasMesa.length % (jugadores.length||6) > 0 && ganaActual!==null ? (
        // Quién va ganando la base en curso — coloreado por SU equipo.
        <g>
          <text x={CX} y={CY-2} textAnchor="middle" fill="rgba(170,182,242,0.55)" fontSize={9} letterSpacing={2} fontFamily={fonts.display} fontWeight={800} fontStyle="italic">LA ESTÁ HACIENDO</text>
          <text x={CX} y={CY+10} textAnchor="middle" fill={colors.team[ganaActual%2===0?"local":"visitante"].readyBorder} fontSize={15} fontFamily={fonts.display} fontWeight={800} fontStyle="italic" filter="url(#glow)">
            {jugadores[ganaActual]?.nombre}
          </text>
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
    </svg>
  );
}
