import { useState } from "react";
import { Btn } from "./Btn";
import { colors, fonts, panelStyle } from "../theme";

// "Salir de la sala" — piece E (batch overnight post-5r) lo aisló del
// resto de las acciones de cada pantalla de partida (chico, rojo, con
// confirmación propia). Piece MM (batch overnight post-EE): extraído a
// componente compartido para que la sala (PantallaOnlineSala.jsx, que
// antes montaba su propio <button style={secondaryBtnStyle()}> sin
// confirmación) y la partida (PantallaPartidaOnline.jsx) usen EXACTAMENTE
// el mismo botón — mismo tamaño/color/confirmación en las dos.
//
// Piece PP (batch overnight post-EE, resumida): al principio (piece MM)
// esto era position:fixed, clavado en la esquina de la ventana por
// encima de todo — un overlay flotante, no parte de la pantalla. Ahora
// vive en el flujo normal del documento (alignSelf:"flex-start" para
// despegarse del centrado del contenedor flex-column de cada pantalla,
// ver fondoStyle en PantallaPartidaOnline.jsx/PantallaOnlineSala.jsx —
// todas comparten el mismo patrón alignItems:"center"). Como este
// componente ya se monta como el último hijo (o el anteúltimo, antes de
// los overlays) de cada pantalla, en las pantallas que sí tienen "la
// habitación" (MesaCircular — playing/resolving/copas_menu/oros_menu/
// closing/bidding) queda automáticamente pegado justo debajo del borde
// exterior de esa mesa cuadrada, sin lógica extra; en las que no la
// tienen (dealing/finished/fallback genérico, y las 3 pantallas de sala
// en PantallaOnlineSala.jsx) queda igual de no-flotante, abajo a la
// izquierda del contenido que haya — mismo principio universal ("no
// flotante, chico, abajo a la izquierda"), el anclaje a la habitación es
// estructura extra solo donde ese borde existe.
//
// Piece M (batch overnight post-5r): onSalir ya no dispara directo del
// click — antes un click perdido (o un toque en mobile) sacaba a alguien
// de la sala sin aviso, y aunque piece M's join_room fix ahora deja
// volver a entrar mid-game, seguía siendo una acción destructiva sin
// red. Confirmación acotada al propio botón (estado local).
export function BotonSalir({ onSalir }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div style={{ alignSelf: "flex-start" }}>
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
