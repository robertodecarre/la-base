import { fmtTiempo } from "../hooks/useClock";
import { colors, fonts, bevel } from "../theme";

// ══════════════════════════════════════════════
// DISPLAY RELOJ
// ══════════════════════════════════════════════
// "Corriendo" (activo ahora mismo) reusa colors.turn — el mismo lima neón
// del indicador de turno en la mesa, mismo significado ("esto necesita tu
// atención ya"). "Agotado" reusa colors.negative, igual que los puntajes
// en contra en el resumen/Tablero. Ninguno de los dos es un color nuevo.
export function DisplayReloj({ tiempoN, tiempoE, corriendo, agotadoN, agotadoE, modoLento, modoTiempo, hayTiempo }) {
  if (!hayTiempo) return null;
  const eqN = corriendo === 0, eqE = corriendo === 1;

  const relojStyle = (activo, agotado) => ({
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "8px 14px", borderRadius: 999, minWidth: 80,
    background: agotado ? "rgba(255,90,90,0.14)" : activo ? "rgba(212,255,0,0.12)" : "rgba(255,255,255,0.03)",
    border: `1.5px solid ${agotado ? colors.negative : activo ? colors.turn.color : colors.panel.border}`,
    boxShadow: agotado ? `${bevel}, 0 0 12px rgba(255,90,90,0.4)` : activo ? `${bevel}, 0 0 12px ${colors.turn.glow}` : bevel,
    transition: "all 0.3s",
  });

  const tiempoColor = (agotado, tiempo) => agotado ? colors.negative : tiempo < 30 ? colors.cta.border : colors.text.primary;

  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"center" }}>
      <div style={relojStyle(eqN, agotadoN)}>
        <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.nosotros.accent, letterSpacing:1, marginBottom:2 }}>NOSOTROS</div>
        <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoN,tiempoN), lineHeight:1 }}>
          {modoLento && agotadoN ? "10s/m" : fmtTiempo(tiempoN)}
        </div>
        {eqN && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>

      <div style={{ fontSize:10, color:colors.text.secondary, opacity:0.5 }}>
        {modoTiempo === "muerte" ? "⚡" : "🏃"}
      </div>

      <div style={relojStyle(eqE, agotadoE)}>
        <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.ellos.accent, letterSpacing:1, marginBottom:2 }}>ELLOS</div>
        <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoE,tiempoE), lineHeight:1 }}>
          {modoLento && agotadoE ? "10s/m" : fmtTiempo(tiempoE)}
        </div>
        {eqE && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>
    </div>
  );
}
