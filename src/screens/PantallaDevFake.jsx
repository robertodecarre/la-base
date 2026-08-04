import { useState } from "react";
import { SorteoAnimado } from "../components/SorteoAnimado";
import { PantallaPartidaOnline } from "./PantallaPartidaOnline";
import { fakePlayers, fakeRoom, fakeGameState, fakeMisCartas, fakeSorteo } from "../lib/devFake";
import { useGestos } from "../hooks/useGestos";
import { colors, fonts, ctaStyle, secondaryBtnStyle } from "../theme";

// ══════════════════════════════════════════════
// PANTALLA DEV FAKE (feature #3, batch post-mano_seat-split) — botón
// SOLO DEV: acceso directo a una mesa/sorteo de 6 u 8 jugadores con datos
// sintéticos (mismo shape exacto que Supabase, ver lib/devFake.js), para
// probar rotación/espaciado/caras sin coordinar 6-8 sesiones reales.
//
// A propósito NO es un renderer paralelo: monta SorteoAnimado /
// PantallaPartidaOnline tal cual, el mismo código que ve un jugador real
// — la "falsedad" está solo en los datos, no en el camino de render. Los
// botones que disparan RPCs reales (pedir, jugar carta, etc.) van a
// fallar contra un roomId que no existe en la base — ya tienen su propio
// manejo de error (mensaje inline, no crashea), así que es inofensivo;
// esto es para MIRAR el layout, no para jugar una partida de verdad.
export function PantallaDevFake({ onSalir }) {
  const [nJug, setNJug] = useState(6);
  const [modo, setModo] = useState("bidding"); // "sorteo" | "bidding"

  // Canal de señas real (broadcast contra Supabase, mismo hook que la app
  // real usa) — "dev-fake-room" es un roomId inventado, así que esto no
  // interfiere con ninguna sala real; sirve para probar que las señas
  // andan igual en sorteo/mesa con el mismo código de producción.
  const { gestosPorAsiento, enviarGesto } = useGestos("dev-fake-room", 0);

  const players = fakePlayers(nJug);
  const room = fakeRoom(nJug);
  const gameState = fakeGameState(nJug);
  const misCartas = fakeMisCartas();
  const sorteo = fakeSorteo(nJug);

  const selector = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px", alignItems: "center" }}>
      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 11, letterSpacing: 2, color: colors.text.secondary }}>
        DEV — PARTIDA DE PRUEBA (no se guarda nada)
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[6, 8].map((n) => (
          <button key={n} onClick={() => setNJug(n)} style={{ ...secondaryBtnStyle({}), opacity: nJug === n ? 1 : 0.5, border: nJug === n ? `1px solid ${colors.cta.border}` : undefined }}>
            {n} jugadores
          </button>
        ))}
        {["sorteo", "bidding"].map((m) => (
          <button key={m} onClick={() => setModo(m)} style={{ ...secondaryBtnStyle({}), opacity: modo === m ? 1 : 0.5, border: modo === m ? `1px solid ${colors.cta.border}` : undefined }}>
            {m === "sorteo" ? "Sorteo" : "Mesa"}
          </button>
        ))}
        <button onClick={onSalir} style={ctaStyle({})}>Salir</button>
      </div>
    </div>
  );

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: fonts.body }}>
      {selector}
      {modo === "sorteo" ? (
        <SorteoAnimado
          roomId="dev-fake-room" nJug={nJug} players={players} mySeat={0}
          sorteo={sorteo} onCumplido={() => {}}
          gestosPorAsiento={gestosPorAsiento} enviarGesto={enviarGesto}
        />
      ) : (
        <PantallaPartidaOnline
          roomId="dev-fake-room" room={room} players={players} gameState={gameState}
          playedCards={[]} handResults={[]}
          mySeat={0} myTeam={0} isCaptain={true}
          fetchMyHand={async () => misCartas}
          recargarEstado={async () => {}}
          onSalir={onSalir}
          gestosPorAsiento={gestosPorAsiento} enviarGesto={enviarGesto}
        />
      )}
    </div>
  );
}
