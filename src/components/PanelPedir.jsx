import { useState, useEffect, useRef } from "react";
import { opcionesValidas } from "../engine/bidding";

// ══════════════════════════════════════════════
// PANEL LATERAL DE PEDIR (no tapa la mesa)
// ══════════════════════════════════════════════
export function PanelPedir({ totalBases, nombresMano, nombresEq, esManoEq0, onConfirmar, clock, modoLento, nombreCapMano, nombreCapPie, kamikazesDisp, onKamikaze, kamikazeActivo, onCancelarKamikaze }) {
  const [pedidoMano, setPedidoMano] = useState(null);
  const [pedidoPie, setPedidoPie] = useState(null);
  const [subFase, setSubFase] = useState("mano");
  // Countdown de 10s modo deportivo
  const [countdown, setCountdown] = useState(null);
  const countRef = useRef(null);

  // Arrancar countdown de 10s cuando modoLento está activo y empieza una subfase
  useEffect(()=>{
    if(!modoLento) return;
    setCountdown(10);
    clearInterval(countRef.current);
    countRef.current = setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){
          clearInterval(countRef.current);
          // Auto-confirmar con 0 si no eligieron nada
          if(subFase==="mano"){
            const val = pedidoMano ?? 0;
            const ops = opcionesValidas(val, totalBases);
            if(ops.length===1){
              // Auto-confirmar pie también
              const pedN = esManoEq0 ? val : ops[0];
              const pedE = esManoEq0 ? ops[0] : val;
              onConfirmar(pedN, pedE);
            } else {
              setPedidoMano(val);
              const eqPie = esManoEq0 ? 1 : 0;
              clock.iniciarPara(eqPie);
              setSubFase("pie");
            }
          } else {
            const opsPie = opcionesValidas(pedidoMano??0, totalBases);
            const val = (pedidoPie!==null && opsPie.includes(pedidoPie)) ? pedidoPie : opsPie[0]??0;
            clock.detener();
            const pedN = esManoEq0 ? (pedidoMano??0) : val;
            const pedE = esManoEq0 ? val : (pedidoMano??0);
            onConfirmar(pedN, pedE);
          }
          return 0;
        }
        return c-1;
      });
    },1000);
    return ()=>clearInterval(countRef.current);
  },[subFase, modoLento]);

  const confirmarMano = () => {
    if (pedidoMano === null) return;
    clearInterval(countRef.current);
    const ops = opcionesValidas(pedidoMano, totalBases);
    if (ops.length === 1) {
      // Pie no tiene elección — auto-confirmar sin correr reloj
      const pedN = esManoEq0 ? pedidoMano : ops[0];
      const pedE = esManoEq0 ? ops[0] : pedidoMano;
      onConfirmar(pedN, pedE);
      return;
    }
    const eqPie = esManoEq0 ? 1 : 0;
    clock.iniciarPara(eqPie);
    setSubFase("pie");
  };

  const confirmarPie = () => {
    if (pedidoPie === null) return;
    clearInterval(countRef.current);
    clock.detener();
    const pedN = esManoEq0 ? pedidoMano : pedidoPie;
    const pedE = esManoEq0 ? pedidoPie : pedidoMano;
    onConfirmar(pedN, pedE);
  };

  const opsPie = pedidoMano !== null ? opcionesValidas(pedidoMano, totalBases) : [];
  const numProhibido = pedidoMano !== null ? totalBases - pedidoMano : null;

  const btnNum = (n, seleccionado, onSelect, prohibido) => (
    <button key={n} onClick={() => !prohibido && onSelect(n)} style={{
      fontFamily:"Georgia", fontSize:16, fontWeight:"bold",
      width:40, height:40, borderRadius:7,
      border:`2px solid ${prohibido?"rgba(200,50,50,0.4)":seleccionado===n?"#c9a84c":"rgba(201,168,76,0.25)"}`,
      background: prohibido?"rgba(200,50,50,0.08)":seleccionado===n?"rgba(201,168,76,0.22)":"rgba(0,0,0,0.3)",
      color: prohibido?"rgba(200,50,50,0.4)":seleccionado===n?"#f0d080":"rgba(201,168,76,0.45)",
      cursor: prohibido?"not-allowed":"pointer", transition:"all 0.15s",
      textDecoration: prohibido?"line-through":"none",
    }}>{n}</button>
  );

  const eqManoColor = esManoEq0 ? "#5b9bd5" : "#e07b54";
  const eqPieColor = esManoEq0 ? "#e07b54" : "#5b9bd5";

  return (
    <div style={{
      background:"rgba(5,15,10,0.97)",
      border:`2px solid ${subFase==="mano" ? eqManoColor : eqPieColor}`,
      borderRadius:12, padding:"14px 16px", width:"100%",
      boxShadow:"0 0 24px rgba(0,0,0,0.8)",
    }}>
      <div style={{ fontSize:10, color:"rgba(201,168,76,0.4)", letterSpacing:2, marginBottom:8, textAlign:"center" }}>
        {totalBases} BASE{totalBases!==1?"S":""} EN JUEGO
        {modoLento && <span style={{ color:"#e05555", marginLeft:8 }}>⚡ MODO RÁPIDO</span>}
      </div>

      {/* Countdown modo deportivo */}
      {modoLento && countdown!==null && (
        <div style={{textAlign:"center",marginBottom:6}}>
          <span style={{
            fontSize:28,fontWeight:"bold",fontFamily:"monospace",
            color:countdown<=3?"#e05555":countdown<=6?"#e07b54":"#f0d080",
          }}>{countdown}</span>
          <span style={{fontSize:10,color:"rgba(201,168,76,0.5)",marginLeft:4}}>seg</span>
        </div>
      )}

      {subFase === "mano" ? (
        <>
          <div style={{ fontSize:12, color:eqManoColor, fontWeight:"bold", marginBottom:2, textAlign:"center", letterSpacing:1 }}>
            MANO — ¿CUÁNTAS PEDÍS?
          </div>
          <div style={{ fontSize:10, color:"rgba(201,168,76,0.4)", marginBottom:4, textAlign:"center" }}>
            {nombresMano.join(" · ")}
          </div>
          <div style={{ fontSize:9, color:"#c9a84c", marginBottom:8, textAlign:"center", letterSpacing:1 }}>
            ★ Confirma: {nombreCapMano}
          </div>
          {kamikazesDisp>0&&!kamikazeActivo&&totalBases>2&&(
            <button onClick={onKamikaze} style={{
              width:"100%",padding:"6px",fontFamily:"Cinzel, Georgia, serif",fontSize:13,letterSpacing:1,
              border:"2px solid rgba(200,80,80,0.5)",borderRadius:6,
              background:"rgba(200,50,50,0.1)",color:"#e07070",
              cursor:"pointer",marginBottom:6,transition:"all 0.15s",
            }}>✈️ {kamikazesDisp}</button>
          )}
          {kamikazeActivo&&(
            <div style={{marginBottom:6}}>
              <div style={{textAlign:"center",fontSize:10,color:"#e05555",letterSpacing:1,padding:"4px 8px",border:"1px solid rgba(200,50,50,0.4)",borderRadius:6,background:"rgba(200,50,50,0.08)",marginBottom:4}}>
                ✈️ KAMIKAZE — elegí 0 o {totalBases}
              </div>
              <button onClick={()=>{setPedidoMano(null);onCancelarKamikaze();}} style={{
                width:"100%",padding:"4px",fontFamily:"Crimson Text, Georgia, serif",fontSize:10,letterSpacing:1,
                border:"1px solid rgba(201,168,76,0.3)",borderRadius:6,
                background:"rgba(0,0,0,0.3)",color:"rgba(201,168,76,0.5)",
                cursor:"pointer",transition:"all 0.15s",
              }}>✕ cancelar kamikaze</button>
            </div>
          )}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"center", marginBottom:10 }}>
            {(kamikazeActivo?[0,totalBases]:Array.from({length:totalBases+1},(_,i)=>i)).map(n => btnNum(n, pedidoMano, setPedidoMano, false))}
          </div>
          <button onClick={confirmarMano} disabled={pedidoMano===null} style={{
            width:"100%", padding:"8px", fontFamily:"Georgia", fontSize:12, letterSpacing:1,
            border:`2px solid ${pedidoMano!==null?eqManoColor:"rgba(201,168,76,0.2)"}`,
            borderRadius:6, background:pedidoMano!==null?"rgba(201,168,76,0.15)":"rgba(0,0,0,0.3)",
            color:pedidoMano!==null?eqManoColor:"rgba(201,168,76,0.3)",
            cursor:pedidoMano!==null?"pointer":"not-allowed", transition:"all 0.15s",
          }}>★ {nombreCapMano} CONFIRMA →</button>
        </>
      ) : (
        <>
          <div style={{ fontSize:11, color:"rgba(201,168,76,0.5)", marginBottom:4, textAlign:"center" }}>
            Mano pidió <b style={{color:"#f0d080",fontSize:15}}>{pedidoMano}</b>
          </div>
          <div style={{ fontSize:12, color:eqPieColor, fontWeight:"bold", marginBottom:2, textAlign:"center", letterSpacing:1 }}>
            PIE — ¿CUÁNTAS PEDÍS?
          </div>
          <div style={{ fontSize:10, color:"rgba(201,168,76,0.4)", marginBottom:4, textAlign:"center" }}>
            {nombresEq.join(" · ")}
          </div>
          <div style={{ fontSize:9, color:"#c9a84c", marginBottom:8, textAlign:"center", letterSpacing:1 }}>
            ★ Confirma: {nombreCapPie}
          </div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"center", marginBottom:10 }}>
            {opsPie.map(n => btnNum(n, pedidoPie, setPedidoPie, false))}
          </div>
          <button onClick={confirmarPie} disabled={pedidoPie===null} style={{
            width:"100%", padding:"8px", fontFamily:"Georgia", fontSize:12, letterSpacing:1,
            border:`2px solid ${pedidoPie!==null?eqPieColor:"rgba(201,168,76,0.2)"}`,
            borderRadius:6, background:pedidoPie!==null?"rgba(201,168,76,0.15)":"rgba(0,0,0,0.3)",
            color:pedidoPie!==null?eqPieColor:"rgba(201,168,76,0.3)",
            cursor:pedidoPie!==null?"pointer":"not-allowed", transition:"all 0.15s",
          }}>★ {nombreCapPie} CONFIRMA →</button>
        </>
      )}
    </div>
  );
}
