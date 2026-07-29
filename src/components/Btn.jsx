import { useState } from "react";
import { colors, fonts, bevel } from "../theme";

// ══════════════════════════════════════════════
// BOTÓN
// ══════════════════════════════════════════════
// Tres variantes, todas la misma píldora con bisel — solo cambia el
// acento: default (naranja de acción, colors.cta), verde (afirmar/
// continuar, colors.positive — un verde bien distinto del lima de
// colors.turn y del azul/naranja de equipo) y danger (colors.danger).
// El hover ya no invierte fondo/texto como antes: sube brillo/glow, mismo
// criterio "estado = brillo, no cambio de color" que el resto del rework.
// `small` (piece E, batch overnight post-5r) achica la píldora para
// acciones secundarias/aisladas como "Salir de la sala" — mismo lenguaje
// visual, sin competir con la acción principal de cada pantalla.
export function Btn({ onClick, children, verde, danger, small, disabled }) {
  const [h,setH]=useState(false);
  const variant = danger ? colors.danger : verde ? colors.positive : colors.cta;
  const activo = h && !disabled;
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic",
      fontSize: small ? 10 : 13, letterSpacing: small ? 1 : 1.5, padding: small ? "5px 14px" : "10px 24px",
      borderRadius: 999,
      border: `1px solid ${variant.border}`,
      background: variant.gradient,
      color: colors.text.primary,
      boxShadow: activo ? `${bevel}, 0 0 16px ${variant.glow}` : bevel,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "all 0.18s",
    }}>{children}</button>
  );
}
