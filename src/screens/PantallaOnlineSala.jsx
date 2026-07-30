import { useEffect, useState } from "react";
import { useSala } from "../hooks/useSala";
import { sortearRepartoInicial, repartirMano } from "../lib/game";
import { marcarListo, elegirEquipo } from "../lib/rooms";
import { mensajeDeError } from "../lib/erroresSala";
import { SorteoAnimado } from "../components/SorteoAnimado";
import { PantallaPartidaOnline } from "./PantallaPartidaOnline";
import {
  FONTS_URL, colors, fonts, bevel, panelStyle, badgeStyle, tituloStyle, codigoStyle,
  equipoLabelStyle, filaStyle, filaVaciaStyle, puntoStyle, nombreStyle,
  ctaStyle, secondaryBtnStyle, WORDMARK, diagonalWordmarkStyle,
} from "../theme";


// Pantalla de selección de equipo (piece 5r) — se muestra a CADA jugador
// apenas tiene un asiento reservado en la sala (join_room ya corrió) pero
// todavía no eligió equipo (yo.team === null), tanto al host (apenas crea
// + se une a su propia sala) como a cualquiera que se une después. Los
// slots LOCAL/VISITANTE son fijos, no relativos a quién mira — el primero
// en entrar a cada uno queda capitán y el asiento que le toca (par para
// LOCAL, impar para VISITANTE) es lo que mantiene la invariante
// seat%2===team que submit_bid/close_hand/clock_expired siguen asumiendo
// sin haber tenido que tocarlas (ver choose_team_rpc.sql). Montada como
// sub-vista de PantallaOnlineSala, mismo patrón que SorteoAnimado —
// reusa la instancia de useSala del padre, sin suscripción propia.
function SeleccionEquipo({ roomId, nJug, players, onSalir, onElegido }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const cupo = nJug / 2;
  const equipos = [
    { team: 0, key: "local", nombre: "LOCAL", cuenta: players.filter((p) => p.team === 0).length },
    { team: 1, key: "visitante", nombre: "VISITANTE", cuenta: players.filter((p) => p.team === 1).length },
  ];

  // onElegido(team) avisa al padre apenas la RPC devuelve éxito, sin
  // esperar a que la fila propia vuelva por Realtime — a diferencia de
  // "listo" (donde cualquier jugador puede tardar en verse a sí mismo sin
  // romper nada más), acá SÍ importa: postgres_changes nunca hace backfill
  // de eventos previos a que la suscripción termine de armarse (ver
  // scripts/verify-realtime-sala.mjs), así que si este click cae antes de
  // que el canal de useSala llegue a SUBSCRIBED, el UPDATE de esta propia
  // fila se pierde para siempre y esta pantalla quedaría trabada sin
  // ningún timeout que la salve. choose_team ya devuelve la fila
  // actualizada en la respuesta — no hace falta esperar el eco.
  const elegir = async (team) => {
    setError(null);
    setEnviando(true);
    try {
      await elegirEquipo(roomId, team);
      onElegido(team);
    } catch (err) {
      setError(await mensajeDeError(err));
      setEnviando(false);
    }
  };

  const fondoStyle = {
    background: colors.bg, minHeight: "100vh", fontFamily: fonts.body,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
    padding: "30px 14px",
  };

  return (
    <div style={fondoStyle}>
      <div style={{ ...panelStyle, width: "100%", maxWidth: 420, padding: "20px 18px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <div style={badgeStyle}>LB</div>
        <div style={tituloStyle}>ELEGÍ TU EQUIPO</div>

        {error && (
          <div style={{ fontSize: 11, color: "#ffb3a8", background: "rgba(160,50,30,0.18)", border: "1px solid rgba(255,140,100,0.4)", borderRadius: 10, padding: "8px 12px", textAlign: "center", width: "100%", fontFamily: fonts.body }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {equipos.map(({ team, key, nombre, cuenta }) => {
            const t = colors.team[key];
            const lleno = cuenta >= cupo;
            const deshabilitado = enviando || lleno;
            return (
              <button key={team} onClick={() => elegir(team)} disabled={deshabilitado} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 16, letterSpacing: 2,
                color: colors.text.primary, borderRadius: 16, padding: "20px 10px",
                border: `1.5px solid ${t.border}`, background: t.gradient, boxShadow: bevel,
                cursor: deshabilitado ? "not-allowed" : "pointer",
                opacity: lleno ? 0.5 : 1,
              }}>
                {nombre}
                <span style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 11, letterSpacing: 1, opacity: 0.85 }}>
                  {cuenta}/{cupo}{lleno ? " · COMPLETO" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic", textAlign: "center", fontFamily: fonts.body }}>
          El primero en entrar a cada equipo queda de capitán.
        </div>
      </div>

      <button onClick={onSalir} style={secondaryBtnStyle()}>Salir de la sala</button>
    </div>
  );
}

// Fila de un asiento: nombre si está ocupado, placeholder si no, insignia
// de capitán (primero en elegir cada equipo en SeleccionEquipo, ver arriba
// — siempre seat 0 para LOCAL y seat 1 para VISITANTE) y un indicador de
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
// Arranque automático, en dos pasos (piece 5l): cada jugador marca su
// propio `ready` (set_ready nunca toca el de otro). Cuando la sala está
// completa y todos quedan listos, CADA sesión intenta
// sortearRepartoInicial() por su cuenta, sin coordinarse entre sí — a
// propósito: sortear_reparto_inicial solo escribe rooms.sorteo_inicial si
// todavía es null, así que solo el primer intento que llega tiene efecto
// real y el resto ve el mismo resultado ya calculado (mismo patrón
// "ungated" que deal_hand). Piece R: ya no hay timer fijo desde que
// aparece rooms.sorteo_inicial — cada asiento tiene que dar vuelta su
// carta Y confirmar "ARRANCAMOS" (SorteoAnimado.jsx, rooms.sorteo_inicial.
// arrancamos) antes de que CUALQUIER sesión llame a repartirMano(). Mismo
// no-coordination-needed de siempre: las 4 sesiones lo intentan a la vez
// apenas todosArrancaron, solo el primer intento reparte de verdad
// (deal_hand sigue gateado por rooms.status<>'waiting'), el resto recibe
// 'room_not_open' sin romper nada.
export function PantallaOnlineSala({ roomId, onSalir }) {
  const { room, players, gameState, playedCards, handResults, userId, mySeat, myTeam, isCaptain, ready, error, fetchMyHand } = useSala(roomId);
  const [enviandoListo, setEnviandoListo] = useState(false);
  const [errorListo, setErrorListo] = useState(null);
  // Espejo local de "ya elegí equipo" — no depende del eco de Realtime
  // (ver comentario largo en SeleccionEquipo). Una vez en true se queda
  // así para el resto de la vida del componente; cuando players sí
  // alcanza a reflejar el team elegido, yo.team deja de ser null también,
  // así que ninguna de las dos fuentes queda "atrasada" de forma visible.
  const [equipoLocalElegido, setEquipoLocalElegido] = useState(null);

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
  const tieneSorteo = !!room?.sorteo_inicial;
  // Piece R: la mano recién se reparte cuando los nJug asientos
  // confirmaron ARRANCAMOS (rooms.sorteo_inicial.arrancamos, ver
  // marcar_arrancamos_sorteo/SorteoAnimado.jsx) — ya no un timer fijo
  // desde que aparece el sorteo, sin importar si alguien todavía no dio
  // vuelta su carta ni confirmó nada.
  const arrancamosSorteo = room?.sorteo_inicial?.arrancamos ?? {};
  const todosArrancaron = tieneSorteo && Array.from({ length: nJug }, (_, s) => s).every((s) => !!arrancamosSorteo[s]);

  useEffect(() => {
    if (!todosListos || gameState || tieneSorteo) return;
    sortearRepartoInicial(roomId).catch(() => {});
  }, [todosListos, gameState, tieneSorteo, roomId]);

  // Dispara deal_hand server-side apenas todosArrancaron — igual patrón
  // "ungated" que sortearRepartoInicial: las 4 sesiones lo intentan a la
  // vez, deal_hand solo deja efecto a la primera (rooms.status='waiting').
  // Si gameState ya existe (otra sesión ya lo hizo), no hace falta
  // reintentar.
  useEffect(() => {
    if (!todosArrancaron || gameState) return;
    repartirMano(roomId).catch(() => {});
  }, [todosArrancaron, gameState, roomId]);

  // "Ya vi el sorteo" — LOCAL a esta sesión, sin importar si gameState YA
  // existía apenas montó (sesión que reconecta tarde, después de que otra
  // sesión ya completó todo el ciclo sorteo→deal_hand). Sin este gate, el
  // render de abajo (`if (gameState) return <PantallaPartidaOnline>` antes
  // que el chequeo de sorteo) dejaba a esa sesión saltar derecho a la
  // mesa sin haber visto nunca el sorteo — bug real reportado en
  // producción, reproducido con un reload a mitad del reparto en
  // online-sorteo-inicial.spec.js. Piece H: ya no es un timer ciego de 3s
  // desde tieneSorteo — SorteoAnimado llama a onCumplido() recién cuando
  // los nJug asientos dieron vuelta su carta. Piece R: eso ahora además
  // exige que los nJug asientos confirmen ARRANCAMOS (rooms.sorteo_inicial.
  // arrancamos) — las cartas quedan asentadas en la mesa hasta que se
  // confirma, sin auto-avanzar solas; una sesión que reconecta después de
  // que todos ya confirmaron ve el estado final de una, sin repetir la
  // animación ni esperar ningún click (mismo patrón de "detectar el estado
  // ya resuelto al montar" que sorteoCumplido siempre usó, ahora vive
  // dentro de SorteoAnimado).
  const [sorteoCumplido, setSorteoCumplido] = useState(false);

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

  // Selección de equipo (piece 5r) — se muestra ANTES del lobby, a esta
  // sesión únicamente, mientras todavía no eligió equipo. Se apoya en
  // equipoLocalElegido (set apenas la RPC devuelve éxito) en vez de
  // esperar a que yo.team dejе de ser null vía Realtime — ver el
  // comentario largo en SeleccionEquipo sobre por qué depender del eco
  // acá es inseguro. Si gameState ya existe, por construcción yo.team ya
  // está seteado (deal_hand exige seat asignado para las n_jug filas), así
  // que esta rama nunca compite con la mesa de juego real.
  if (yo && yo.team == null && equipoLocalElegido == null) {
    return <SeleccionEquipo roomId={roomId} nJug={nJug} players={players} onSalir={onSalir} onElegido={setEquipoLocalElegido} />;
  }

  // Ya se repartió la primera mano: la mesa de juego real (pieza 5d cubre
  // dealing/bidding, 5e suma jugar cartas y resolución, 5f suma copas/oros;
  // cierre/reloj/fin de partida es la 5g), montada sobre esta misma
  // instancia de useSala — sin segunda suscripción. Para la mano 0
  // específicamente, además exige sorteoCumplido — si no, una sesión que
  // monta/reconecta después de que deal_hand ya corrió (gameState llega
  // de entrada, no por Realtime) saltaría derecho para acá sin haber
  // visto nunca el sorteo (ver el comentario largo junto a sorteoCumplido
  // más arriba).
  if (gameState && (gameState.hand_number > 0 || sorteoCumplido)) {
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

  // Sorteo ya resuelto server-side — todavía no se repartió la mano 0, o sí
  // se repartió pero esta sesión recién lo está viendo ahora (sorteoCumplido
  // en camino, ver arriba). Reemplaza el lobby de "listo" por la animación
  // de revelado (piece H) — cada asiento da vuelta su propia carta a su
  // ritmo, ver SorteoAnimado.jsx.
  if (room.sorteo_inicial) {
    return (
      <SorteoAnimado
        roomId={roomId} nJug={nJug} players={players} mySeat={mySeat}
        sorteo={room.sorteo_inicial} onCumplido={() => setSorteoCumplido(true)}
      />
    );
  }

  // LOBBY
  const asientos = Array.from({length:nJug}, (_,seat)=>({seat, jugador: players.find(p=>p.seat===seat) ?? null}));
  // LOCAL/VISITANTE son fijos (piece 5r) — todo jugador ve la misma
  // columna para el mismo equipo, sin importar en cuál esté (a diferencia
  // de la versión vieja, donde "NOSOTROS"/"ELLOS" era relativo a mySeat).
  // seat%2 alcanza acá porque choose_team garantiza LOCAL=asientos pares,
  // VISITANTE=impares (ver choose_team_rpc.sql) — no hace falta leer
  // jugador.team.
  const localAsientos = asientos.filter(a=>a.seat%2===0);
  const visitanteAsientos = asientos.filter(a=>a.seat%2===1);

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
            <div style={{...equipoLabelStyle("local"), textAlign:"center", marginBottom:2}}>LOCAL</div>
            {localAsientos.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} team="local"/>
            ))}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{...equipoLabelStyle("visitante"), textAlign:"center", marginBottom:2}}>VISITANTE</div>
            {visitanteAsientos.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} team="visitante"/>
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
