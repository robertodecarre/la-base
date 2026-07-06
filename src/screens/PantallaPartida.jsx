import { useState, useCallback } from "react";
import { nv } from "../engine/cards";
import { crearMazo, mezclar } from "../engine/deck";
import { siguienteTurno } from "../engine/turn";
import { resolverBase as calcularGanadorBase, ganadorParcial, detectarTriggerOros } from "../engine/trick";
import { evaluarCierreMano } from "../engine/hand";
import { useClock } from "../hooks/useClock";
import { DisplayReloj } from "../components/DisplayReloj";
import { PanelPedir } from "../components/PanelPedir";
import { MesaCircular } from "../components/MesaCircular";
import { Tablero } from "../components/Tablero";
import { EstrellasPedido } from "../components/EstrellasPedido";
import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA PARTIDA
// ══════════════════════════════════════════════
export function PantallaPartida({ jugadoresInit, estructura, tiempoInicial, modoTiempo, pieInicial, capN, capE, kamikazesIniciales, nJug, dosMazos, ases, onReset, onReiniciar }) {
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
      setCopasPortador(jugIdx);
      setCopasMenu(true);
      setFase("copas-menu");
      return;
    }

    if(nuevosMesa.length%nJugTotal===0){resolverBase(nuevosMesa.slice(-nJugTotal),nuevosJ);}
    else{
      setTurnoIdx(siguienteTurno(jugIdx, nJugTotal, sentido));
    }
  };

  const resolverBase=(ronda,jActuales)=>{
    const {ganIdx, viaSuperpoderEspadas} = calcularGanadorBase(ronda);
    if(viaSuperpoderEspadas){
      addLog(`¡As de Espadas mata al Ancho de Bastos!`);
    }

    const nuevaBase=baseNum+1;
    const nuevosJ=jActuales.map((j,i)=>i===ganIdx?{...j,bases:j.bases+1}:j);
    setJugadores(nuevosJ);setBaseNum(nuevaBase);setGanadorBase(ganIdx);
    addLog(`BASE ${nuevaBase}: ¡${jActuales[ganIdx].nombre} gana!`);

    // As de oros: solo si el superpoder está activado
    const orosTrigger = detectarTriggerOros(ronda, jActuales, ganIdx, ases);
    if(orosTrigger && nuevaBase<estructura[manoActual]){
      addLog(`🟡 As de Oros: ${jActuales[orosTrigger.jugadorIdx].nombre} elige quién abre la siguiente base.`);
      setOrosMenu(orosTrigger);
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
    const {deltaN,deltaE,pedN,pedE,hechoN,hechoE,noDeclarado}=evaluarCierreMano({jugadores,pedidos,manoJugIdx,kamikazeDeclarado});
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
            const ganaActual = ganadorParcial(rondaActual, ases);
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
