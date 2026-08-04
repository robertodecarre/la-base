import { useEffect } from "react";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, codigoStyle,
  ctaStyle, secondaryBtnStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

// ══════════════════════════════════════════════
// PANTALLA MODO — primera pantalla de la app: crear o unirse a una sala
// online. Hotseat dejó de ser un punto de entrada alcanzable desde la UI
// en piece 5m (nada llevaba ahí ya) y se borró del todo en piece 5q
// (PantallaInicio.jsx y el resto del flujo hotseat). El paso intermedio
// "Jugar online" (antes PantallaOnlineMenu.jsx) se fusionó acá mismo.
// ══════════════════════════════════════════════
export function PantallaModo({ onCrear, onUnirse, onDevFake }) {
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

        {/* Feature #3 (batch post-mano_seat-split): acceso a mesas de 6/8
            jugadores con datos sintéticos, sin coordinar sesiones reales
            — import.meta.env.DEV es el flag estándar de Vite (true en
            `npm run dev`, false en `npm run build`/producción), así que
            este botón nunca llega al build que se despliega. */}
        {import.meta.env.DEV && (
          <button onClick={onDevFake} style={{ ...secondaryBtnStyle({ full: true }), opacity: 0.6, fontSize: 11 }}>
            🛠 Partida de prueba (6/8 — solo dev)
          </button>
        )}
      </div>
    </div>
  );
}
