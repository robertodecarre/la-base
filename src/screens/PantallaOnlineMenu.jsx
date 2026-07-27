import { useEffect } from "react";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, tituloStyle,
  ctaStyle, secondaryBtnStyle, linkStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

// ══════════════════════════════════════════════
// PANTALLA ONLINE MENU — crear vs. unirse
// ══════════════════════════════════════════════
export function PantallaOnlineMenu({ onCrear, onUnirse, onVolver }) {
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
        <div style={tituloStyle}>JUGAR ONLINE</div>

        <button onClick={onCrear} style={ctaStyle()}>Crear sala</button>
        <button onClick={onUnirse} style={secondaryBtnStyle({ full: true })}>Unirse a sala</button>
      </div>

      <button onClick={onVolver} style={linkStyle}>← volver</button>
    </div>
  );
}
