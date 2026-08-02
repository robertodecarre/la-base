import { useState } from "react";
import { Btn } from "./Btn";
import { colors, fonts, panelStyle } from "../theme";

// "Salir de la sala" — piece E (batch overnight post-5r) lo aisló del
// resto de las acciones de cada pantalla de partida (chico, rojo, con
// confirmación propia). Piece MM (batch overnight post-EE): extraído a
// componente compartido para que la sala (PantallaOnlineSala.jsx, que
// antes montaba su propio <button style={secondaryBtnStyle()}> sin
// confirmación) y la partida (PantallaPartidaOnline.jsx) usen EXACTAMENTE
// el mismo botón — mismo tamaño/color/confirmación, y ahora clavado en la
// esquina inferior izquierda (position:fixed) en vez de vivir en el flujo
// normal de cada pantalla, que es lo que hacía que apareciera en una
// posición distinta según cuánto contenido tuviera cada una arriba.
//
// Piece M (batch overnight post-5r): onSalir ya no dispara directo del
// click — antes un click perdido (o un toque en mobile) sacaba a alguien
// de la sala sin aviso, y aunque piece M's join_room fix ahora deja
// volver a entrar mid-game, seguía siendo una acción destructiva sin
// red. Confirmación acotada al propio botón (estado local).
export function BotonSalir({ onSalir }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div style={{ position: "fixed", left: 14, bottom: 14, zIndex: 40 }}>
      <Btn danger small onClick={() => setConfirmando(true)}>Salir de la sala</Btn>
      {confirmando && (
        <ConfirmarSalirOverlay onConfirmar={onSalir} onCancelar={() => setConfirmando(false)} />
      )}
    </div>
  );
}

// Piece V (batch overnight post-5r): copy/botones con la voz irreverente
// propia de esta app (misma línea que "la está haciendo" — ver piece G/
// online-habitacion.spec.js) — texto tal cual pedido, sin suavizar.
// "ME QUEDO" reusa colors.positive (Btn verde), el mismo verde que ya usa
// el resto del chrome para "confirmar/continuar" — no un acento nuevo.
function ConfirmarSalirOverlay({ onConfirmar, onCancelar }) {
  return (
    <div
      onClick={onCancelar}
      style={{
        position: "fixed", inset: 0, background: "rgba(6,8,20,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, width: "100%", maxWidth: 300, padding: 18, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}
      >
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 14, color: colors.text.secondary }}>
          ¿Ya te vas, forro?
        </div>
        <div style={{ fontSize: 11, color: "rgba(201,168,76,0.6)" }}>
          Podés volver a entrar con el mismo código.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn verde small onClick={onCancelar}>ME QUEDO</Btn>
          <Btn danger small onClick={onConfirmar}>ME VOY A LA MIERDA</Btn>
        </div>
      </div>
    </div>
  );
}
