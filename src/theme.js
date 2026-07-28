// ══════════════════════════════════════════════
// TEMA — estética "chrome" estilo NBA Live 2001
// ══════════════════════════════════════════════
// Capa central de tokens de color/tipografía/forma para el rework visual
// online (metálico azul-violeta, píldoras con bisel, tipografía condensada
// itálica en mayúsculas). Ver direccion-nba-live.html (mockup de
// referencia) y PantallaOnlineSala.jsx (primer uso real).
//
// Ojo: esto NO toca las cartas españolas (src/components/cards/*), que se
// quedan en su estilo clásico actual, ni las pantallas hotseat — esas
// siguen con la estética sobria vieja hasta que se haga el rollout pieza
// por pieza.

export const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Saira+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Barlow+Semi+Condensed:wght@500;600&display=swap";

export const fonts = {
  display: "'Saira Condensed', sans-serif", // títulos y botones: 700/800, itálica, mayúsculas
  body: "'Barlow Semi Condensed', sans-serif", // texto de apoyo / nombres
};

export const colors = {
  bg: "radial-gradient(ellipse at 50% 20%, #24306e 0%, #0d1230 55%, #060814 100%)",
  panel: { bg: "linear-gradient(180deg, #171f4a 0%, #0a0e26 100%)", border: "#4a5aa8" },
  text: { primary: "#f2f4ff", secondary: "#aab6f2" },
  team: {
    nosotros: {
      gradient: "linear-gradient(180deg, #4a6ac0 0%, #253a80 45%, #16234f 100%)",
      border: "#6f8fe0",
      readyBorder: "#8fb0ff",
      readyGlow: "rgba(90,140,255,0.6)",
      readyDot: "#cfe0ff",
      accent: "#6fa3ff",
    },
    ellos: {
      gradient: "linear-gradient(180deg, #d8703f 0%, #8a3c1c 45%, #4f1f0e 100%)",
      border: "#f0966a",
      readyBorder: "#ffb385",
      readyGlow: "rgba(255,140,80,0.6)",
      readyDot: "#ffe0cc",
      accent: "#ff7a52",
    },
  },
  cta: {
    gradient: "linear-gradient(180deg, #ff8a63 0%, #d8512c 55%, #a02f16 100%)",
    border: "#ffab8a",
    glow: "rgba(255,90,50,0.45)",
  },
};

// Bisel de luz: más claro arriba, más oscuro abajo — reemplaza el "óvalo
// duro" plano que tenían los botones antes.
export const bevel = "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -6px 10px rgba(0,0,0,0.35)";

function pillShadow(glow) {
  return glow ? `${bevel}, 0 0 14px ${glow}` : bevel;
}

// ── Estilos compuestos, mapeados 1:1 a las piezas del mockup ──────────

export const panelStyle = {
  position: "relative",
  border: `2px solid ${colors.panel.border}`,
  borderRadius: 10,
  background: `repeating-linear-gradient(-35deg, rgba(120,140,220,0.05) 0 2px, transparent 2px 90px), ${colors.panel.bg}`,
  boxShadow: "inset 0 0 0 1px #1c245c, 0 0 40px -10px rgba(80,100,220,0.4)",
  overflow: "hidden",
};

export const badgeStyle = {
  width: 46,
  height: 46,
  borderRadius: "50%",
  background: "radial-gradient(circle at 35% 30%, #7d90e8, #1c2560 70%)",
  border: "2px solid #9aa8f0",
  boxShadow: "0 0 14px rgba(120,140,240,0.6), inset 0 0 8px rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: fonts.display,
  fontWeight: 800,
  fontStyle: "italic",
  fontSize: 15,
  color: "#eef1ff",
  textShadow: "0 0 6px #6c7bde",
};

export const tituloStyle = {
  fontFamily: fonts.display,
  fontWeight: 800,
  fontStyle: "italic",
  fontSize: 13,
  letterSpacing: 6,
  textAlign: "center",
  color: colors.text.secondary,
  textShadow: "0 0 8px rgba(140,160,240,0.5)",
};

export const codigoStyle = {
  fontFamily: fonts.display,
  fontWeight: 800,
  fontStyle: "italic",
  fontSize: 34,
  letterSpacing: 8,
  textAlign: "center",
  color: "#ffffff",
  textShadow: "0 0 16px rgba(140,160,255,0.7)",
};

export function equipoLabelStyle(team) {
  return {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.team[team].accent,
  };
}

// Fila/asiento en forma de píldora — el matiz (azul/naranja) identifica al
// equipo siempre; el estado "listo" solo sube el brillo (borde + glow) en
// ese mismo matiz, nunca cambia de color.
export function filaStyle(team, { listo } = {}) {
  const t = colors.team[team];
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    padding: "9px 16px",
    border: `1px solid ${listo ? t.readyBorder : t.border}`,
    background: t.gradient,
    boxShadow: pillShadow(listo ? t.readyGlow : null),
  };
}

// Fila de asiento vacío: misma forma de píldora, sin matiz de equipo.
export const filaVaciaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 999,
  padding: "9px 16px",
  border: "1px solid rgba(120,140,220,0.18)",
  background: "rgba(255,255,255,0.03)",
  boxShadow: bevel,
};

export function puntoStyle(team, { listo }) {
  const t = colors.team[team];
  return {
    fontSize: 10,
    color: listo ? t.readyDot : "rgba(255,255,255,0.35)",
    textShadow: listo ? `0 0 8px ${t.readyBorder}` : "none",
  };
}

export const nombreStyle = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 14,
  color: colors.text.primary,
  letterSpacing: 0.5,
};

