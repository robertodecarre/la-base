import { colors } from "../theme";

// ══════════════════════════════════════════════
// AVIÓN KAMIKAZE (piece I, batch overnight post-5r)
// ══════════════════════════════════════════════
// SVG a mano (silueta de avión de papel/dardo), no emoji — para no
// salirse de la estética chrome. Reusa colors.danger, el mismo acento que
// ya usa todo lo relacionado a kamikaze en PanelPedir.jsx (botón ✈️,
// aviso de kamikaze activo), en vez de introducir un color nuevo.
export function AvionKamikaze({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d="M12 2 L19.5 21 L12 16.5 L4.5 21 Z" fill={colors.danger.border} stroke="#8a1e1e" strokeWidth={0.6} strokeLinejoin="round"/>
      <path d="M12 2 L12 16.5" stroke="#8a1e1e" strokeWidth={0.8}/>
    </svg>
  );
}
