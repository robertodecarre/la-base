import { useEffect } from "react";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, codigoStyle,
  ctaStyle, secondaryBtnStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

// ══════════════════════════════════════════════
// PANTALLA MODO — primera pantalla de la app: crear o unirse a una sala
// online. Hotseat dejó de ser un punto de entrada alcanzable desde la UI
// (PantallaInicio.jsx y el resto del flujo hotseat siguen existiendo,
// simplemente no hay ningún botón que lleve ahí) y el paso intermedio
// "Jugar online" (antes PantallaOnlineMenu.jsx) se fusionó acá mismo.
// ══════════════════════════════════════════════
export function PantallaModo({ onCrear, onUnirse }) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  return (
    <div style={{
      background: colors.bg, minHeight: "100vh", fontFamily: fonts.body,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      padding: "30px 14px",
    }}>
      <div style={{ ...panelStyle, width: "100%", maxWidth: 420, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={diagonalWordmarkStyle}>{Array(6).fill(WORDMARK).join(" · ")}</div>

        <div style={badgeStyle}>LB</div>
        <div style={codigoStyle}>LA BASE ONLINE</div>

        <button onClick={onCrear} style={ctaStyle()}>Crear sala</button>
        <button onClick={onUnirse} style={secondaryBtnStyle({ full: true })}>Unirse a sala</button>
      </div>
    </div>
  );
}