// Botón de acción principal (no ligado a equipo): confirmar, cerrar, etc.
export function ctaStyle({ disabled } = {}) {
  return {
    display: "block",
    width: "100%",
    textAlign: "center",
    fontFamily: fonts.display,
    fontWeight: 800,
    fontStyle: "italic",
    fontSize: 15,
    letterSpacing: 3,
    color: "#fff2ea",
    borderRadius: 999,
    padding: 13,
    border: `1px solid ${colors.cta.border}`,
    background: colors.cta.gradient,
    boxShadow: `${bevel}, 0 0 18px ${colors.cta.glow}`,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

// Botón secundario/neutro (p.ej. "salir", o la opción no-destacada de un
// par de acciones) — misma forma de píldora, sin el gradiente de acción.
export function secondaryBtnStyle({ disabled, full } = {}) {
  return {
    display: "block",
    width: full ? "100%" : undefined,
    textAlign: "center",
    fontFamily: fonts.display,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 13,
    letterSpacing: 2,
    color: colors.text.secondary,
    borderRadius: 999,
    padding: "10px 22px",
    border: `1px solid ${colors.panel.border}`,
    background: "rgba(255,255,255,0.03)",
    boxShadow: bevel,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

// Campo de texto en píldora — mismo lenguaje visual que las filas de
// asiento (bisel, borde tenue), sin matiz de equipo.
export function inputStyle({ big } = {}) {
  return {
    fontFamily: big ? fonts.display : fonts.body,
    fontWeight: big ? 800 : 600,
    fontStyle: big ? "italic" : "normal",
    fontSize: big ? 22 : 14,
    letterSpacing: big ? 6 : 0.5,
    textAlign: "center",
    width: "100%",
    padding: big ? "10px 16px" : "9px 16px",
    borderRadius: 999,
    border: `1px solid ${colors.panel.border}`,
    background: "rgba(0,0,0,0.35)",
    color: colors.text.primary,
    boxShadow: bevel,
    outline: "none",
  };
}

// Select en píldora — mismo lenguaje que inputStyle, alineado a la
// izquierda porque suele llevar texto descriptivo largo (opciones de
// estructura de manos).
export function selectStyle() {
  return {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 13,
    textAlign: "left",
    width: "100%",
    padding: "9px 14px",
    borderRadius: 999,
    border: `1px solid ${colors.panel.border}`,
    background: "rgba(0,0,0,0.35)",
    color: colors.text.primary,
    boxShadow: bevel,
    outline: "none",
    cursor: "pointer",
  };
}

// Opción de un grupo tipo "segmented control" (cantidad de jugadores,
// modo de tiempo) — no está ligada a un equipo, así que usa el naranja de
// acción (colors.cta) como único acento neutro de la app. Igual que
// filaStyle, el pill de base no cambia de color entre estados: seleccionado
// solo sube brillo/borde/glow.
export function segmentedOptionStyle(selected) {
  return {
    fontFamily: fonts.display,
    fontWeight: 700,
    fontStyle: "italic",
    fontSize: 14,
    letterSpacing: 1,
    textAlign: "center",
    borderRadius: 999,
    padding: "9px 16px",
    border: `1px solid ${selected ? colors.cta.border : colors.panel.border}`,
    background: selected ? "rgba(255,130,80,0.16)" : "rgba(255,255,255,0.03)",
    color: selected ? "#ffd7c2" : colors.text.secondary,
    boxShadow: selected ? `${bevel}, 0 0 12px ${colors.cta.glow}` : bevel,
    cursor: "pointer",
  };
}

// Fila-tarjeta para un checkbox (dos mazos, ases, reloj) — mismo criterio
// que segmentedOptionStyle: el naranja de acción marca "activo" con más
// brillo, sin cambiar de matiz de base.
export function checkRowStyle(active) {
  return {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "9px 12px",
    borderRadius: 12,
    border: `1px solid ${active ? colors.cta.border : colors.panel.border}`,
    background: active ? "rgba(255,130,80,0.08)" : "rgba(255,255,255,0.02)",
    boxShadow: active ? `${bevel}, 0 0 10px ${colors.cta.glow}` : bevel,
  };
}

// El checkbox nativo en sí — no vale la pena un toggle dibujado a mano
// para esto, pero al menos que el tilde/fondo respete la paleta en vez de
// quedar con el azul/gris por default del navegador.
export const checkboxStyle = {
  accentColor: colors.cta.border,
  width: 15,
  height: 15,
  cursor: "pointer",
  flexShrink: 0,
};

// Chip chico decorativo — usado por los badges numéricos de estructura de
// manos ("1 2 3 2 1").
export const chipStyle = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 11,
  padding: "3px 10px",
  borderRadius: 999,
  border: `1px solid ${colors.panel.border}`,
  background: "rgba(255,255,255,0.04)",
  color: colors.text.secondary,
  boxShadow: bevel,
};

// Link fantasma para navegación secundaria ("← volver") — liviano, no es
// un botón/píldora.
export const linkStyle = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 12,
  padding: "4px 12px",
  border: "none",
  background: "transparent",
  color: colors.text.secondary,
  opacity: 0.7,
  cursor: "pointer",
  letterSpacing: 1,
};

export const WORDMARK = "LA BASE";

// Banda diagonal tenue con el wordmark repetido, de fondo — puramente
// decorativa (pointer-events off para no interferir con la fila de abajo).
export const diagonalWordmarkStyle = {
  position: "absolute",
  top: 0,
  left: "-20%",
  width: "140%",
  height: 40,
  fontFamily: fonts.display,
  fontWeight: 800,
  fontStyle: "italic",
  fontSize: 13,
  letterSpacing: 3,
  color: "rgba(150,170,255,0.12)",
  whiteSpace: "nowrap",
  transform: "rotate(-6deg) translateY(4px)",
  pointerEvents: "none",
};
