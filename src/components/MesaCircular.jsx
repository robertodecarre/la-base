import { posEnCirculo } from "../engine/structures";
import { CartaSVG } from "./cards/CartaSVG";

// ══════════════════════════════════════════════
// SVG COMPONENTES
// ══════════════════════════════════════════════
function EstrellasSVG({ cantidad, cx, y, max=5 }) {
  if (cantidad === 0) return null;
  const gap=11, total=Math.min(cantidad,max);
  const startX = cx - (total*gap-(gap-8))/2;
  return <>{Array.from({length:total}).map((_,i)=>(
    <text key={i} x={startX+i*gap+4} y={y} textAnchor="middle" fontSize={10} fill="#f0d080" fontFamily="Crimson Text, Georgia, serif">★</text>
  ))}</>;
}

function CartasManoSVG({ mano, cx, cy, seleccionable, onTirar, expandido, onToggleExpandir, cartaLevantada, onLevantarCarta }) {
  if (!mano.length) return null;
  const cw=28, ch=40;
  // Modo expandido: gap fijo para ver bien las cartas
  // Modo contraído: gap mínimo
  const gap = expandido ? Math.min(32, 110/Math.max(mano.length,1)) : Math.min(18, 70/Math.max(mano.length,1));
  const totalW = cw + gap*(mano.length-1);
  const startX = cx - totalW/2;

  return (
    <>
      {/* Botón expandir/contraer — solo si hay más de 1 carta */}
      {onToggleExpandir && mano.length > 1 && (
        <g onClick={(e)=>{e.stopPropagation();onToggleExpandir();}} style={{cursor:"pointer"}}>
          <rect x={cx-14} y={cy+ch/2+4} width={28} height={12} rx={3}
            fill="rgba(0,0,0,0.5)" stroke="rgba(201,168,76,0.4)" strokeWidth={0.8}/>
          <text x={cx} y={cy+ch/2+13} textAnchor="middle" fontSize={8} fill="rgba(201,168,76,0.7)" fontFamily="Crimson Text, Georgia, serif">
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
                fill={esLevantada?"rgba(201,168,76,0.25)":"rgba(201,168,76,0.1)"}
                stroke={esLevantada?"#c9a84c":"rgba(201,168,76,0.35)"} strokeWidth={esLevantada?1.5:1}/>
            )}
            <g transform={`translate(${x},${y})`}
               style={{transition:"transform 0.15s"}}>
              <CartaSVG carta={carta} w={cw} h={ch}/>
            </g>
          </g>
        );
      })}
    </>
  );
}

