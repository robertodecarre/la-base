import { EstrellasPedido } from "./EstrellasPedido";
import { colors, fonts, chipStyle } from "../theme";

const labelCellStyle = {
  textAlign: "right", paddingRight: 10, fontWeight: 700, letterSpacing: 1,
  fontSize: 10, fontFamily: fonts.display, fontStyle: "italic", whiteSpace: "nowrap",
};

// Una sola marca continua (no una por celda) para la columna de la mano
// actual — tres <div> absolutamente posicionados (uno por fila: cabecera/
// local/visitante) con bordes parciales que, apilados, se leen como un solo
// rectángulo redondeado atravesando las 3 filas. La celda contenedora
// necesita position:relative (ya seteado donde se usa).
function ColumnaActual({ parte }) {
  const c = colors.cta.border, glow = colors.cta.glow;
  const base = { position: "absolute", left: 1, right: 1, pointerEvents: "none" };
  if (parte === "top") return <div style={{ ...base, top: -3, bottom: 0, borderTop: `1px solid ${c}`, borderLeft: `1px solid ${c}`, borderRight: `1px solid ${c}`, borderRadius: "8px 8px 0 0", boxShadow: `0 -2px 8px ${glow}` }} />;
  if (parte === "bottom") return <div style={{ ...base, top: 0, bottom: -3, borderBottom: `1px solid ${c}`, borderLeft: `1px solid ${c}`, borderRight: `1px solid ${c}`, borderRadius: "0 0 8px 8px", boxShadow: `0 2px 8px ${glow}` }} />;
  return <div style={{ ...base, top: 0, bottom: 0, borderLeft: `1px solid ${c}`, borderRight: `1px solid ${c}`, boxShadow: `0 0 6px ${glow}` }} />;
}

// ══════════════════════════════════════════════
// TABLERO — historial de manos. Usado por PantallaPartidaOnline.jsx (piece
// 5n). Originalmente compartido con el hotseat (PantallaPartida.jsx), que
// se borró en piece 5q una vez confirmado que ya no era alcanzable desde
// la UI (piece 5m).
// `historial[i]` es undefined para manos todavía no jugadas, o
// { deltaLocal, deltaVisitante, pedLocal, pedVisitante, hechoLocal,
// hechoVisitante } una vez cerradas — LOCAL/VISITANTE son fijos (equipo 0
// y 1 respectivamente), no relativos a quién mira.
// `manoActual` (índice, opcional) resalta esa columna con un solo marco
// continuo en vez de un highlight por celda.
// ══════════════════════════════════════════════
export function Tablero({ estructura, historial, manoActual }) {
  let acumLocal = 0, acumVisitante = 0;
  const filas = estructura.map((cartas, i) => {
    const h = historial[i];
    if (h) { acumLocal += h.deltaLocal; acumVisitante += h.deltaVisitante; }
    return { cartas, h, acumLocal: h ? acumLocal : null, acumVisitante: h ? acumVisitante : null };
  });

  return (
    <div style={{ background: colors.panel.bg, border: `1px solid ${colors.panel.border}`, borderRadius: 14, padding: "10px 12px", overflowX: "auto", width: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...labelCellStyle, color: "rgba(200,210,255,0.4)" }}>CARTAS</th>
            {filas.map((f, i) => (
              <th key={i} style={{ padding: "3px 7px", position: "relative" }}>
                <span style={chipStyle}>{f.cartas}</span>
                {i === manoActual && <ColumnaActual parte="top" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...labelCellStyle, color: colors.team.local.accent }}>LOCAL</td>
            {filas.map((f, i) => (
              <td key={i} style={{ padding: "3px 7px", textAlign: "center", position: "relative", lineHeight: 1.1 }}>
                {i === manoActual && <ColumnaActual parte="mid" />}
                <div style={{ fontSize: 12, fontFamily: fonts.body, fontWeight: 600, color: f.acumLocal == null ? "rgba(200,210,255,0.15)" : (f.acumLocal < 0 ? colors.negative : "#cfe0ff") }}>
                  {f.acumLocal ?? "·"}
                </div>
                {f.h && <EstrellasPedido pedidas={f.h.pedLocal} hechas={f.h.hechoLocal} color="rgba(143,176,255,0.65)" />}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...labelCellStyle, color: colors.team.visitante.accent }}>VISITANTE</td>
            {filas.map((f, i) => (
              <td key={i} style={{ padding: "3px 7px", textAlign: "center", position: "relative", lineHeight: 1.1 }}>
                {i === manoActual && <ColumnaActual parte="bottom" />}
                <div style={{ fontSize: 12, fontFamily: fonts.body, fontWeight: 600, color: f.acumVisitante == null ? "rgba(200,210,255,0.15)" : (f.acumVisitante < 0 ? colors.negative : "#ffe0cc") }}>
                  {f.acumVisitante ?? "·"}
                </div>
                {f.h && <EstrellasPedido pedidas={f.h.pedVisitante} hechas={f.h.hechoVisitante} color="rgba(255,179,133,0.65)" />}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
