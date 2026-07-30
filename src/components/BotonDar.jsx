import { colors, fonts } from "../theme";

// ══════════════════════════════════════════════
// BOTÓN "DAR" — mazo visto de espaldas (piece U, batch overnight post-5r)
// ══════════════════════════════════════════════
// Reemplaza el <Btn verde>"Repartir mano"</Btn> de texto por un dibujo de
// mazo apilado (3 cartas offset, vistas de espaldas/canto — no una carta
// sola de frente) + la etiqueta "DAR" debajo, mismo lenguaje "chrome" que
// el resto del rework (bisel, gradiente, colors.positive — mismo verde que
// el <Btn verde> que reemplaza, sin introducir un acento nuevo). Mismo
// gating/click que antes: el padre (PantallaPartidaOnline.jsx) sigue
// siendo dueño de a quién se le muestra y qué pasa al tocarlo, esto es
// puramente el botón. `aria-hidden` en el <svg> a propósito: sin eso, el
// "✦" decorativo del dorso se sumaría al nombre accesible del botón junto
// con "DAR", rompiendo `getByRole("button",{name:"DAR"})`.
export function BotonDar({ onClick, disabled, enviando }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      background: "none", border: "none", padding: 6,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}>
      <svg width={58} height={58} viewBox="0 0 58 58" aria-hidden="true">
        <defs>
          <linearGradient id="darMazoTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ae08a"/><stop offset="55%" stopColor="#1e9c5a"/><stop offset="100%" stopColor="#0e5c34"/>
          </linearGradient>
        </defs>
        {/* dos cartas de atrás, apenas visibles — dan el volumen del mazo */}
        <rect x={17} y={12} width={26} height={36} rx={4} fill="#0a0e26" stroke={colors.panel.border} strokeWidth={1}/>
        <rect x={13} y={8} width={26} height={36} rx={4} fill="#0d1230" stroke={colors.panel.border} strokeWidth={1}/>
        {/* carta de arriba — la que "se reparte" */}
        <rect x={9} y={4} width={26} height={36} rx={4} fill="url(#darMazoTop)" stroke="#7ef0ae" strokeWidth={1.6}/>
        <rect x={12.5} y={7.5} width={19} height={29} rx={2.5} fill="none" stroke="rgba(240,255,246,0.55)" strokeWidth={1}/>
        <text x={22} y={26} textAnchor="middle" fontSize={12} fill="rgba(240,255,246,0.6)" fontFamily={fonts.display} fontWeight={800}>✦</text>
      </svg>
      <span style={{
        fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic",
        fontSize: 13, letterSpacing: 3, color: colors.text.primary,
      }}>
        {enviando ? "…" : "DAR"}
      </span>
    </button>
  );
}
