import { useState, useEffect, useRef } from "react";
import { opcionesValidas } from "../engine/bidding";
import { colors, fonts, bevel, filaStyle, segmentedOptionStyle, secondaryBtnStyle } from "../theme";

// ══════════════════════════════════════════════
// PANEL LATERAL DE PEDIR (no tapa la mesa)
// ══════════════════════════════════════════════
// `pedidoManoInicial` y `modoUnEquipo` son solo para la sala online (pieza
// 5d): ahí el pedido de mano y el de pie los confirman dos capitanes en dos
// sesiones distintas (a diferencia del hotseat, donde ambos pasan por esta
// misma instancia). `pedidoManoInicial` arranca directo en la subfase "pie"
// con el pedido de mano ya conocido, en vez de forzar a elegir "mano" de
// nuevo. `modoUnEquipo` hace que confirmar la subfase visible llame a
// onConfirmar YA, con un solo valor (el de esa subfase) — nunca transiciona
// internamente de "mano" a "pie", porque esa transición implicaría pedirle
// el pedido al OTRO equipo dentro de la misma sesión, y ese es exactamente
// el capitán que no está sentado frente a esta pantalla.
export function PanelPedir({ totalBases, nombresMano, nombresEq, esManoEq0, onConfirmar, clock, modoLento, nombreCapMano, nombreCapPie, kamikazesDisp, onKamikaze, kamikazeActivo, onCancelarKamikaze, pedidoManoInicial=null, modoUnEquipo=false }) {
  const [pedidoMano, setPedidoMano] = useState(pedidoManoInicial);
  const [pedidoPie, setPedidoPie] = useState(null);
  const [subFase, setSubFase] = useState(pedidoManoInicial!==null ? "pie" : "mano");
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
            if (modoUnEquipo) {
              onConfirmar(val);
            } else {
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
            }
          } else {
            const opsPie = opcionesValidas(pedidoMano??0, totalBases);
            const val = (pedidoPie!==null && opsPie.includes(pedidoPie)) ? pedidoPie : opsPie[0]??0;
            clock.detener();
            if (modoUnEquipo) {
              onConfirmar(val);
            } else {
              const pedN = esManoEq0 ? (pedidoMano??0) : val;
              const pedE = esManoEq0 ? val : (pedidoMano??0);
              onConfirmar(pedN, pedE);
            }
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
    if (modoUnEquipo) {
      onConfirmar(pedidoMano);
      return;
    }
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
    if (modoUnEquipo) {
      onConfirmar(pedidoPie);
      return;
    }
    const pedN = esManoEq0 ? pedidoMano : pedidoPie;
    const pedE = esManoEq0 ? pedidoPie : pedidoMano;
    onConfirmar(pedN, pedE);
  };

  const opsPie = pedidoMano !== null ? opcionesValidas(pedidoMano, totalBases) : [];
  const numProhibido = pedidoMano !== null ? totalBases - pedidoMano : null;

  // Reusa segmentedOptionStyle (mismo picker que cantidad de jugadores en
  // PantallaOnlineCrear) para normal/seleccionado; "prohibido" (kamikaze
  // exige 0 o el total) se superpone encima con el acento de peligro.
  const btnNum = (n, seleccionado, onSelect, prohibido) => (
    <button key={n} onClick={() => !prohibido && onSelect(n)} style={{
      ...segmentedOptionStyle(seleccionado===n),
      width: 25, height: 25, padding: 0, fontSize: 12,
      display: "flex", alignItems: "center", justifyContent: "center",
      ...(prohibido ? {
        border: `1px solid ${colors.danger.border}`,
        background: "rgba(255,90,90,0.08)",
        color: "rgba(255,154,154,0.5)",
        boxShadow: bevel,
        cursor: "not-allowed",
        textDecoration: "line-through",
      } : {}),
    }}>{n}</button>
  );

  const teamMano = esManoEq0 ? "local" : "visitante";
  const teamPie = esManoEq0 ? "visitante" : "local";
  const eqManoColor = colors.team[teamMano].accent;
  const eqPieColor = colors.team[teamPie].accent;
  const teamActual = subFase==="mano" ? teamMano : teamPie;

  const labelStyle = { fontFamily: fonts.body, fontWeight: 600 };
  const confirmBtnStyle = (habilitado, team) => ({
    ...filaStyle(team, { listo: habilitado }),
    width: "100%", textAlign: "center", justifyContent: "center",
    padding: "5px 12px",
    fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 12, letterSpacing: 1,
    color: colors.text.primary,
    opacity: habilitado ? 1 : 0.5,
    cursor: habilitado ? "pointer" : "not-allowed",
  });

  // Piece Y (batch overnight post-5r): sin fondo/borde propio — este panel
  // ahora vive adentro de la elipse "mesa" de MesaCircular.jsx
  // (contenidoBidding), que ya tiene su propio borde/fondo; dibujar otro
  // acá encima se leía como una caja pegada sobre la mesa en vez de parte
  // de ella.
  return (
    <div style={{
      width: "100%", padding: "2px 4px",
    }}>
      <div style={{ ...labelStyle, fontSize:9, color:colors.text.secondary, letterSpacing:1.5, marginBottom:1, textAlign:"center" }}>
        {totalBases} BASE{totalBases!==1?"S":""} EN JUEGO
        {modoLento && <span style={{ color:colors.negative, marginLeft:8 }}>⚡ MODO RÁPIDO</span>}
      </div>

      {/* Countdown modo deportivo */}
      {modoLento && countdown!==null && (
        <div style={{textAlign:"center",marginBottom:3}}>
          <span style={{
            fontSize:28,fontFamily:fonts.display,fontWeight:800,fontStyle:"italic",
            color:countdown<=3?colors.negative:countdown<=6?colors.cta.border:colors.text.primary,
          }}>{countdown}</span>
          <span style={{ ...labelStyle, fontSize:10,color:colors.text.secondary,marginLeft:4}}>seg</span>
        </div>
      )}

      {subFase === "mano" ? (
        <>
          <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:11, color:eqManoColor, marginBottom:1, textAlign:"center", letterSpacing:1 }}>
            MANO — ¿CUÁNTAS PEDÍS?
          </div>
          <div style={{ ...labelStyle, fontSize:8, color:colors.text.secondary, marginBottom:1, textAlign:"center" }}>
            {nombresMano.join(" · ")}
          </div>
          <div style={{ ...labelStyle, fontSize:8, color:eqManoColor, marginBottom:2, textAlign:"center", letterSpacing:1 }}>
            ★ Confirma: {nombreCapMano}
          </div>
          {kamikazesDisp>0&&!kamikazeActivo&&totalBases>2&&(
            <button onClick={onKamikaze} style={{
              width:"100%",padding:"2px",fontFamily:fonts.display,fontWeight:700,fontStyle:"italic",fontSize:11,letterSpacing:1,
              borderRadius:999,
              border:`1px solid ${colors.danger.border}`,
              background:"rgba(255,90,90,0.1)",color:"#ff9a9a",
              cursor:"pointer",marginBottom:2,transition:"all 0.15s",boxShadow:bevel,
            }}>✈️ {kamikazesDisp}</button>
          )}
          {kamikazeActivo&&(
            <div style={{marginBottom:2}}>
              <div style={{textAlign:"center",fontSize:8,color:colors.text.primary,letterSpacing:1,padding:"2px 5px",borderRadius:999,border:`1px solid ${colors.danger.border}`,background:"rgba(255,90,90,0.14)",marginBottom:2,fontFamily:fonts.body,fontWeight:600,boxShadow:bevel}}>
                ✈️ KAMIKAZE — elegí 0 o {totalBases}
              </div>
              <button onClick={()=>{setPedidoMano(null);onCancelarKamikaze();}} style={{
                ...secondaryBtnStyle({ full: true }), padding:"2px", fontSize:8, letterSpacing:1,
              }}>✕ cancelar kamikaze</button>
            </div>
          )}
          <div style={{ display:"flex", gap:3, flexWrap:"wrap", justifyContent:"center", marginBottom:3 }}>
            {(kamikazeActivo?[0,totalBases]:Array.from({length:totalBases+1},(_,i)=>i)).map(n => btnNum(n, pedidoMano, setPedidoMano, false))}
          </div>
          <button onClick={confirmarMano} disabled={pedidoMano===null} style={confirmBtnStyle(pedidoMano!==null, teamMano)}>
            ★ {nombreCapMano} CONFIRMA →
          </button>
        </>
      ) : (
        <>
          <div style={{ ...labelStyle, fontSize:9, color:colors.text.secondary, marginBottom:1, textAlign:"center" }}>
            Mano pidió <b style={{color:colors.text.primary,fontSize:12}}>{pedidoMano}</b>
          </div>
          <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:11, color:eqPieColor, marginBottom:1, textAlign:"center", letterSpacing:1 }}>
            PIE — ¿CUÁNTAS PEDÍS?
          </div>
          <div style={{ ...labelStyle, fontSize:8, color:colors.text.secondary, marginBottom:1, textAlign:"center" }}>
            {nombresEq.join(" · ")}
          </div>
          <div style={{ ...labelStyle, fontSize:8, color:eqPieColor, marginBottom:2, textAlign:"center", letterSpacing:1 }}>
            ★ Confirma: {nombreCapPie}
          </div>
          <div style={{ display:"flex", gap:3, flexWrap:"wrap", justifyContent:"center", marginBottom:3 }}>
            {opsPie.map(n => btnNum(n, pedidoPie, setPedidoPie, false))}
          </div>
          <button onClick={confirmarPie} disabled={pedidoPie===null} style={confirmBtnStyle(pedidoPie!==null, teamPie)}>
            ★ {nombreCapPie} CONFIRMA →
          </button>
        </>
      )}
    </div>
  );
}
