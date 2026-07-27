import { useEffect } from "react";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, tituloStyle, codigoStyle,
  ctaStyle, secondaryBtnStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

// ══════════════════════════════════════════════
// PANTALLA MODO — hotseat vs. online
// ══════════════════════════════════════════════
export function PantallaModo({ onHotseat, onOnline }) {
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
        <div style={codigoStyle}>LA BASE</div>
        <div style={tituloStyle}>NAIPES ESPAÑOLES</div>

        <div style={{ fontSize: 11, color: colors.text.secondary, letterSpacing: 2, textAlign: "center", marginTop: 8, fontFamily: fonts.body, fontWeight: 600 }}>
          ¿CÓMO QUERÉS JUGAR?
        </div>

        <button onClick={onHotseat} style={ctaStyle()}>📱 Jugar en este dispositivo</button>
        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic", textAlign: "center", fontFamily: fonts.body }}>
          Todos los jugadores comparten esta pantalla, por turnos.
        </div>

        <button onClick={onOnline} style={secondaryBtnStyle({ full: true })}>🌐 Jugar online</button>
        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic", textAlign: "center", fontFamily: fonts.body }}>
          Cada jugador entra desde su propio dispositivo.
        </div>
      </div>
    </div>
  );
}
