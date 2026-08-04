import { ReactionFace } from "./ReactionFace";
import { GESTOS_EDITABLES, SIN_SENA } from "../lib/senas";
import { colors, fonts, panelStyle } from "../theme";

// ══════════════════════════════════════════════
// SEÑAS UI — extraído (feature #1, batch post-mano_seat-split) de donde
// vivían antes (SenasIcon dentro de MesaCircular.jsx, SenasOverlay dentro
// de PantallaPartidaOnline.jsx) para que SorteoAnimado.jsx también pueda
// usarlos — Roberto: "las señas tienen que poder usarse durante el
// sorteo, igual que durante la partida, sin cableado aparte". El ícono
// requiere un filtro #glow definido en los <defs> del <svg> que lo monta
// (ya existe en MesaCircular, agregado en SorteoAnimado para esto).
// ══════════════════════════════════════════════

// Ícono de "señas" (pieza J) — mismo patrón click-to-expand que
// LibretaIcon/ClockIcon en MesaCircular.jsx. Abre SenasOverlay: a la vez
// hoja de referencia privada (qué significa cada gesto para MI equipo) y
// disparador ("tocá una para mandarla"). Cara sonriente dibujada a mano,
// mismo lenguaje de líneas simples que el resto de estos íconos SVG.
export function SenasIcon({ x, y, abierta, onToggle }) {
  const r = 12;
  const activo = colors.cta.border, inactivo = colors.panel.border;
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }}
       role="button" aria-label={abierta ? "Cerrar señas" : "Ver señas"}
       onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <circle cx={0} cy={0} r={r}
        fill={abierta ? "rgba(255,130,80,0.18)" : "rgba(10,14,38,0.85)"}
        stroke={abierta ? activo : inactivo} strokeWidth={abierta ? 1.6 : 1.2}
        filter={abierta ? "url(#glow)" : undefined}/>
      <circle cx={-4} cy={-2} r={1.4} fill={abierta ? activo : "rgba(200,210,255,0.6)"}/>
      <circle cx={4} cy={-2} r={1.4} fill={abierta ? activo : "rgba(200,210,255,0.6)"}/>
      <path d="M-5,3 Q0,7 5,3" stroke={abierta ? activo : "rgba(200,210,255,0.6)"} strokeWidth={1.4} fill="none" strokeLinecap="round"/>
    </g>
  );
}

// Overlay de señas (pieza J) — mismo patrón que TableroOverlay/RelojOverlay
// (backdrop clickeable, panelStyle), pero hace doble función: hoja de
// referencia PRIVADA (nadie más ve que la abriste, ni tu propio
// compañero — por eso vive puramente en estado local del cliente, sin
// broadcast de "se abrió") Y disparador de gestos — cada fila es
// clickeable y manda ESE gesto de una. Fusionar las dos cosas evita un
// segundo panel separado solo para "elegir qué cara poner": la lista ya
// tiene que existir para la referencia, y dado que solo el propio jugador
// ve estas etiquetas, no hay ninguna fuga en dejar clickear desde acá
// mismo. abrirla cuesta lo mismo que espiar a un rival (mientras está
// abierta no estás mirando la mesa) — ver spec de pieza J.
export function SenasOverlay({ senas, onEnviar, onCerrar }) {
  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, background: "rgba(6,8,20,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, width: "100%", maxWidth: 340, maxHeight: "80vh", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: 2, color: colors.text.secondary }}>SEÑAS</div>
          <button onClick={onCerrar} style={{ background: "none", border: "none", color: colors.text.secondary, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic" }}>
          Tocá una para mandarla. Solo vos ves esta lista.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {GESTOS_EDITABLES.map((key) => (
            <button key={key} data-gesture-key={key} onClick={() => { onEnviar(key); onCerrar(); }} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 10,
              border: "1px solid rgba(140,160,240,0.25)", background: "rgba(255,255,255,0.03)", cursor: "pointer", textAlign: "left",
            }}>
              <ReactionFace gestureKey={key} size={34} />
              <span style={{ fontSize: 12, color: senas[key] ? colors.text.primary : "rgba(200,210,255,0.35)", fontStyle: senas[key] ? "normal" : "italic", fontFamily: fonts.body }}>{senas[key] || SIN_SENA}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
