import { fmtTiempo } from "../hooks/useClock";

// ══════════════════════════════════════════════
// DISPLAY RELOJ
// ══════════════════════════════════════════════
export function DisplayReloj({ tiempoN, tiempoE, corriendo, agotadoN, agotadoE, modoLento, modoTiempo, hayTiempo }) {
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
