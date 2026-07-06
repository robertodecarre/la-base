import { useState } from "react";
import { mezclar, crearMazo } from "../engine/deck";
import { jerarquia } from "../engine/hierarchy";
import { posEnCirculo } from "../engine/structures";
import { CartaSVG } from "../components/cards/CartaSVG";
import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA SORTEO
// ══════════════════════════════════════════════
export function PantallaSorteo({ jugadores, onComenzar }) {
  const [cartas,setCartas]=useState([]);
  const [hecho,setHecho]=useState(false);
  const [ganIdx,setGanIdx]=useState(null);

  const nJug = jugadores.length;
  const hacer=()=>{
    const mazo=mezclar(crearMazo());
    // Antihorario: para N jugadores
    const orden = Array.from({length:nJug},(_,i)=>i===0?0:(nJug-i));
    const nuevas=new Array(nJug).fill(null);
    let ptr=mazo.length-1;
    for(const i of orden)nuevas[i]=mazo[ptr--];
    setCartas(nuevas);
    let maxJ=-1,gIdx=-1;
    for(let i=0;i<nJug;i++){const j=jerarquia(nuevas[i]);if(j>maxJ){maxJ=j;gIdx=i;}}
    setGanIdx(gIdx);setHecho(true);
  };

  const SIZE=500,CX=250,CY=250;
  const RX = nJug===8?200:190;
  const RY = nJug===8?180:170;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:16}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SORTEO</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2}}>¿QUIÉN REPARTE PRIMERO?</div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{width:"100%",maxWidth:500}}>
        <ellipse cx={CX} cy={CY} rx={RX+40} ry={RY+35} fill="#1a3d2b" stroke="#c9a84c" strokeWidth={2}/>
        {jugadores.map((j,idx)=>{
          const pos=posEnCirculo(idx,RX,RY,CX,CY,nJug);
          const eqColor=idx%2===0?"#5b9bd5":"#e07b54";
          const carta=cartas[idx];const esG=hecho&&idx===ganIdx;const cw=36,ch=52;
          return (
            <g key={idx}>
              <rect x={pos.x-45} y={pos.y-48} width={90} height={90} rx={8}
                fill={esG?"rgba(201,168,76,0.2)":"rgba(0,0,0,0.5)"}
                stroke={esG?"#c9a84c":"rgba(201,168,76,0.2)"} strokeWidth={esG?2:1}/>
              <text x={pos.x} y={pos.y-32} textAnchor="middle" fill={eqColor} fontSize={11} fontFamily="Cinzel, Georgia, serif" fontWeight="bold">{j.nombre}</text>
              {carta
                ?<g transform={`translate(${pos.x-cw/2},${pos.y-18})`}><CartaSVG carta={carta} w={cw} h={ch}/></g>
                :<g transform={`translate(${pos.x-cw/2},${pos.y-18})`}>
                  <rect width={cw} height={ch} rx={4} fill="#3d0808" stroke="#5a0f0a" strokeWidth={2}/>
                  <text x={cw/2} y={ch/2+6} textAnchor="middle" fill="rgba(255,200,100,0.2)" fontSize={16}>✦</text>
                </g>
              }

            </g>
          );
        })}
        {!hecho&&(
          <g style={{cursor:"pointer"}} onClick={hacer}>
            <rect x={CX-26} y={CY-38} width={52} height={76} rx={5} fill="#3d0808" stroke="#c9a84c" strokeWidth={2}/>
            <text x={CX} y={CY+6} textAnchor="middle" fill="rgba(255,200,100,0.3)" fontSize={20} fontFamily="Crimson Text, Georgia, serif">✦</text>
            <text x={CX} y={CY+28} textAnchor="middle" fill="#f0d080" fontSize={8} fontFamily="Cinzel, Georgia, serif" letterSpacing={1}>TOCAR</text>
          </g>
        )}
        {hecho&&ganIdx!==null&&(
          <g>
            <text x={CX} y={CY-4} textAnchor="middle" fill="rgba(201,168,76,0.45)" fontSize={8} fontFamily="Cinzel, Georgia, serif" letterSpacing={1}>DA</text>
            <text x={CX} y={CY+10} textAnchor="middle" fill="#f0d080" fontSize={13} fontFamily="Cinzel, Georgia, serif" fontWeight="bold">{jugadores[ganIdx].nombre}</text>
          </g>
        )}
      </svg>

      {hecho&&<Btn verde onClick={()=>onComenzar(ganIdx)}>COMENZAR PARTIDA</Btn>}
    </div>
  );
}
