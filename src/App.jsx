import { useState, useEffect, useRef, useCallback } from "react";
import { nv } from "./engine/cards";
import { crearMazo, mezclar } from "./engine/deck";
import { jerarquia } from "./engine/hierarchy";
import { calcularPuntos } from "./engine/scoring";
import { opcionesValidas } from "./engine/bidding";
import { ESTRUCTURAS, maxCartas, NOMBRES_POR_CANT, posEnCirculo } from "./engine/structures";

function fmtTiempo(seg) {
  if (seg <= 0) return "0:00";
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ══════════════════════════════════════════════
// RELOJ DE AJEDREZ
// ══════════════════════════════════════════════
function useClock(tiempoInicialN, tiempoInicialE, modoTiempo, onAgotado) {
  const [tiempoN, setTiempoN] = useState(tiempoInicialN); // segundos
  const [tiempoE, setTiempoE] = useState(tiempoInicialE);
  const [corriendo, setCorriendo] = useState(null); // null | 0 | 1 (eq que descuenta)
  const [agotadoN, setAgotadoN] = useState(false);
  const [agotadoE, setAgotadoE] = useState(false);
  // modo deportivo: si se agotó, tiene 10s por mano
  const [modoLento, setModoLento] = useState(false);
  const intervalo = useRef(null);

  const detener = useCallback(() => {
    clearInterval(intervalo.current);
    setCorriendo(null);
  }, []);

  const iniciarPara = useCallback((eq) => {
    // Si no hay tiempo configurado, no arrancar el reloj
    if (!tiempoInicialN && !tiempoInicialE) return;
    clearInterval(intervalo.current);
    setCorriendo(eq);
    intervalo.current = setInterval(() => {
      if (eq === 0) {
        setTiempoN(t => {
          const nuevo = t - 1;
          if (nuevo <= 0) {
            clearInterval(intervalo.current);
            setCorriendo(null);
            if (modoTiempo === "muerte") { setAgotadoN(true); onAgotado(0); }
            else { setAgotadoN(true); setModoLento(true); }
            return 0;
          }
          return nuevo;
        });
      } else {
        setTiempoE(t => {
          const nuevo = t - 1;
          if (nuevo <= 0) {
            clearInterval(intervalo.current);
            setCorriendo(null);
            if (modoTiempo === "muerte") { setAgotadoE(true); onAgotado(1); }
            else { setAgotadoE(true); setModoLento(true); }
            return 0;
          }
          return nuevo;
        });
      }
    }, 1000);
  }, [modoTiempo, onAgotado]);

  useEffect(() => () => clearInterval(intervalo.current), []);

  return { tiempoN, tiempoE, corriendo, agotadoN, agotadoE, modoLento, iniciarPara, detener };
}

// ══════════════════════════════════════════════
// DISPLAY RELOJ
// ══════════════════════════════════════════════
function DisplayReloj({ tiempoN, tiempoE, corriendo, agotadoN, agotadoE, modoLento, modoTiempo, hayTiempo }) {
  if (!hayTiempo) return null;
  const eqN = corriendo === 0, eqE = corriendo === 1;

  const relojStyle = (activo, agotado, tiempo) => ({
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "8px 14px", borderRadius: 8, minWidth: 80,
    background: agotado ? "rgba(200,50,50,0.2)" : activo ? "rgba(201,168,76,0.15)" : "rgba(0,0,0,0.3)",
    border: `1.5px solid ${agotado ? "#e05555" : activo ? "#c9a84c" : "rgba(201,168,76,0.2)"}`,
    transition: "all 0.3s",
  });

  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"center" }}>
      <div style={relojStyle(eqN, agotadoN, tiempoN)}>
        <div style={{ fontSize:9, color:"#5b9bd5", letterSpacing:1, marginBottom:2 }}>NOSOTROS</div>
        <div style={{ fontSize:22, fontWeight:"bold", color: agotadoN?"#e05555": tiempoN<30?"#e07b54":"#f0d080", fontFamily:"monospace", lineHeight:1 }}>
          {modoLento && agotadoN ? "10s/m" : fmtTiempo(tiempoN)}
        </div>
        {eqN && <div style={{ fontSize:8, color:"#c9a84c", marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>

      <div style={{ fontSize:10, color:"rgba(201,168,76,0.3)" }}>
        {modoTiempo === "muerte" ? "⚡" : "🏃"}
      </div>

      <div style={relojStyle(eqE, agotadoE, tiempoE)}>
        <div style={{ fontSize:9, color:"#e07b54", letterSpacing:1, marginBottom:2 }}>ELLOS</div>
        <div style={{ fontSize:22, fontWeight:"bold", color: agotadoE?"#e05555": tiempoE<30?"#e07b54":"#f0d080", fontFamily:"monospace", lineHeight:1 }}>
          {modoLento && agotadoE ? "10s/m" : fmtTiempo(tiempoE)}
        </div>
        {eqE && <div style={{ fontSize:8, color:"#c9a84c", marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PANEL LATERAL DE PEDIR (no tapa la mesa)
// ══════════════════════════════════════════════
function PanelPedir({ totalBases, nombresMano, nombresEq, esManoEq0, onConfirmar, clock, modoLento, nombreCapMano, nombreCapPie, kamikazesDisp, onKamikaze, kamikazeActivo, onCancelarKamikaze }) {
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

// ══════════════════════════════════════════════
// DISEÑO DE CARTAS
// ══════════════════════════════════════════════

// Palo central decorativo
function PaloDecorativo({ palo, cx, cy, size }) {
  const c = palo.col;
  const s = size;
  if (palo.n === "Oros") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={s*0.42} fill="#d4a020" stroke="#8B6914" strokeWidth={s*0.06}/>
        <circle cx={cx} cy={cy} r={s*0.28} fill="#f5c842" stroke="#8B6914" strokeWidth={s*0.04}/>
        <circle cx={cx} cy={cy} r={s*0.12} fill="#fffbe0"/>
      </g>
    );
  }
  if (palo.n === "Copas") {
    return (
      <g fill={c}>
        <path d={`M ${cx} ${cy+s*0.45} Q ${cx-s*0.5} ${cy+s*0.1} ${cx-s*0.5} ${cy-s*0.1} A ${s*0.32} ${s*0.32} 0 0 1 ${cx} ${cy-s*0.05} A ${s*0.32} ${s*0.32} 0 0 1 ${cx+s*0.5} ${cy-s*0.1} Q ${cx+s*0.5} ${cy+s*0.1} ${cx} ${cy+s*0.45} Z`}/>
        <rect x={cx-s*0.06} y={cy+s*0.44} width={s*0.12} height={s*0.22} rx={s*0.03}/>
        <rect x={cx-s*0.22} y={cy+s*0.63} width={s*0.44} height={s*0.08} rx={s*0.04}/>
      </g>
    );
  }
  if (palo.n === "Espadas") {
    return (
      <g fill={c}>
        <polygon points={`${cx},${cy-s*0.48} ${cx+s*0.18},${cy+s*0.2} ${cx-s*0.18},${cy+s*0.2}`}/>
        <path d={`M ${cx-s*0.35} ${cy+s*0.25} Q ${cx-s*0.1} ${cy+s*0.38} ${cx} ${cy+s*0.28} Q ${cx+s*0.1} ${cy+s*0.38} ${cx+s*0.35} ${cy+s*0.25}`} fill="none" stroke={c} strokeWidth={s*0.1}/>
        <rect x={cx-s*0.06} y={cy+s*0.28} width={s*0.12} height={s*0.22} rx={s*0.03}/>
      </g>
    );
  }
  if (palo.n === "Bastos") {
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={s*0.12} ry={s*0.48} fill={c} rx={s*0.12}/>
        <ellipse cx={cx-s*0.3} cy={cy-s*0.15} rx={s*0.28} ry={s*0.1} fill={c} transform={`rotate(-35,${cx-s*0.3},${cy-s*0.15})`}/>
        <ellipse cx={cx+s*0.3} cy={cy-s*0.15} rx={s*0.28} ry={s*0.1} fill={c} transform={`rotate(35,${cx+s*0.3},${cy-s*0.15})`}/>
        <circle cx={cx} cy={cy-s*0.48} r={s*0.12} fill={c}/>
        <circle cx={cx-s*0.38} cy={cy-s*0.22} r={s*0.1} fill={c}/>
        <circle cx={cx+s*0.38} cy={cy-s*0.22} r={s*0.1} fill={c}/>
      </g>
    );
  }
  return null;
}

// As de Bastos — el Ancho, carta más poderosa
function AsBastos({ w, h }) {
  const cx=w/2, cy=h/2, c="#2d4a1e";
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#5a3a1a" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke="#c0392b" strokeWidth={0.8}/>
      {/* Basto central grueso y nudoso */}
      <rect x={cx-w*0.08} y={h*0.1} width={w*0.16} height={h*0.75} rx={w*0.06} fill="#5a3a1a"/>
      {/* Nudos */}
      <circle cx={cx-w*0.06} cy={h*0.28} r={w*0.09} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      <circle cx={cx+w*0.06} cy={h*0.45} r={w*0.08} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      <circle cx={cx-w*0.05} cy={h*0.62} r={w*0.08} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      {/* Corona superior */}
      <polygon points={`${cx-w*0.12},${h*0.1} ${cx},${h*0.02} ${cx+w*0.12},${h*0.1}`} fill="#c9a84c"/>
      {/* Etiqueta ANCHO */}
      <text x={cx} y={h*0.96} textAnchor="middle" fontSize={Math.max(4,w*0.18)} fill="#c0392b" fontFamily="Cinzel, Georgia, serif" fontWeight="bold">ANCHO</text>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
    </g>
  );
}

// As de Oros — círculo dorado elaborado
function AsOros({ w, h }) {
  const cx=w/2, cy=h/2;
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke="#d4a020" strokeWidth={0.6}/>
      {/* Disco exterior */}
      <circle cx={cx} cy={cy} r={w*0.38} fill="#d4a020" stroke="#8B6914" strokeWidth={1}/>
      {/* Rayos */}
      {[0,45,90,135].map(a => (
        <line key={a}
          x1={cx + Math.cos(a*Math.PI/180)*w*0.2} y1={cy + Math.sin(a*Math.PI/180)*w*0.2}
          x2={cx + Math.cos(a*Math.PI/180)*w*0.36} y2={cy + Math.sin(a*Math.PI/180)*w*0.36}
          stroke="#8B6914" strokeWidth={0.8}/>
      ))}
      {[0,45,90,135].map(a => (
        <line key={a+"b"}
          x1={cx + Math.cos((a+22.5)*Math.PI/180)*w*0.22} y1={cy + Math.sin((a+22.5)*Math.PI/180)*w*0.22}
          x2={cx + Math.cos((a+22.5)*Math.PI/180)*w*0.36} y2={cy + Math.sin((a+22.5)*Math.PI/180)*w*0.36}
          stroke="#8B6914" strokeWidth={0.5}/>
      ))}
      {/* Disco medio */}
      <circle cx={cx} cy={cy} r={w*0.22} fill="#f5c842" stroke="#8B6914" strokeWidth={0.8}/>
      {/* Disco interior */}
      <circle cx={cx} cy={cy} r={w*0.1} fill="#fffbe0" stroke="#d4a020" strokeWidth={0.6}/>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill="#8B6914" fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill="#8B6914" fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}

// As de Copas — copa clásica española
function AsCopas({ w, h }) {
  const cx=w/2, cy=h/2, c="#c0392b";
  // Copa: bowl arriba, tallo fino, base ancha
  const bowlTop = cy - h*0.32;
  const bowlBot = cy + h*0.08;
  const stalkTop = bowlBot;
  const stalkBot = cy + h*0.34;
  const baseY = stalkBot;
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.6}/>

      {/* Bowl de la copa — forma cónica abierta arriba */}
      <path d={`
        M ${cx-w*0.32} ${bowlTop}
        L ${cx-w*0.18} ${bowlBot}
        L ${cx+w*0.18} ${bowlBot}
        L ${cx+w*0.32} ${bowlTop}
        Z
      `} fill={c}/>
      {/* Borde superior del bowl */}
      <line x1={cx-w*0.34} y1={bowlTop} x2={cx+w*0.34} y2={bowlTop} stroke={c} strokeWidth={w*0.06} strokeLinecap="round"/>
      {/* Brillo interior */}
      <path d={`M ${cx-w*0.24} ${bowlTop+h*0.02} L ${cx-w*0.14} ${bowlBot-h*0.02} L ${cx-w*0.06} ${bowlBot-h*0.02} L ${cx-w*0.14} ${bowlTop+h*0.02} Z`}
        fill="rgba(255,255,255,0.18)"/>

      {/* Tallo */}
      <path d={`M ${cx-w*0.06} ${stalkTop} Q ${cx-w*0.02} ${(stalkTop+stalkBot)/2} ${cx-w*0.04} ${stalkBot}`}
        fill="none" stroke={c} strokeWidth={w*0.1} strokeLinecap="round"/>

      {/* Base — trapezoide ancho */}
      <path d={`M ${cx-w*0.36} ${baseY+h*0.09} L ${cx-w*0.22} ${baseY} L ${cx+w*0.22} ${baseY} L ${cx+w*0.36} ${baseY+h*0.09} Z`}
        fill={c}/>

      {/* Valor */}
      <text x={2.5} y={h*0.14} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}

// As de Espadas
function AsEspadas({ w, h }) {
  const cx=w/2, cy=h/2, c="#1a1a2e";
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.6}/>
      {/* Hoja de espada */}
      <polygon points={`${cx},${cy-h*0.38} ${cx+w*0.2},${cy+h*0.18} ${cx},${cy+h*0.08} ${cx-w*0.2},${cy+h*0.18}`} fill={c}/>
      {/* Brillo en hoja */}
      <polygon points={`${cx},${cy-h*0.35} ${cx+w*0.04},${cy+h*0.1} ${cx},${cy+h*0.05}`} fill="rgba(255,255,255,0.25)"/>
      {/* Guarda */}
      <path d={`M ${cx-w*0.38} ${cy+h*0.2} Q ${cx-w*0.1} ${cy+h*0.32} ${cx} ${cy+h*0.22} Q ${cx+w*0.1} ${cy+h*0.32} ${cx+w*0.38} ${cy+h*0.2}`} fill="none" stroke={c} strokeWidth={w*0.09} strokeLinecap="round"/>
      {/* Mango */}
      <rect x={cx-w*0.06} y={cy+h*0.22} width={w*0.12} height={h*0.2} rx={w*0.03} fill="#8B5020"/>
      {/* Pommel */}
      <circle cx={cx} cy={cy+h*0.42} r={w*0.08} fill={c}/>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}

// ── Caballo: jinete real montado a caballo ────────────────────────────
function CaballoSVG({ palo, w, h }) {
  const cx=w/2, c=palo.col;
  const ropaColor = {"Oros":"#c9a84c","Copas":"#c0392b","Espadas":"#1a1a2e","Bastos":"#2d4a1e"}[palo.n]||c;
  const hc = h*0.62; // Y centro cuerpo caballo
  const rj = h*0.25; // Y cabeza jinete
  return (
    <g>
      {/* ── Cuerpo caballo ── */}
      <ellipse cx={cx} cy={hc} rx={w*0.34} ry={h*0.12} fill="#8B5e3c" stroke="#5a3520" strokeWidth={0.7}/>
      {/* Cuello caballo */}
      <path d={`M ${cx+w*0.22} ${hc-h*0.1} Q ${cx+w*0.3} ${hc-h*0.25} ${cx+w*0.25} ${hc-h*0.34}`}
        fill="#8B5e3c" stroke="#5a3520" strokeWidth={4}/>
      {/* Cabeza caballo */}
      <ellipse cx={cx+w*0.28} cy={hc-h*0.38} rx={w*0.11} ry={h*0.07}
        fill="#8B5e3c" stroke="#5a3520" strokeWidth={0.7} transform={`rotate(-25,${cx+w*0.28},${hc-h*0.38})`}/>
      {/* Hocico */}
      <ellipse cx={cx+w*0.36} cy={hc-h*0.43} rx={w*0.06} ry={h*0.04}
        fill="#7a4f2e" stroke="#5a3520" strokeWidth={0.5}/>
      {/* Ollares */}
      <ellipse cx={cx+w*0.38} cy={hc-h*0.41} rx={w*0.015} ry={h*0.01} fill="#5a3520"/>
      {/* Ojo */}
      <circle cx={cx+w*0.24} cy={hc-h*0.4} r={w*0.025} fill="#1a0a00"/>
      <circle cx={cx+w*0.235} cy={hc-h*0.402} r={w*0.008} fill="#fff" opacity={0.6}/>
      {/* Crin */}
      <path d={`M ${cx+w*0.26} ${hc-h*0.34} Q ${cx+w*0.18} ${hc-h*0.3} ${cx+w*0.14} ${hc-h*0.2}`}
        fill="none" stroke="#3a2010" strokeWidth={w*0.06} strokeLinecap="round"/>
      {/* Cola */}
      <path d={`M ${cx-w*0.32} ${hc-h*0.02} Q ${cx-w*0.42} ${hc+h*0.12} ${cx-w*0.38} ${hc+h*0.26}`}
        fill="none" stroke="#3a2010" strokeWidth={w*0.05} strokeLinecap="round"/>
      {/* Patas delanteras (levantadas al galope) */}
      <path d={`M ${cx+w*0.18} ${hc+h*0.1} L ${cx+w*0.26} ${hc+h*0.22} L ${cx+w*0.24} ${hc+h*0.3}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round" strokeLinejoin="round"/>
      <path d={`M ${cx+w*0.26} ${hc+h*0.08} L ${cx+w*0.18} ${hc+h*0.18}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.07} strokeLinecap="round"/>
      {/* Patas traseras */}
      <path d={`M ${cx-w*0.14} ${hc+h*0.1} L ${cx-w*0.18} ${hc+h*0.28}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round"/>
      <path d={`M ${cx-w*0.26} ${hc+h*0.1} L ${cx-w*0.2} ${hc+h*0.28}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round"/>

      {/* ── Jinete ── */}
      {/* Cuerpo */}
      <path d={`M ${cx-w*0.1} ${rj+h*0.22} L ${cx-w*0.06} ${rj+h*0.06} L ${cx+w*0.1} ${rj+h*0.06} L ${cx+w*0.12} ${rj+h*0.22} Z`}
        fill={ropaColor} stroke={c} strokeWidth={0.5}/>
      {/* Cabeza */}
      <ellipse cx={cx+w*0.02} cy={rj} rx={w*0.1} ry={h*0.08} fill="#f5d5a0" stroke={c} strokeWidth={0.5}/>
      {/* Yelmo */}
      <path d={`M ${cx-w*0.08} ${rj+h*0.02} Q ${cx-w*0.1} ${rj-h*0.12} ${cx+w*0.02} ${rj-h*0.14} Q ${cx+w*0.14} ${rj-h*0.12} ${cx+w*0.12} ${rj+h*0.02}`}
        fill={ropaColor} stroke={c} strokeWidth={0.6}/>
      <line x1={cx-w*0.08} y1={rj-h*0.01} x2={cx+w*0.12} y2={rj-h*0.01} stroke={c} strokeWidth={0.5}/>
      {/* Penacho del yelmo */}
      <path d={`M ${cx+w*0.02} ${rj-h*0.14} Q ${cx+w*0.06} ${rj-h*0.24} ${cx} ${rj-h*0.3}`}
        fill="none" stroke="#c0392b" strokeWidth={w*0.05} strokeLinecap="round"/>
      {/* Lanza */}
      <line x1={cx+w*0.12} y1={rj-h*0.08} x2={cx+w*0.42} y2={hc-h*0.36}
        stroke={c} strokeWidth={w*0.055}/>
      <polygon points={`${cx+w*0.42},${hc-h*0.36} ${cx+w*0.36},${hc-h*0.29} ${cx+w*0.46},${hc-h*0.28}`} fill={c}/>

      {/* Valor esquinas */}
      <text x={2.5} y={h*0.14} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif">C</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>C</text>
      <text x={2.5} y={h*0.25} fontSize={Math.max(4,w*0.16)} fill={c} fontFamily="Crimson Text, Georgia, serif" opacity={0.7}>{palo.e}</text>
    </g>
  );
}

// ── Sota y Rey ────────────────────────────────────────────────────────
function FiguraCarta({ valor, palo, w, h }) {
  const cx=w/2, cy=h/2, c=palo.col;
  const skinColor = "#f5d5a0";
  const hairColor = valor===12 ? "#8B5020" : "#3a2010";
  const ropaColor = {"Oros":"#c9a84c","Copas":"#c0392b","Espadas":"#1a1a2e","Bastos":"#2d4a1e"}[palo.n]||c;
  const headY = cy - h*0.28;
  const bodyY = cy - h*0.12;
  const bodyH = h*0.35;

  return (
    <g>
      {/* Manto/cuerpo */}
      <path d={`M ${cx-w*0.28} ${bodyY+bodyH} L ${cx-w*0.2} ${bodyY} L ${cx+w*0.2} ${bodyY} L ${cx+w*0.28} ${bodyY+bodyH} Z`}
        fill={ropaColor} stroke={c} strokeWidth={0.5}/>
      <line x1={cx} y1={bodyY} x2={cx} y2={bodyY+bodyH} stroke={c} strokeWidth={0.4} opacity={0.4}/>
      {/* Cabeza */}
      <ellipse cx={cx} cy={headY} rx={w*0.16} ry={h*0.14} fill={skinColor} stroke={c} strokeWidth={0.6}/>
      {/* Cabello */}
      <path d={`M ${cx-w*0.16} ${headY-h*0.04} Q ${cx-w*0.18} ${headY-h*0.18} ${cx} ${headY-h*0.2} Q ${cx+w*0.18} ${headY-h*0.18} ${cx+w*0.16} ${headY-h*0.04}`}
        fill={hairColor}/>

      {valor === 12 && (
        <g fill="#d4a020" stroke="#8B6914" strokeWidth={0.5}>
          <rect x={cx-w*0.18} y={headY-h*0.2} width={w*0.36} height={h*0.07} rx={1}/>
          <polygon points={`${cx-w*0.16},${headY-h*0.2} ${cx-w*0.12},${headY-h*0.3} ${cx-w*0.08},${headY-h*0.2}`}/>
          <polygon points={`${cx-w*0.02},${headY-h*0.2} ${cx},${headY-h*0.33} ${cx+w*0.02},${headY-h*0.2}`}/>
          <polygon points={`${cx+w*0.08},${headY-h*0.2} ${cx+w*0.12},${headY-h*0.3} ${cx+w*0.16},${headY-h*0.2}`}/>
        </g>
      )}
      {valor === 10 && (
        <g>
          {/* Sombrero */}
          <ellipse cx={cx} cy={headY-h*0.14} rx={w*0.2} ry={h*0.04} fill={ropaColor} stroke={c} strokeWidth={0.5}/>
          <rect x={cx-w*0.12} y={headY-h*0.28} width={w*0.24} height={h*0.14} rx={2} fill={ropaColor} stroke={c} strokeWidth={0.5}/>
          {/* Piernas */}
          <rect x={cx-w*0.14} y={bodyY+bodyH} width={w*0.1} height={h*0.14} rx={w*0.04} fill={ropaColor} stroke={c} strokeWidth={0.4}/>
          <rect x={cx+w*0.04} y={bodyY+bodyH} width={w*0.1} height={h*0.14} rx={w*0.04} fill={ropaColor} stroke={c} strokeWidth={0.4}/>
          {/* Pies */}
          <ellipse cx={cx-w*0.09} cy={bodyY+bodyH+h*0.14} rx={w*0.08} ry={h*0.03} fill={c}/>
          <ellipse cx={cx+w*0.09} cy={bodyY+bodyH+h*0.14} rx={w*0.08} ry={h*0.03} fill={c}/>
        </g>
      )}

      {valor === 12 && (
        <g>
          <line x1={cx+w*0.22} y1={bodyY-h*0.08} x2={cx+w*0.22} y2={bodyY+bodyH*0.7} stroke={ropaColor} strokeWidth={w*0.06}/>
          <circle cx={cx+w*0.22} cy={bodyY-h*0.1} r={w*0.07} fill="#d4a020" stroke="#8B6914" strokeWidth={0.5}/>
        </g>
      )}
      {valor === 10 && (
        <line x1={cx+w*0.25} y1={bodyY-h*0.15} x2={cx+w*0.2} y2={bodyY+bodyH*0.8}
          stroke={c} strokeWidth={w*0.05}/>
      )}

      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">
        {valor===10?"S":"R"}
      </text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>
        {valor===10?"S":"R"}
      </text>
      <text x={2.5} y={h*0.3} fontSize={Math.max(4,w*0.16)} fill={c} fontFamily="Crimson Text, Georgia, serif" opacity={0.7}>
        {palo.e}
      </text>
    </g>
  );
}

function CartaSVG({ carta, w=36, h=52 }) {
  const c = carta.palo.col;
  const v = carta.valor;
  const isAncho = v===1 && carta.palo.n==="Bastos";

  // Ases especiales
  if (v === 1) {
    if (carta.palo.n === "Bastos") return <AsBastos w={w} h={h}/>;
    if (carta.palo.n === "Oros")   return <AsOros w={w} h={h}/>;
    if (carta.palo.n === "Copas")  return <AsCopas w={w} h={h}/>;
    if (carta.palo.n === "Espadas") return <AsEspadas w={w} h={h}/>;
  }

  // Figuras
  if (v === 10 || v === 11 || v === 12) {
    return (
      <g>
        <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
        <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.4} opacity={0.4}/>
        {v === 11
          ? <CaballoSVG palo={carta.palo} w={w} h={h}/>
          : <FiguraCarta valor={v} palo={carta.palo} w={w} h={h}/>
        }
      </g>
    );
  }

  // Números 2-7: minimalista con palo grande
  const label = String(v);
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.3} opacity={0.35}/>
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.22)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">{label}</text>
      <PaloDecorativo palo={carta.palo} cx={w/2} cy={h/2} size={Math.min(w,h)*0.45}/>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.22)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>{label}</text>
    </g>
  );
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

