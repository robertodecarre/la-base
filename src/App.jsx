import { useState, useEffect, useCallback } from "react";
import { nv } from "./engine/cards";
import { crearMazo, mezclar } from "./engine/deck";
import { jerarquia } from "./engine/hierarchy";
import { calcularPuntos } from "./engine/scoring";
import { ESTRUCTURAS, maxCartas, NOMBRES_POR_CANT, posEnCirculo } from "./engine/structures";
import { useClock } from "./hooks/useClock";
import { CartaSVG } from "./components/cards/CartaSVG";
import { DisplayReloj } from "./components/DisplayReloj";
import { PanelPedir } from "./components/PanelPedir";
import { MesaCircular } from "./components/MesaCircular";
import { Tablero } from "./components/Tablero";
import { EstrellasPedido } from "./components/EstrellasPedido";
import { Btn } from "./components/Btn";

// ══════════════════════════════════════════════
// PANTALLA INICIO
// ══════════════════════════════════════════════
function PantallaInicio({ onIniciar }) {
  const [nJug,setNJug]=useState(6);
  const [dosMazos,setDosMazos]=useState(false);
  const [nombres,setNombres]=useState([...NOMBRES_POR_CANT[6]]);
  const [estructuraSel,setEstructuraSel]=useState("clasica2004");
  const [customStr,setCustomStr]=useState("1,2,3,2,1");
  const [usarTiempo,setUsarTiempo]=useState(false);
  const [minutos,setMinutos]=useState(10);
  const [modoTiempo,setModoTiempo]=useState("muerte");
  const [kamikazes,setKamikazes]=useState(1);
  const [capN,setCapN]=useState(0);
  const [capE,setCapE]=useState(1);
  const [ases,setAses]=useState({espadas:true,copas:true,oros:true});

  const cambiarNJug = (n) => {
    setNJug(n);
    setNombres([...NOMBRES_POR_CANT[n]]);
    setCapN(0); setCapE(1);
    if (n !== 8) setDosMazos(false);
  };

  const maxC = maxCartas(nJug, dosMazos);
  const estructura = (estructuraSel==="custom"
    ? customStr.split(",").map(x=>parseInt(x.trim())).filter(x=>!isNaN(x)&&x>0)
    : ESTRUCTURAS[estructuraSel]
  ).map(x=>Math.min(x,maxC));

  const inp={fontFamily:"Crimson Text, Georgia, serif",fontSize:12,padding:"5px 8px",borderRadius:5,border:"1.5px solid rgba(201,168,76,0.4)",background:"rgba(0,0,0,0.4)",color:"#f0d080",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:28,color:"#f0d080",letterSpacing:4,textShadow:"0 0 20px rgba(201,168,76,0.4)"}}>LA BASE</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.3)",letterSpacing:3}}>NAIPES ESPAÑOLES</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:20,width:"100%",maxWidth:520}}>

        {/* CANTIDAD DE JUGADORES */}
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8,textAlign:"center"}}>CANTIDAD DE JUGADORES</div>
        <div style={{display:"flex",gap:8,marginBottom:16,justifyContent:"center"}}>
          {[4,6,8].map(n=>(
            <button key={n} onClick={()=>cambiarNJug(n)} style={{
              fontFamily:"Cinzel, Georgia, serif",fontSize:14,fontWeight:"bold",
              width:52,height:52,borderRadius:8,
              border:`2px solid ${nJug===n?"#c9a84c":"rgba(201,168,76,0.25)"}`,
              background:nJug===n?"rgba(201,168,76,0.2)":"rgba(0,0,0,0.3)",
              color:nJug===n?"#f0d080":"rgba(201,168,76,0.45)",cursor:"pointer",
            }}>{n}</button>
          ))}
        </div>

        {/* DOS MAZOS — solo para 8 jugadores */}
        {nJug===8&&(
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"8px 12px",background:"rgba(201,168,76,0.08)",borderRadius:8,border:"1px solid rgba(201,168,76,0.2)"}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"rgba(201,168,76,0.7)"}}>
              <input type="checkbox" checked={dosMazos} onChange={e=>setDosMazos(e.target.checked)} style={{accentColor:"#c9a84c"}}/>
              Jugar con dos mazos (sin ases del 2do mazo · máx {maxC} cartas)
            </label>
          </div>
        )}

        {/* JUGADORES Y CAPITANES */}
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8,textAlign:"center"}}>JUGADORES Y CAPITANES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          {Array.from({length:nJug},(_,i)=>{
            const eq=i%2===0?"NOSOTROS":"ELLOS";
            const eqColor=i%2===0?"#5b9bd5":"#e07b54";
            const esCap = i%2===0 ? capN===i : capE===i;
            return (
              <div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{fontSize:9,color:eqColor,letterSpacing:1}}>J{i+1} · {eq}</div>
                  <button onClick={()=>i%2===0?setCapN(i):setCapE(i)} title="Hacer capitán" style={{
                    fontSize:9,padding:"1px 5px",borderRadius:4,border:`1px solid ${esCap?"#c9a84c":"rgba(201,168,76,0.25)"}`,
                    background:esCap?"rgba(201,168,76,0.2)":"transparent",
                    color:esCap?"#f0d080":"rgba(201,168,76,0.4)",cursor:"pointer",
                  }}>{esCap?"★ CAP":"☆"}</button>
                </div>
                <input style={inp} value={nombres[i]||""} onChange={e=>setNombres(n=>n.map((v,j)=>j===i?e.target.value:v))}/>
              </div>
            );
          })}
        </div>

        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8}}>ESTRUCTURA DE MANOS</div>
        <select value={estructuraSel} onChange={e=>setEstructuraSel(e.target.value)} style={{...inp,marginBottom:8}}>
          <option value="clasica2004">2004 Clásica (1,3,5,5,3,1,1,3,5,5,3,1)</option>
          <option value="alt2004">2004 Alternativa (1,3,5,6,6,5,3,1,1,3,5,6,6,5,3,1)</option>
          <option value="postpandemia">Postpandemia (1,2,3,4,5,6,6,5,4,3,2,1)</option>
          <option value="custom">Personalizada</option>
        </select>
        {estructuraSel==="custom"&&(
          <input style={{...inp,marginBottom:8}} value={customStr} onChange={e=>setCustomStr(e.target.value)} placeholder={`ej: 1,2,3,2,1 (máx ${maxC})`}/>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
          {estructura.map((c,i)=>(
            <div key={i} style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.18)",color:"rgba(201,168,76,0.55)"}}>{c}</div>
          ))}
        </div>

        {/* SUPERPODERES DE ASES */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:10}}>SUPERPODERES DE ASES</div>
          {[
            {key:"espadas", label:"As de Espadas", desc:"Si cae después del Ancho de Bastos en la misma base, lo mata y gana la base.", emoji:"⚔️"},
            {key:"copas",   label:"As de Copas",   desc:"Al caer, quien lo tiró elige si el sentido de juego se invierte o continúa.", emoji:"🏆"},
            {key:"oros",    label:"As de Oros",     desc:"Si su equipo gana la base, quien lo tiró elige quién abre la siguiente.", emoji:"🟡"},
          ].map(({key,label,desc,emoji})=>(
            <div key={key} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,padding:"8px 10px",borderRadius:8,border:`1px solid ${ases[key]?"rgba(201,168,76,0.35)":"rgba(201,168,76,0.12)"}`,background:ases[key]?"rgba(201,168,76,0.07)":"rgba(0,0,0,0.2)"}}>
              <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}}>
                <input type="checkbox" checked={ases[key]} onChange={e=>setAses(a=>({...a,[key]:e.target.checked}))} style={{accentColor:"#c9a84c",width:14,height:14}}/>
                <span style={{fontSize:13}}>{emoji}</span>
              </label>
              <div>
                <div style={{fontSize:11,color:ases[key]?"#f0d080":"rgba(201,168,76,0.4)",fontWeight:"bold",marginBottom:2}}>{label}</div>
                <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",fontStyle:"italic",lineHeight:1.4}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* KAMIKAZES */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <label style={{fontSize:11,color:"rgba(201,168,76,0.7)",whiteSpace:"nowrap"}}>Kamikazes por equipo mano:</label>
            <select value={kamikazes} onChange={e=>setKamikazes(parseInt(e.target.value))} style={{...inp,width:60}}>
              {[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",marginBottom:10}}>Pedir 0 o el maximo sin declarar kamikaze y perder por 2+ = perder la partida.</div>
        </div>

        {/* TIEMPO */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"rgba(201,168,76,0.7)"}}>
              <input type="checkbox" checked={usarTiempo} onChange={e=>setUsarTiempo(e.target.checked)} style={{accentColor:"#c9a84c"}}/>
              Jugar con reloj
            </label>
          </div>
          {usarTiempo&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <label style={{fontSize:11,color:"rgba(201,168,76,0.5)",whiteSpace:"nowrap"}}>Minutos por equipo:</label>
                <input type="number" min={1} max={60} value={minutos} onChange={e=>setMinutos(parseInt(e.target.value)||5)}
                  style={{...inp,width:60,textAlign:"center"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                {["muerte","deportivo"].map(modo=>(
                  <button key={modo} onClick={()=>setModoTiempo(modo)} style={{
                    flex:1,padding:"8px",fontFamily:"Crimson Text, Georgia, serif",fontSize:11,letterSpacing:1,
                    border:`2px solid ${modoTiempo===modo?"#c9a84c":"rgba(201,168,76,0.25)"}`,
                    borderRadius:7,background:modoTiempo===modo?"rgba(201,168,76,0.15)":"rgba(0,0,0,0.3)",
                    color:modoTiempo===modo?"#f0d080":"rgba(201,168,76,0.45)",cursor:"pointer",
                  }}>
                    {modo==="muerte"?"⚡ Muerte súbita":"🏃 Modo deportivo"}
                  </button>
                ))}
              </div>
              <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic"}}>
                {modoTiempo==="muerte"
                  ?"Al agotar el tiempo, el equipo pierde la partida."
                  :"Al agotar el tiempo, ese equipo tendrá solo 10 segundos por mano para decidir."}
              </div>
            </div>
          )}
        </div>

        <div style={{display:"flex",justifyContent:"center"}}>
          <Btn verde onClick={()=>onIniciar(nombres.map((n,i)=>n.trim()||`J${i+1}`),estructura,usarTiempo?minutos*60:null,modoTiempo,capN,capE,kamikazes,nJug,dosMazos,ases)}>
            COMENZAR SORTEO
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PANTALLA SORTEO
// ══════════════════════════════════════════════
function PantallaSorteo({ jugadores, onComenzar }) {
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

// ══════════════════════════════════════════════
// PANTALLA PARTIDA
// ══════════════════════════════════════════════
function PantallaPartida({ jugadoresInit, estructura, tiempoInicial, modoTiempo, pieInicial, capN, capE, kamikazesIniciales, nJug, dosMazos, ases, onReset, onReiniciar }) {
  const pi = pieInicial ?? 0;
  const nJugTotal = nJug || jugadoresInit.length || 6;
  const manoInicial = (pi + nJugTotal - 1) % nJugTotal;
  const hayTiempo = tiempoInicial !== null;

  const [jugadores,setJugadores]=useState(()=>jugadoresInit.map((nombre,i)=>({nombre,eq:i%2===0?0:1,mano:[],bases:0})));
  const [cartasMesa,setCartasMesa]=useState([]);
  const [historial,setHistorial]=useState([]);
  const [manoActual,setManoActual]=useState(0);
  const [pieIdx,setPieIdx]=useState(pi);
  const [manoMesa,setManoMesa]=useState(manoInicial);
  const [turnoIdx,setTurnoIdx]=useState(manoInicial);
  const [fase,setFase]=useState("repartir");
  const [baseNum,setBaseNum]=useState(0);
  const [ganadorBase,setGanadorBase]=useState(null);
  const [log,setLog]=useState([]);
  const [pedidos,setPedidos]=useState(null);
  const [eqMuerto,setEqMuerto]=useState(null);
  const [kamikazesDisp,setKamikazesDisp]=useState(kamikazesIniciales??1);
  const [kamikazeDeclarado,setKamikazeDeclarado]=useState(false);
  const [causaFin,setCausaFin]=useState("normal");
  const [confirmarReinicio,setConfirmarReinicio]=useState(false);
  const [expandidos,setExpandidos]=useState({}); // {jugadorIdx: bool}
  const [cartasLevantadas,setCartasLevantadas]=useState({}); // {jugadorIdx: cartaIdx|-1}
  // As de oros: {activo, jugadorIdx} — espera elegir quién abre la siguiente base
  const [orosMenu,setOrosMenu]=useState(null);
  // As de copas: sentido de rotación (1=antihorario normal, -1=horario invertido)
  const [sentido,setSentido]=useState(1);
  // As de copas: menú pendiente + quién lo tiró
  const [copasMenu,setCopasMenu]=useState(false);
  const [copasPortador,setCopasPortador]=useState(null); // jugadorIdx que tiró el as de copas
  // Cartas mesa pendientes de resolver (cuando copas cae al final de ronda)
  const [mesaPendiente,setMesaPendiente]=useState(null);
  const [jugadoresPendientes,setJugadoresPendientes]=useState(null);

  const addLog=(msg)=>setLog(l=>[msg,...l].slice(0,30));

  const onAgotado=useCallback((eq)=>{
    if(modoTiempo==="muerte"){setEqMuerto(eq);setFase("muerto");}
  },[modoTiempo]);

  const clock=useClock(tiempoInicial??0,tiempoInicial??0,modoTiempo,onAgotado);


  const manoJugIdx=(pieIdx+nJugTotal-1)%nJugTotal;
  const eqManoActual=jugadores[manoJugIdx]?.eq??0;
  const nombresPorEq=(eq)=>jugadores.filter(j=>j.eq===eq).map(j=>j.nombre);

  const repartirMano=()=>{
    const n=estructura[manoActual];
    let m=mezclar(crearMazo(dosMazos||false));
    const necesarias=n*nJugTotal;
    if(necesarias>m.length){
      addLog(`⚠️ No hay suficientes cartas (necesarias: ${necesarias}, disponibles: ${m.length})`);
      return;
    }
    const nuevosJ=jugadores.map(j=>({...j,mano:[],bases:0}));
    for(let r=0;r<n;r++)for(let i=0;i<nJugTotal;i++)nuevosJ[i].mano.push(m.pop());
    setJugadores(nuevosJ);setCartasMesa([]);setBaseNum(0);setGanadorBase(null);setPedidos(null);setKamikazeDeclarado(false);setCartasLevantadas({});
    const nuevoMano=(pieIdx+nJugTotal-1)%nJugTotal;
    setManoMesa(nuevoMano);setTurnoIdx(nuevoMano);
    // Arranca reloj del equipo mano
    if(hayTiempo)clock.iniciarPara(eqManoActual);
    setFase("pedir");
    addLog(`— Mano ${manoActual+1}: ${n} carta(s). Pie: ${jugadores[pieIdx].nombre}.`);
  };

  const confirmarPedidos=(pedN,pedE)=>{
    setPedidos([pedN,pedE]);
    clock.detener();
    setFase("jugar");
    addLog(`Nosotros piden ${pedN} · Ellos piden ${pedE}.`);
  };

  const tirarCarta=(jugIdx,cartaIdx)=>{
    if(fase!=="jugar"||jugIdx!==turnoIdx)return;
    const carta=jugadores[jugIdx].mano[cartaIdx];
    const nuevosMesa=[...cartasMesa,{carta,jugadorIdx:jugIdx,orden:cartasMesa.length}];
    const nuevosJ=jugadores.map((j,i)=>i===jugIdx?{...j,mano:j.mano.filter((_,ci)=>ci!==cartaIdx)}:j);
    setJugadores(nuevosJ);setCartasMesa(nuevosMesa);
    setCartasLevantadas(cl=>({...cl,[jugIdx]:-1}));
    addLog(`${jugadores[jugIdx].nombre} tira ${nv(carta.valor)} de ${carta.palo.n}.`);

    // As de copas: solo si el superpoder está activado
    if(ases?.copas && carta.valor===1&&carta.palo.n==="Copas"){
      setCopasMenu(true);
      setFase("copas-menu");
      return;
    }

    if(nuevosMesa.length%nJugTotal===0){resolverBase(nuevosMesa.slice(-nJugTotal),nuevosJ);}
    else{
      // Siguiente turno según sentido
      const sig = sentido===1 ? (jugIdx+nJugTotal-1)%nJugTotal : (jugIdx+1)%nJugTotal;
      setTurnoIdx(sig);
    }
  };

  const resolverBase=(ronda,jActuales)=>{
    // Buscar ancho de bastos y as de espadas en la ronda
    const anchoItem = ronda.find(x=>x.carta.valor===1&&x.carta.palo.n==="Bastos");
    const espItem   = ronda.find(x=>x.carta.valor===1&&x.carta.palo.n==="Espadas");

    // Superpoder del as de espadas: si el ancho de bastos fue jugado
    // Y el as de espadas fue jugado DESPUES del ancho, gana el as de espadas
    let ganIdx;
    if(anchoItem && espItem && espItem.orden > anchoItem.orden){
      ganIdx = espItem.jugadorIdx;
      addLog(`¡As de Espadas mata al Ancho de Bastos!`);
    } else {
      // Resolución normal: mayor jerarquía, empate = menor orden (más cercano al mano)
      let maxJ=-1,ganOrden=999;
      ganIdx=-1;
      for(const item of ronda){
        const j=jerarquia(item.carta);
        if(j>maxJ||(j===maxJ&&item.orden<ganOrden)){maxJ=j;ganIdx=item.jugadorIdx;ganOrden=item.orden;}
      }
    }

    const nuevaBase=baseNum+1;
    const nuevosJ=jActuales.map((j,i)=>i===ganIdx?{...j,bases:j.bases+1}:j);
    setJugadores(nuevosJ);setBaseNum(nuevaBase);setGanadorBase(ganIdx);
    addLog(`BASE ${nuevaBase}: ¡${jActuales[ganIdx].nombre} gana!`);

    // As de oros: solo si el superpoder está activado
    const orosItem=ases?.oros ? ronda.find(x=>x.carta.valor===1&&x.carta.palo.n==="Oros") : null;
    const orosEq = orosItem ? jActuales[orosItem.jugadorIdx].eq : -1;
    const ganEq = jActuales[ganIdx].eq;
    if(orosItem && orosEq===ganEq && nuevaBase<estructura[manoActual]){
      addLog(`🟡 As de Oros: ${jActuales[orosItem.jugadorIdx].nombre} elige quién abre la siguiente base.`);
      setOrosMenu({jugadorIdx:orosItem.jugadorIdx, eqIdx:orosEq});
      setFase("oros-menu");
      return;
    }

    setFase(nuevaBase>=estructura[manoActual]?"cerrar":"resolver");
  };

  const siguienteBase=(nuevoMano=null)=>{
    const m = nuevoMano ?? ganadorBase;
    setCartasMesa([]);setManoMesa(m);setTurnoIdx(m);setGanadorBase(null);setOrosMenu(null);setCopasMenu(false);setFase("jugar");
  };

  const cerrarMano=()=>{
    let hechoN=0,hechoE=0;
    for(const j of jugadores){if(j.eq===0)hechoN+=j.bases;else hechoE+=j.bases;}
    const pedN=pedidos?.[0]??0,pedE=pedidos?.[1]??0;
    const{deltaN,deltaE}=calcularPuntos(pedN,pedE,hechoN,hechoE);
    // Detectar kamikaze no declarado
    const eqManoEq=jugadores[manoJugIdx]?.eq??0;
    const deltaEqMano=eqManoEq===0?deltaN:deltaE;
    const noDeclarado=!kamikazeDeclarado&&deltaEqMano<=-2;
    const nuevoHist=[...historial];
    nuevoHist[manoActual]={deltaN,deltaE,pedN,pedE,hechoN,hechoE};
    setHistorial(nuevoHist);
    const signo=(n)=>n>=0?`+${n}`:`${n}`;
    addLog(`— Fin mano ${manoActual+1}. Nosotros: ${signo(deltaN)} · Ellos: ${signo(deltaE)}`);
    if(noDeclarado){
      addLog("✈️ KAMIKAZE NO DECLARADO — el equipo mano pierde la partida.");
      setCausaFin("kamikaze");
      setFase("fin");
      return;
    }
    const sig=manoActual+1;
    if(sig>=estructura.length){setCausaFin("normal");setFase("fin");return;}
    setPieIdx((pieIdx+1)%nJugTotal);setManoActual(sig);
    setCartasMesa([]);setBaseNum(0);setGanadorBase(null);setPedidos(null);setKamikazeDeclarado(false);setSentido(1);setOrosMenu(null);setCopasMenu(false);setCopasPortador(null);setMesaPendiente(null);setJugadoresPendientes(null);setFase("repartir");
  };

  const totN=historial.reduce((s,h)=>s+(h?.deltaN||0),0);
  const totE=historial.reduce((s,h)=>s+(h?.deltaE||0),0);

  // PANTALLA MUERTE POR TIEMPO
  if(fase==="muerto"){
    const perdedor=eqMuerto===0?"NOSOTROS":"ELLOS";
    const ganador=eqMuerto===0?"ELLOS":"NOSOTROS";
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:32}}>
        <div style={{fontSize:24,color:"#e05555",letterSpacing:3}}>⚡ TIEMPO AGOTADO</div>
        <div style={{fontSize:18,color:"#f0d080"}}>{perdedor} perdieron por tiempo</div>
        <div style={{fontSize:20,color:eqMuerto===0?"#e07b54":"#5b9bd5",fontWeight:"bold"}}>¡GANAN {ganador}!</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
          <Btn onClick={onReset}>Menú principal</Btn>
          <Btn verde onClick={onReiniciar}>Reiniciar partida</Btn>
        </div>
      </div>
    );
  }

  // FIN
  if(fase==="fin"){
    const esKamikaze=causaFin==="kamikaze";
    const eqManoEq=jugadores[manoJugIdx]?.eq??0;
    const ganKamikaze=eqManoEq===0?1:0;
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:24}}>
        {esKamikaze&&<div style={{fontSize:22,color:"#e05555",letterSpacing:2}}>✈️ KAMIKAZE NO DECLARADO</div>}
        <div style={{fontSize:24,color:"#f0d080",letterSpacing:3}}>FIN DE PARTIDA</div>
        <div style={{fontSize:20,color:esKamikaze?(ganKamikaze===0?"#5b9bd5":"#e07b54"):(totN>totE?"#5b9bd5":totE>totN?"#e07b54":"#f0d080")}}>
          {esKamikaze?(ganKamikaze===0?"¡GANAMOS!":"¡GANARON ELLOS!"):(totN===totE?"¡EMPATE!":totN>totE?"¡GANAMOS!":"¡GANARON ELLOS!")}
        </div>
        <div style={{fontSize:14,color:"rgba(201,168,76,0.7)"}}>Nosotros: {totN} · Ellos: {totE}</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
          <Btn onClick={onReset}>Menú principal</Btn>
          <Btn verde onClick={onReiniciar}>Reiniciar partida</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"8px 10px"}}>

      {/* MARCADOR + RELOJ */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",alignItems:"center",width:"100%"}}>
        <div style={{display:"flex",gap:16,alignItems:"center",background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:10,padding:"8px 20px"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#5b9bd5",letterSpacing:1}}>NOSOTROS</div>
            <div style={{fontSize:26,fontWeight:"bold",color:totN>=0?"#5b9bd5":"#e05555",lineHeight:1}}>{totN}</div>
            <EstrellasPedido pedidas={pedidos?.[0]??0} hechas={jugadores.filter(j=>j.eq===0).reduce((s,j)=>s+j.bases,0)} color="#5b9bd5"/>
          </div>
          <div style={{color:"rgba(201,168,76,0.25)",fontSize:16}}>—</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#e07b54",letterSpacing:1}}>ELLOS</div>
            <div style={{fontSize:26,fontWeight:"bold",color:totE>=0?"#e07b54":"#e05555",lineHeight:1}}>{totE}</div>
            <EstrellasPedido pedidas={pedidos?.[1]??0} hechas={jugadores.filter(j=>j.eq===1).reduce((s,j)=>s+j.bases,0)} color="#e07b54"/>
          </div>
          <div style={{fontSize:9,color:"rgba(201,168,76,0.35)",letterSpacing:1,marginLeft:6}}>
            M{manoActual+1}/{estructura.length}<br/>
            <span style={{color:"rgba(201,168,76,0.5)"}}>{estructura[manoActual]} cartas</span>
          </div>
        </div>
        {hayTiempo&&(
          <DisplayReloj
            tiempoN={clock.tiempoN} tiempoE={clock.tiempoE}
            corriendo={clock.corriendo} agotadoN={clock.agotadoN} agotadoE={clock.agotadoE}
            modoLento={clock.modoLento} modoTiempo={modoTiempo} hayTiempo={hayTiempo}
          />
        )}
      </div>

      {/* TABLERO */}
      <div style={{width:"100%",maxWidth:640}}>
        <Tablero estructura={estructura} historial={historial}/>
      </div>

      {/* LAYOUT: mesa + panel pedir lateral */}
      <div style={{display:"flex",gap:10,width:"100%",alignItems:"flex-start"}}>
        {/* MESA */}
        <div style={{flex:1,minWidth:0}}>
          {(()=>{
            const enRonda = cartasMesa.length % nJugTotal;
            const rondaActual = enRonda > 0 ? cartasMesa.slice(-enRonda) : [];
            let ganaActual = null;
            if (rondaActual.length > 0) {
              const anchoItem = rondaActual.find(x=>x.carta.valor===1&&x.carta.palo.n==="Bastos");
              const espItem   = rondaActual.find(x=>x.carta.valor===1&&x.carta.palo.n==="Espadas");
              if (ases?.espadas && anchoItem && espItem && espItem.orden > anchoItem.orden) {
                ganaActual = espItem.jugadorIdx;
              } else {
                let maxJ=-1, ganOrden=999;
                for (const item of rondaActual) {
                  const j = jerarquia(item.carta);
                  if (j>maxJ||(j===maxJ&&item.orden<ganOrden)){maxJ=j;ganaActual=item.jugadorIdx;ganOrden=item.orden;}
                }
              }
            }
            return (
              <MesaCircular
                jugadores={jugadores} cartasMesa={cartasMesa}
                turnoIdx={turnoIdx} pieIdx={pieIdx} manoIdx={manoMesa}
                onTirar={tirarCarta} fase={fase} ganadorBase={ganadorBase} pedidos={pedidos}
                capN={capN??0} capE={capE??1} ganaActual={ganaActual}
                expandidos={expandidos}
                onToggleExpandir={(idx)=>setExpandidos(e=>({...e,[idx]:!e[idx]}))}
                cartasLevantadas={cartasLevantadas}
                onLevantarCarta={(idx,ci)=>setCartasLevantadas(cl=>({...cl,[idx]:cl[idx]===ci?-1:ci}))}
              />
            );
          })()}
        </div>

        {/* PANEL PEDIR — lateral derecho, solo visible en fase pedir */}
        {fase==="pedir"&&(
          <div style={{width:180,flexShrink:0,paddingTop:20}}>
            <PanelPedir
              totalBases={estructura[manoActual]}
              nombresMano={nombresPorEq(eqManoActual)}
              nombresEq={nombresPorEq(eqManoActual===0?1:0)}
              esManoEq0={eqManoActual===0}
              onConfirmar={confirmarPedidos}
              clock={clock}
              modoLento={clock.modoLento}
              nombreCapMano={eqManoActual===0 ? jugadores[capN]?.nombre : jugadores[capE]?.nombre}
              nombreCapPie={eqManoActual===0 ? jugadores[capE]?.nombre : jugadores[capN]?.nombre}
              kamikazesDisp={kamikazesDisp}
              kamikazeActivo={kamikazeDeclarado}
              onKamikaze={()=>{setKamikazesDisp(k=>k-1);setKamikazeDeclarado(true);}}
              onCancelarKamikaze={()=>{setKamikazesDisp(k=>k+1);setKamikazeDeclarado(false);}}
            />
          </div>
        )}
      </div>

      {/* MENÚ AS DE OROS */}
      {fase==="oros-menu"&&orosMenu&&(
        <div style={{background:"rgba(0,0,0,0.92)",border:"2px solid #c9a84c",borderRadius:12,padding:16,textAlign:"center",width:"100%",maxWidth:480,boxShadow:"0 0 30px rgba(201,168,76,0.2)"}}>
          <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",letterSpacing:3,marginBottom:6}}>AS DE OROS</div>
          <div style={{fontSize:13,color:"#f0d080",marginBottom:4}}>
            🟡 <b>{jugadores[orosMenu.jugadorIdx]?.nombre}</b> elige quién abre la siguiente base
          </div>
          <div style={{fontSize:10,color:"rgba(201,168,76,0.45)",marginBottom:12,fontStyle:"italic"}}>
            Solo {jugadores[orosMenu.jugadorIdx]?.nombre} puede confirmar
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {jugadores.filter(j=>j.eq===orosMenu.eqIdx).map(j=>{
              const idx=jugadores.indexOf(j);
              const esPortador=idx===orosMenu.jugadorIdx;
              return (
                <button key={idx}
                  onClick={()=>siguienteBase(idx)}
                  style={{
                    fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"9px 18px",
                    border:"2px solid #c9a84c",
                    borderRadius:6,
                    background:esPortador?"rgba(201,168,76,0.25)":"rgba(201,168,76,0.1)",
                    color:"#f0d080",
                    cursor:"pointer",
                    transition:"all 0.15s",
                    fontWeight:esPortador?"bold":"normal",
                  }}>
                  {j.nombre}{esPortador&&" 🟡"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MENÚ AS DE COPAS */}
      {fase==="copas-menu"&&(()=>{
        const enRonda = cartasMesa.length%nJugTotal || nJugTotal;
        const yaJugaron = new Set(cartasMesa.slice(-enRonda).map(x=>x.jugadorIdx));
        // sigNormal: siguiente en sentido antihorario normal (igual que siempre)
        // antihorario = índice decrece: (portador - 1 + N) % N, salteando los que ya tiraron
        const sigNormal = (()=>{
          for(let i=1;i<=nJugTotal;i++){
            const idx=(copasPortador - i + nJugTotal)%nJugTotal;
            if(!yaJugaron.has(idx)) return idx;
          }
          return copasPortador;
        })();
        // sigInvertido: siguiente en sentido horario (invertido)
        // horario = índice crece: (portador + 1) % N, salteando los que ya tiraron
        const sigInvertido = (()=>{
          for(let i=1;i<=nJugTotal;i++){
            const idx=(copasPortador+i)%nJugTotal;
            if(!yaJugaron.has(idx)) return idx;
          }
          return copasPortador;
        })();
        const esUltimo = mesaPendiente!==null || yaJugaron.size>=nJugTotal;
        const portadorNombre = jugadores[copasPortador]?.nombre;

        const elegir = (nuevoSentido) => {
          setSentido(nuevoSentido);
          setCopasMenu(false);
          setMesaPendiente(null);
          setJugadoresPendientes(null);
          if(esUltimo){
            // Resolver base con la ronda completa, luego siguiente base abre el ganador
            const ronda = mesaPendiente || cartasMesa.slice(-nJugTotal);
            const jAct = jugadoresPendientes || jugadores;
            resolverBase(ronda, jAct);
          } else {
            const sig = nuevoSentido===1 ? sigNormal : sigInvertido;
            setFase("jugar");
            setTurnoIdx(sig);
          }
        };

        return (
          <div style={{background:"rgba(0,0,0,0.92)",border:"2px solid #c0392b",borderRadius:12,padding:16,textAlign:"center",width:"100%",maxWidth:420,boxShadow:"0 0 30px rgba(192,57,43,0.2)"}}>
            <div style={{fontSize:10,color:"rgba(192,57,43,0.5)",letterSpacing:3,marginBottom:4}}>AS DE COPAS</div>
            <div style={{fontSize:13,color:"#f0d080",marginBottom:4}}>
              🏆 <b>{portadorNombre}</b> decide cómo sigue{esUltimo?" la próxima base":" la ronda"}
            </div>
            <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",marginBottom:12,fontStyle:"italic"}}>
              Solo {portadorNombre} puede confirmar
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>elegir(1)}
                style={{fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"10px 20px",border:"2px solid #4a9e6a",borderRadius:6,background:"rgba(74,158,106,0.15)",color:"#7ecf9e",cursor:"pointer"}}>
                ↺ Sigue
              </button>
              <button onClick={()=>elegir(-1)}
                style={{fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"10px 20px",border:"2px solid #c0392b",borderRadius:6,background:"rgba(192,57,43,0.15)",color:"#e88",cursor:"pointer"}}>
                ↻ Se da vuelta
              </button>
            </div>
          </div>
        );
      })()}

      {/* BOTONES */}
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",minHeight:44}}>
        {fase==="repartir"&&<Btn verde onClick={repartirMano}>Repartir {estructura[manoActual]} carta{estructura[manoActual]!==1?"s":""}</Btn>}
        {fase==="resolver"&&<Btn onClick={()=>siguienteBase()}>SIGUIENTE BASE →</Btn>}
        {fase==="cerrar"&&<Btn verde onClick={cerrarMano}>CERRAR MANO {manoActual+1}</Btn>}
      </div>

      {/* LOG */}
      <div style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(201,168,76,0.12)",borderRadius:8,padding:"7px 12px",fontSize:11,color:"rgba(201,168,76,0.6)",fontStyle:"italic",maxHeight:60,overflowY:"auto",width:"100%",lineHeight:1.6}}>
        {log.map((e,i)=><div key={i}>{e}</div>)}
      </div>

      {/* BOTÓN REINICIAR SIEMPRE VISIBLE */}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",width:"100%",marginTop:2}}>
        <button onClick={()=>setConfirmarReinicio(true)} style={{
          fontFamily:"Crimson Text, Georgia, serif",fontSize:10,padding:"4px 12px",
          border:"1px solid rgba(201,168,76,0.2)",borderRadius:5,
          background:"transparent",color:"rgba(201,168,76,0.35)",cursor:"pointer",
          letterSpacing:1,transition:"all 0.15s",
        }}>↺ reiniciar partida</button>
      </div>

      {/* MODAL CONFIRMAR REINICIO */}
      {confirmarReinicio&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"linear-gradient(135deg,#1a3d2b,#0f2519)",border:"2px solid #c9a84c",borderRadius:14,padding:28,textAlign:"center",maxWidth:340,width:"90%"}}>
            <div style={{fontSize:16,color:"#f0d080",marginBottom:8}}>¿Reiniciar la partida?</div>
            <div style={{fontSize:12,color:"rgba(201,168,76,0.5)",marginBottom:20,fontStyle:"italic"}}>Se perderá el progreso actual y se volverá al sorteo con la misma configuración.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmarReinicio(false)} style={{
                fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"9px 20px",
                border:"2px solid rgba(201,168,76,0.4)",borderRadius:6,
                background:"rgba(0,0,0,0.4)",color:"rgba(201,168,76,0.6)",cursor:"pointer",
              }}>Cancelar</button>
              <button onClick={()=>{setConfirmarReinicio(false);onReiniciar();}} style={{
                fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"9px 20px",
                border:"2px solid #c0392b",borderRadius:6,
                background:"rgba(192,57,43,0.15)",color:"#e88",cursor:"pointer",
              }}>Sí, reiniciar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
export default function App() {
  const [pantalla,setPantalla]=useState("inicio");
  const [datos,setDatos]=useState(null);

  // Cargar fuentes Google
  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap";
    document.head.appendChild(link);
    return ()=>document.head.removeChild(link);
  },[]);

  const handleReset = () => {
    setDatos(null);
    setPantalla("inicio");
  };

  const handleReiniciar = () => {
    // Vuelve al sorteo con la misma configuración
    setDatos(d => ({...d, pieIdx: undefined}));
    setPantalla("sorteo");
  };

  return (
    <div style={{background:"radial-gradient(ellipse at center, #0d2b1a 0%, #050f08 100%)",minHeight:"100vh",fontFamily:"Crimson Text, Georgia, serif",color:"#f0d080"}}>
      {pantalla==="inicio"&&(
        <PantallaInicio onIniciar={(nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug,dosMazos,ases)=>{
          setDatos({nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug:nJug||6,dosMazos:dosMazos||false,ases:ases||{espadas:true,copas:true,oros:true}});
          setPantalla("sorteo");
        }}/>
      )}
      {pantalla==="sorteo"&&datos&&(
        <PantallaSorteo
          jugadores={datos.nombres.map((nombre,i)=>({nombre,eq:i%2===0?0:1}))}
          onComenzar={(pieIdx)=>{setDatos(d=>({...d,pieIdx}));setPantalla("partida");}}
        />
      )}
      {pantalla==="partida"&&datos&&(
        <PantallaPartida
          jugadoresInit={datos.nombres}
          estructura={datos.estructura}
          tiempoInicial={datos.tiempoSeg}
          modoTiempo={datos.modoTiempo}
          pieInicial={datos.pieIdx}
          capN={datos.capN}
          capE={datos.capE}
          kamikazesIniciales={datos.kamikazes??1}
          nJug={datos.nJug??6}
          dosMazos={datos.dosMazos??false}
          ases={datos.ases??{espadas:true,copas:true,oros:true}}
          onReset={handleReset}
          onReiniciar={handleReiniciar}
        />
      )}
    </div>
  );
}