export function MesaCircular({ jugadores, cartasMesa, turnoIdx, pieIdx, manoIdx, onTirar, fase, ganadorBase, pedidos, capN, capE, ganaActual, expandidos, onToggleExpandir, cartasLevantadas, onLevantarCarta }) {
  const nJug = jugadores.length || 6;
  const SIZE=600, CX=300, CY=300;
  const RX = nJug===8 ? 200 : 220;
  const RY = nJug===8 ? 185 : 200;
  const MESA_R=118, CARTA_MESA_R=88;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{width:"100%",userSelect:"none"}}>
      <ellipse cx={CX} cy={CY} rx={RX+60} ry={RY+55} fill="#1a3d2b" stroke="#c9a84c" strokeWidth={2}/>
      <ellipse cx={CX} cy={CY} rx={RX+56} ry={RY+51} fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth={1}/>
      {jugadores.map((_,idx)=>{
        const pos=posEnCirculo(idx,RX,RY,CX,CY,nJug);
        return <line key={`ln-${idx}`} x1={CX} y1={CY} x2={pos.x} y2={pos.y} stroke="rgba(201,168,76,0.05)" strokeWidth={1} strokeDasharray="3,7"/>;
      })}
      <ellipse cx={CX} cy={CY} rx={MESA_R} ry={MESA_R*0.72} fill="#0f2519" stroke="#c9a84c" strokeWidth={2}/>
      <ellipse cx={CX} cy={CY} rx={MESA_R-5} ry={MESA_R*0.72-5} fill="none" stroke="rgba(201,168,76,0.12)" strokeWidth={1}/>


      {cartasMesa.map((item,i)=>{
        const p=posEnCirculo(item.jugadorIdx,CARTA_MESA_R,CARTA_MESA_R*0.82,CX,CY,nJug);
        const cw=34,ch=50;
        return <g key={`cm-${i}`} transform={`translate(${p.x-cw/2},${p.y-ch/2})`}><CartaSVG carta={item.carta} w={cw} h={ch}/></g>;
      })}

      {ganadorBase!==null ? (
        <g>
          <text x={CX} y={CY-2} textAnchor="middle" fill="rgba(201,168,76,0.4)" fontSize={7} fontFamily="Cinzel, Georgia, serif" letterSpacing={1}>LA HIZO</text>
          <text x={CX} y={CY+10} textAnchor="middle" fill="#f0d080" fontSize={10} fontFamily="Cinzel, Georgia, serif" fontWeight="bold">{jugadores[ganadorBase]?.nombre}</text>
        </g>
      ) : fase==="jugar" && cartasMesa.length % (jugadores.length||6) > 0 && ganaActual!==null ? (
        // Quién va ganando la base en curso
        <g>
          <text x={CX} y={CY-2} textAnchor="middle" fill="rgba(201,168,76,0.4)" fontSize={7} fontFamily="Cinzel, Georgia, serif" letterSpacing={1}>LA ESTÁ HACIENDO</text>
          <text x={CX} y={CY+10} textAnchor="middle" fill="#f0d080" fontSize={10} fontFamily="Cinzel, Georgia, serif" fontWeight="bold">
            {jugadores[ganaActual]?.nombre}
          </text>
        </g>
      ) : (
        <text x={CX} y={CY+6} textAnchor="middle" fill="rgba(201,168,76,0.4)" fontSize={9} fontFamily="Crimson Text, Georgia, serif">
          {fase==="jugar"?`▶ ${jugadores[turnoIdx]?.nombre}`:""}
        </text>
      )}

      {jugadores.map((j,idx)=>{
        const pos=posEnCirculo(idx,RX,RY,CX,CY,nJug);
        const esTurno=idx===turnoIdx&&fase==="jugar";
        const esPie=idx===pieIdx, esMano=idx===manoIdx;
        const eqColor=idx%2===0?"#5b9bd5":"#e07b54";
        const boxW=112,boxH=104,bx=pos.x-boxW/2,by=pos.y-boxH/2;
        const pedido=pedidos?.[idx%2===0?0:1];
        return (
          <g key={`jug-${idx}`}>
            <rect x={bx} y={by} width={boxW} height={boxH} rx={8}
              fill={esTurno?"rgba(201,168,76,0.13)":"rgba(0,0,0,0.55)"}
              stroke={esTurno?"#c9a84c":esPie?"#4a9e6a":"rgba(201,168,76,0.18)"}
              strokeWidth={esTurno?2:1}/>
            <text x={pos.x} y={by+13} textAnchor="middle" fill={eqColor} fontSize={11} fontFamily="Cinzel, Georgia, serif" fontWeight="bold">{j.nombre}</text>
            <text x={pos.x} y={by+23} textAnchor="middle" fill="rgba(201,168,76,0.45)" fontSize={7.5} fontFamily="Crimson Text, Georgia, serif">
              {[esPie&&"PIE",esMano&&"MANO",esTurno&&"▶ SU TURNO",(idx===capN||idx===capE)&&"★CAP"].filter(Boolean).join(" · ")}
            </text>
            {pedido!==undefined&&(
              <text x={pos.x} y={by+33} textAnchor="middle" fill="rgba(201,168,76,0.65)" fontSize={8} fontFamily="Crimson Text, Georgia, serif">pide: {pedido}</text>
            )}
            <CartasManoSVG mano={j.mano} cx={pos.x} cy={by+58} seleccionable={esTurno} onTirar={(ci)=>onTirar(idx,ci)}
              expandido={expandidos?.[idx]||false}
              onToggleExpandir={()=>onToggleExpandir(idx)}
              cartaLevantada={cartasLevantadas?.[idx]??-1}
              onLevantarCarta={(ci)=>onLevantarCarta(idx,ci)}
            />
            <EstrellasSVG cantidad={j.bases} cx={pos.x} y={by+boxH-6} max={5}/>
          </g>
        );
      })}
    </svg>
  );
}