function MesaCircular({ jugadores, cartasMesa, turnoIdx, pieIdx, manoIdx, onTirar, fase, ganadorBase, pedidos, capN, capE, ganaActual, expandidos, onToggleExpandir, cartasLevantadas, onLevantarCarta }) {
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

// ══════════════════════════════════════════════
// TABLERO
// ══════════════════════════════════════════════
function Tablero({ estructura, historial }) {
  const colW=36,rowH=28,labelW=68;
  const totalW=labelW+estructura.length*colW+4, totalH=rowH*3+8;
  let acumN=0,acumE=0;
  const acumNArr=[],acumEArr=[];
  for(let i=0;i<estructura.length;i++){
    if(historial[i]){acumN+=historial[i].deltaN;acumE+=historial[i].deltaE;}
    acumNArr.push(historial[i]!==undefined?acumN:"");
    acumEArr.push(historial[i]!==undefined?acumE:"");
  }
  const filas=[
    {label:"Cartas",vals:estructura,color:"rgba(201,168,76,0.55)"},
    {label:"Nosotros",vals:acumNArr,color:"#5b9bd5"},
    {label:"Ellos",vals:acumEArr,color:"#e07b54"},
  ];
  return (
    <div style={{overflowX:"auto",width:"100%"}}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} style={{width:"100%",minWidth:Math.min(totalW,320),maxWidth:totalW,display:"block"}}>
        <rect width={totalW} height={totalH} rx={6} fill="rgba(0,0,0,0.55)" stroke="rgba(201,168,76,0.22)" strokeWidth={1}/>
        {estructura.map((_,i)=>(
          <rect key={`ch-${i}`} x={labelW+i*colW} y={0} width={colW} height={rowH} fill={i%2===0?"rgba(201,168,76,0.05)":"rgba(0,0,0,0)"}/>
        ))}
        {[1,2].map(r=>(<line key={`hl-${r}`} x1={0} y1={r*rowH} x2={totalW} y2={r*rowH} stroke="rgba(201,168,76,0.12)" strokeWidth={0.5}/>))}
        <line x1={labelW} y1={0} x2={labelW} y2={totalH} stroke="rgba(201,168,76,0.22)" strokeWidth={1}/>
        {filas.map((fila,ri)=>(
          <g key={`fila-${ri}`}>
            <text x={labelW-6} y={ri*rowH+rowH/2+4} textAnchor="end" fontSize={9} fontFamily="Crimson Text, Georgia, serif" fill={fila.color} fontWeight="bold">{fila.label}</text>
            {fila.vals.map((val,ci)=>{
              const esNeg=typeof val==="number"&&val<0;
              return (
                <text key={`c-${ri}-${ci}`} x={labelW+ci*colW+colW/2} y={ri*rowH+rowH/2+4}
                  textAnchor="middle" fontSize={10} fontFamily="Crimson Text, Georgia, serif"
                  fill={val!==""?(esNeg?"#e05555":fila.color):"rgba(201,168,76,0.12)"}>
                  {val!==""?val:"·"}
                </text>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════
// ESTRELLAS DE PEDIDO (vacías/rellenas)
// ══════════════════════════════════════════════
function EstrellasPedido({ pedidas, hechas, color }) {
  if (pedidas === 0) return null;
  return (
    <div style={{display:"flex",gap:3,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
      {Array.from({length:pedidas}).map((_,i)=>(
        <span key={i} style={{
          fontSize:12,
          color: i < hechas ? color : "transparent",
          WebkitTextStroke: `0.8px ${color}`,
          lineHeight:1,
        }}>★</span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════
// BOTÓN
// ══════════════════════════════════════════════
function Btn({ onClick, children, verde, danger, disabled }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"10px 24px",
      border:`2px solid ${danger?"#c0392b":verde?"#4a9e6a":"#c9a84c"}`,borderRadius:6,
      background:h&&!disabled?(danger?"#c0392b":verde?"#4a9e6a":"#c9a84c"):"rgba(0,0,0,0.6)",
      color:h&&!disabled?"#000":(danger?"#e88":verde?"#7ecf9e":"#f0d080"),
      cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,transition:"all 0.18s",letterSpacing:1,
    }}>{children}</button>
  );
}

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
