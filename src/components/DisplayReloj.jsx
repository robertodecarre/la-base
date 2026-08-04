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
// graciaTeam/graciaSegundos (deportivo, batch post-mano_seat-split): una
// vez que el reloj PRINCIPAL de un equipo llega a cero en modo deportivo,
// arranca una cuenta regresiva extra de 10s antes de la derrota
// automática (claim_deportivo_timeout) — se muestra como un segundo
// contador aparte, en el matiz `colors.grace` (nunca visto en el reloj
// normal), para que se lea como una alarma distinta, no una sombra más
// oscura del mismo reloj. graciaTeam es el team index (0/1) actualmente
// en gracia, o null si nadie lo está.
export function DisplayReloj({ tiempoLocal, tiempoVisitante, corriendo, agotadoLocal, agotadoVisitante, modoLento, modoTiempo, hayTiempo, graciaTeam = null, graciaSegundos = null }) {
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

  const graciaStyle = {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "6px 12px", borderRadius: 999, minWidth: 64,
    background: "rgba(255,46,196,0.16)",
    border: `1.5px solid ${colors.grace.color}`,
    boxShadow: `${bevel}, 0 0 14px ${colors.grace.glow}`,
    animation: "lbGraciaPulso 0.6s ease-in-out infinite alternate",
  };

  const graciaBadge = (team) => graciaTeam === team && graciaSegundos !== null ? (
    <div style={graciaStyle}>
      <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.grace.color, letterSpacing:1, marginBottom:2 }}>⚠ GRACIA</div>
      <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:18, color:colors.grace.color, lineHeight:1 }}>
        {Math.max(0, graciaSegundos)}s
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", justifyContent:"center", flexWrap:"wrap" }}>
      <style>{"@keyframes lbGraciaPulso { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }"}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <div style={relojStyle(eqLocal, agotadoLocal)}>
          <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.local.accent, letterSpacing:1, marginBottom:2 }}>LOCAL</div>
          <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoLocal,tiempoLocal), lineHeight:1 }}>
            {modoLento && agotadoLocal ? "10s/m" : fmtTiempo(tiempoLocal)}
          </div>
          {eqLocal && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
        </div>
        {graciaBadge(0)}
      </div>

      <div style={{ fontSize:10, color:colors.text.secondary, opacity:0.5 }}>
        {modoTiempo === "muerte" ? "⚡" : "🏃"}
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <div style={relojStyle(eqVisitante, agotadoVisitante)}>
          <div style={{ fontFamily:fonts.body, fontWeight:600, fontSize:9, color:colors.team.visitante.accent, letterSpacing:1, marginBottom:2 }}>VISITANTE</div>
          <div style={{ fontFamily:fonts.display, fontWeight:800, fontStyle:"italic", fontSize:22, color:tiempoColor(agotadoVisitante,tiempoVisitante), lineHeight:1 }}>
            {modoLento && agotadoVisitante ? "10s/m" : fmtTiempo(tiempoVisitante)}
          </div>
          {eqVisitante && <div style={{ fontFamily:fonts.body, fontWeight:700, fontSize:8, color:colors.turn.color, marginTop:2, letterSpacing:1 }}>● CORRIENDO</div>}
        </div>
        {graciaBadge(1)}
      </div>
    </div>
  );
}
