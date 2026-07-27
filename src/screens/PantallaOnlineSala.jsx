import { useEffect, useState } from "react";
import { useSala } from "../hooks/useSala";
import { repartirMano } from "../lib/game";
import { marcarListo } from "../lib/rooms";
import { mensajeDeError } from "../lib/erroresSala";
import { PantallaPartidaOnline } from "./PantallaPartidaOnline";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, tituloStyle, codigoStyle,
  equipoLabelStyle, filaStyle, filaVaciaStyle, puntoStyle, nombreStyle,
  ctaStyle, secondaryBtnStyle, WORDMARK, diagonalWordmarkStyle,
} from "../theme";

// Fila de un asiento: nombre si está ocupado, placeholder si no, insignia
// de capitán (seat 0 y 1, auto-asignados por join_room) y un indicador de
// "listo" (●/○) por asiento — llega en vivo vía Realtime, players ya está
// en el canal de useSala, no hace falta canal nuevo. Sub-componente local
// no exportado, mismo patrón que MesaCircular.jsx (EstrellasSVG,
// CartasManoSVG). El glyph ●/○ se mantiene como texto (no un círculo CSS)
// a propósito: los tests de Playwright leen el estado "listo" por
// textContent de la fila.
function FilaAsiento({ seat, jugador, mySeat, team }) {
  const ocupado = !!jugador;
  const listo = ocupado && jugador.ready;
  return (
    <div style={ocupado ? filaStyle(team, { listo }) : filaVaciaStyle}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", width: 14, flexShrink: 0 }}>#{seat}</span>
      {ocupado && <span style={puntoStyle(team, { listo })}>{listo ? "●" : "○"}</span>}
      <span style={{
        ...nombreStyle, flex: 1, textAlign: "left",
        fontStyle: ocupado ? "normal" : "italic",
        color: ocupado ? nombreStyle.color : "rgba(255,255,255,0.3)",
        fontSize: 13,
      }}>
        {ocupado ? jugador.name : "— vacío —"}{ocupado && seat === mySeat ? " (vos)" : ""}
      </span>
      {ocupado && jugador.is_captain && (
        <span style={{ fontSize: 9, color: colors.team[team].accent, whiteSpace: "nowrap", fontFamily: fonts.body, fontWeight: 600 }}>★ CAP</span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// PANTALLA ONLINE SALA — lobby real (pieza 5c; "listo" por jugador en vez
// de un botón único, pieza 5h; rework visual "chrome" NBA Live 2001, ver
// src/theme.js y direccion-nba-live.html — pieza 5i, solo esta pantalla)
// ══════════════════════════════════════════════
// Sigue usando useSala (pieza 5a) como única fuente de estado en vivo, sin
// duplicar nada de la suscripción. La transición a "partida arrancada" no
// la decide quien apretó ningún botón: se dispara sola cuando gameState
// llega por realtime (deal_hand lo crea en la misma transacción que pone
// rooms.status en 'playing'), así que las 4 sesiones pasan de pantalla a
// la vez.
//
// Arranque automático: cada jugador marca su propio `ready` (set_ready
// nunca toca el de otro). Cuando la sala está completa y todos quedan
// listos, CADA sesión intenta repartirMano() por su cuenta, sin
// coordinarse entre sí — a propósito: deal_hand ya está guardado por
// rooms.status<>'waiting' (el mismo chequeo que usa para la primera
// mano), así que solo el primer intento que llega tiene efecto real y el
// resto recibe 'room_not_open' sin romper nada — mismo patrón "ungated"
// que ya usa el botón "Repartir mano" para la mano 2 en adelante.
export function PantallaOnlineSala({ roomId, onSalir }) {
  const { room, players, gameState, playedCards, handResults, userId, mySeat, myTeam, isCaptain, ready, error, fetchMyHand } = useSala(roomId);
  const [enviandoListo, setEnviandoListo] = useState(false);
  const [errorListo, setErrorListo] = useState(null);

  // Fuente Saira Condensed / Barlow Semi Condensed, propia de esta
  // pantalla — el resto de la app (menús, hotseat) sigue con Cinzel/Crimson
  // Text hasta que se haga el rollout del resto de las piezas.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const yo = players.find((p) => p.user_id === userId) ?? null;
  const misListo = yo?.ready ?? false;

  const nJug = room?.config?.nJug ?? players.length;
  const salaCompleta = players.length === nJug;
  const todosListos = salaCompleta && players.length > 0 && players.every((p) => p.ready);

  useEffect(() => {
    if (!todosListos || gameState) return;
    repartirMano(roomId).catch(() => {});
  }, [todosListos, gameState, roomId]);

  const alternarListo = async () => {
    setErrorListo(null);
    setEnviandoListo(true);
    try {
      await marcarListo(roomId, !misListo);
    } catch (err) {
      setErrorListo(await mensajeDeError(err));
    } finally {
      setEnviandoListo(false);
    }
  };

  const fondoStyle = {
    background: colors.bg, minHeight: "100vh", fontFamily: fonts.body,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
    padding: "30px 14px",
  };

  if (error) {
    return (
      <div style={fondoStyle}>
        <div style={badgeStyle}>LB</div>
        <div style={tituloStyle}>SALA</div>
        <div style={{ fontSize: 12, color: "#ffb3a8", background: "rgba(160,50,30,0.18)", border: "1px solid rgba(255,140,100,0.4)", borderRadius: 10, padding: "10px 14px", textAlign: "center", fontFamily: fonts.body }}>
          No se pudo cargar la sala: {error.message}
        </div>
        <button onClick={onSalir} style={secondaryBtnStyle()}>Salir de la sala</button>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={fondoStyle}>
        <div style={badgeStyle}>LB</div>
        <div style={tituloStyle}>SALA</div>
        <div style={{ fontSize: 12, color: colors.text.secondary, fontFamily: fonts.body }}>Cargando sala…</div>
      </div>
    );
  }

  // Ya se repartió la primera mano: la mesa de juego real (pieza 5d cubre
  // dealing/bidding, 5e suma jugar cartas y resolución, 5f suma copas/oros;
  // cierre/reloj/fin de partida es la 5g), montada sobre esta misma
  // instancia de useSala — sin segunda suscripción.
  if (gameState) {
    return (
      <PantallaPartidaOnline
        roomId={roomId}
        room={room}
        players={players}
        gameState={gameState}
        playedCards={playedCards}
        handResults={handResults}
        mySeat={mySeat}
        myTeam={myTeam}
        isCaptain={isCaptain}
        fetchMyHand={fetchMyHand}
        onSalir={onSalir}
      />
    );
  }

  // LOBBY
  const asientos = Array.from({length:nJug}, (_,seat)=>({seat, jugador: players.find(p=>p.seat===seat) ?? null}));
  // A diferencia de PantallaPartida.jsx (hotseat, una sola pantalla
  // compartida sin punto de vista individual), acá "NOSOTROS"/"ELLOS" es
  // relativo a mySeat: cada jugador ve su propio equipo primero, no
  // siempre team 0. Si mySeat todavía no se resolvió (debería ser
  // momentáneo), se cae al mapeo fijo team0="NOSOTROS" en vez de adivinar.
  const miEquipo = mySeat!=null ? mySeat%2 : 0;
  const misCompaneros = asientos.filter(a=>a.seat%2===miEquipo);
  const rivales = asientos.filter(a=>a.seat%2!==miEquipo);

  return (
    <div style={fondoStyle}>
      <div style={{ ...panelStyle, width: "100%", maxWidth: 420, padding: "20px 18px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div style={diagonalWordmarkStyle}>
          {Array(6).fill(WORDMARK).join(" · ")}
        </div>

        <div style={badgeStyle}>LB</div>
        <div style={tituloStyle}>SALA</div>

        <div>
          <div style={{ fontSize: 11, color: colors.text.secondary, letterSpacing: 2, textAlign: "center", fontFamily: fonts.body, fontWeight: 600 }}>CÓDIGO PARA COMPARTIR</div>
          <div style={codigoStyle}>{room.code}</div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(200,210,255,0.5)", fontFamily: fonts.body, marginTop: -8 }}>Jugadores conectados: {players.length}/{nJug}</div>

        <div style={{display:"flex",gap:12,width:"100%"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{...equipoLabelStyle("nosotros"), textAlign:"center", marginBottom:2}}>NOSOTROS</div>
            {misCompaneros.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} team="nosotros"/>
            ))}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{...equipoLabelStyle("ellos"), textAlign:"center", marginBottom:2}}>ELLOS</div>
            {rivales.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} team="ellos"/>
            ))}
          </div>
        </div>

        {errorListo&&(
          <div style={{ fontSize: 11, color: "#ffb3a8", background: "rgba(160,50,30,0.18)", border: "1px solid rgba(255,140,100,0.4)", borderRadius: 10, padding: "8px 12px", textAlign: "center", width: "100%", fontFamily: fonts.body }}>
            {errorListo}
          </div>
        )}

        <button onClick={alternarListo} disabled={enviandoListo||!yo} style={ctaStyle({ disabled: enviandoListo||!yo })}>
          {enviandoListo?"...":misListo?"✓ Listo — tocá para cancelar":"Estoy listo"}
        </button>

        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic", textAlign: "center", fontFamily: fonts.body }}>
          {ready?"Conectado en vivo.":"Conectando…"} La partida arranca sola cuando la sala esté completa y todos estén listos.
        </div>
      </div>

      <button onClick={onSalir} style={secondaryBtnStyle()}>Salir de la sala</button>
    </div>
  );
}
