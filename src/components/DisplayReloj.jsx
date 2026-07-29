import { fmtTiempo } from "../hooks/useClock";
import { colors, fonts, bevel } from "../theme";

// ══════════════════════════════════════════════
// DISPLAY RELOJ
// ══════════════════════════════════════════════
// "Corriendo" (activo ahora mismo) reusa colors.turn — el mismo lima neón
// del indicador de turno en la mesa, mismo significado ("esto necesita tu
// atención ya"). "Agotado" reusa colors.negative, igual que los puntajes
// en contra en el resumen/Tablero. Ninguno de los dos es un color nuevo.
// `corriendo` es directamente el team index (0=LOCAL, 1=VISITANTE, o
// null) — LOCAL/VISITANTE son fijos, así que no hace falta ningún mapeo
// de "team index" a "slot", a diferencia de la vieja versión N/E relativa
// a quién miraba.
export function DisplayReloj({ tiempoLocal, tiempoVisitante, corriendo, agotadoLocal, agotadoVisitante, modoLento, modoTiempo, hayTiempo }) {
  if (!hayTiempo) return null;
  const eqLocal = corriendo === 0, eqVisitante = corriendo === 1;

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
      <div style={relojStyle(eqLocal, agotadoLocal)}>
        <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.local.accent, letterSpacing:1, marginBottom:2 }}>LOCAL</div>
        <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoLocal,tiempoLocal), lineHeight:1 }}>
          {modoLento && agotadoLocal ? "10s/m" : fmtTiempo(tiempoLocal)}
        </div>
        {eqLocal && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>

      <div style={{ fontSize:10, color:colors.text.secondary, opacity:0.5 }}>
        {modoTiempo === "muerte" ? "⚡" : "🏃"}
      </div>

      <div style={relojStyle(eqVisitante, agotadoVisitante)}>
        <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.visitante.accent, letterSpacing:1, marginBottom:2 }}>VISITANTE</div>
        <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoVisitante,tiempoVisitante), lineHeight:1 }}>
          {modoLento && agotadoVisitante ? "10s/m" : fmtTiempo(tiempoVisitante)}
        </div>
        {eqVisitante && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
      </div>
    </div>
  );
}
