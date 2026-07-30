import { EstrellasPedido } from "./EstrellasPedido";
import { colors, fonts, chipStyle } from "../theme";

const headCellStyle = {
  textAlign: "center", fontWeight: 700, letterSpacing: 1,
  fontSize: 10, fontFamily: fonts.display, fontStyle: "italic",
  color: "rgba(200,210,255,0.4)", padding: "4px 8px",
};

// ══════════════════════════════════════════════
// TABLERO — historial de manos, dentro de la "libreta" (piece F, batch
// overnight post-5r): antes era una tabla siempre visible con una columna
// por mano (horizontal); ahora solo se muestra dentro del overlay que
// togglea el ícono de libreta en MesaCircular.jsx, y con una FILA por mano
// (vertical) — más natural para hojear como una libreta angosta, y el
// único lugar donde este componente se sigue usando, así que no hace
// falta mantener las dos variantes.
// `historial[i]` es undefined para manos todavía no jugadas, o
// { deltaLocal, deltaVisitante, pedLocal, pedVisitante, hechoLocal,
// hechoVisitante } una vez cerradas — LOCAL/VISITANTE son fijos (equipo 0
// y 1 respectivamente), no relativos a quién mira.
// `manoActual` (índice, opcional) resalta esa fila en vez de una columna.
// ══════════════════════════════════════════════
export function Tablero({ estructura, historial, manoActual }) {
  let acumLocal = 0, acumVisitante = 0;
  const filas = estructura.map((cartas, i) => {
    const h = historial[i];
    // Piece N: una fila puede venir con estrellas pero sin delta todavía
    // (la mano en curso, antes de cerrar) — no suma al acumulado, muestra
    // "·" en el puntaje pero las estrellas sí.
    const tieneDelta = h && h.deltaLocal != null;
    if (tieneDelta) { acumLocal += h.deltaLocal; acumVisitante += h.deltaVisitante; }
    return { cartas, h, acumLocal: tieneDelta ? acumLocal : null, acumVisitante: tieneDelta ? acumVisitante : null };
  });

  return (
    <div style={{ background: colors.panel.bg, border: `1px solid ${colors.panel.border}`, borderRadius: 14, padding: "10px 12px", overflowY: "auto", maxHeight: "100%", width: "100%" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={headCellStyle}>MANO</th>
            <th style={headCellStyle}>CARTAS</th>
            <th style={{ ...headCellStyle, color: colors.team.local.accent }}>LOCAL</th>
            <th style={{ ...headCellStyle, color: colors.team.visitante.accent }}>VISITANTE</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={i === manoActual ? {
              boxShadow: `inset 0 0 0 1px ${colors.cta.border}`,
              background: "rgba(255,130,80,0.08)",
            } : undefined}>
              <td style={{ ...headCellStyle, color: "rgba(200,210,255,0.5)" }}>{i + 1}</td>
              <td style={{ padding: "4px 8px", textAlign: "center" }}><span style={chipStyle}>{f.cartas}</span></td>
              <td style={{ padding: "4px 8px", textAlign: "center", lineHeight: 1.1 }}>
                <div style={{ fontSize: 12, fontFamily: fonts.body, fontWeight: 600, color: f.acumLocal == null ? "rgba(200,210,255,0.15)" : (f.acumLocal < 0 ? colors.negative : "#cfe0ff") }}>
                  {f.acumLocal ?? "·"}
                </div>
                {f.h && <EstrellasPedido pedidas={f.h.pedLocal} hechas={f.h.hechoLocal} color="rgba(143,176,255,0.65)" />}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "center", lineHeight: 1.1 }}>
                <div style={{ fontSize: 12, fontFamily: fonts.body, fontWeight: 600, color: f.acumVisitante == null ? "rgba(200,210,255,0.15)" : (f.acumVisitante < 0 ? colors.negative : "#ffe0cc") }}>
                  {f.acumVisitante ?? "·"}
                </div>
                {f.h && <EstrellasPedido pedidas={f.h.pedVisitante} hechas={f.h.hechoVisitante} color="rgba(255,179,133,0.65)" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
