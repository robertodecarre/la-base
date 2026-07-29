import { useEffect, useState } from "react";
import { PanelPedir } from "../components/PanelPedir";
import { MesaCircular } from "../components/MesaCircular";
import { DisplayReloj } from "../components/DisplayReloj";
import { Tablero } from "../components/Tablero";
import { EstrellasPedido } from "../components/EstrellasPedido";
import { CartaSVG } from "../components/cards/CartaSVG";
import { Btn } from "../components/Btn";
import {
  enviarPedido, jugarCarta, siguienteBase, resolverCopas, resolverOros,
  repartirMano, cerrarMano, reclamarTiempo,
} from "../lib/game";
import { mensajeDeError } from "../lib/erroresSala";
import { ganadorParcial } from "../engine/trick";
import { colors, fonts, panelStyle } from "../theme";

// Resumen fusionado arriba de MesaCircular (piece 5n, ver direccion-integrada.html):
// puntaje acumulado por equipo (color de equipo, rojo/glow si va en contra),
// estrellas pedidas-vs-hechas de la mano EN CURSO (EstrellasPedido tal cual,
// con datos en vivo — no confundir con las estrellas históricas de Tablero,
// que son por mano ya cerrada) y meta de mano/cartas a la derecha.
// LOCAL/VISITANTE son fijos (equipo 0/1), no relativos a quién mira (piece 5r).
function ResumenMarcador({ scoreLocal, scoreVisitante, pedLocal, hechoLocal, pedVisitante, hechoVisitante, handNumber, totalHands, totalBases }) {
  const eqScore = (score) => ({
    fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 24,
    color: score < 0 ? colors.negative : colors.team.local.readyBorder,
  });
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:26,padding:"9px 18px",position:"relative",borderBottom:"1px solid rgba(140,160,240,0.18)"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:10,letterSpacing:2,marginBottom:2,color:colors.team.local.accent,fontFamily:fonts.body,fontWeight:600}}>LOCAL</div>
        <div style={{...eqScore(scoreLocal), color: scoreLocal<0?colors.negative:colors.team.local.readyBorder, textShadow:`0 0 12px ${scoreLocal<0?"rgba(255,90,90,0.5)":colors.team.local.readyGlow}`}}>{scoreLocal}</div>
        <EstrellasPedido pedidas={pedLocal} hechas={hechoLocal} color={colors.team.local.readyBorder}/>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:10,letterSpacing:2,marginBottom:2,color:colors.team.visitante.accent,fontFamily:fonts.body,fontWeight:600}}>VISITANTE</div>
        <div style={{...eqScore(scoreVisitante), color: scoreVisitante<0?colors.negative:colors.team.visitante.readyBorder, textShadow:`0 0 12px ${scoreVisitante<0?"rgba(255,90,90,0.5)":colors.team.visitante.readyGlow}`}}>{scoreVisitante}</div>
        <EstrellasPedido pedidas={pedVisitante} hechas={hechoVisitante} color={colors.team.visitante.readyBorder}/>
      </div>
      <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",textAlign:"right",fontSize:9,color:"rgba(200,210,255,0.5)",letterSpacing:0.5,lineHeight:1.4,fontFamily:fonts.body}}>
        MANO {handNumber+1}/{totalHands}<br/>{totalBases} CARTA{totalBases!==1?"S":""}
      </div>
    </div>
  );
}

// Bloque fusionado resumen+mesa, mismo marco compartido — se repite en
// bidding/playing/resolving/copas_menu/oros_menu/closing (piece 5n: antes
// la mesa/marcador no se veían fuera de 'playing').
function BloqueMesa({ resumen, children }) {
  return (
    <div style={{...panelStyle, borderRadius:16, width:"100%", maxWidth:640}}>
      <ResumenMarcador {...resumen}/>
      {children}
    </div>
  );
}

// El reloj de ajedrez online (pieza 5g) es server-authoritative: el
// descuento real de tiempo ya lo hace submit_bid al recibir cada pedido, y
// el conteo visible más abajo se deriva directo de game_state.clock por
// Realtime (ver `restante`/`agotado` en el cuerpo del componente) — no de
// este objeto. PanelPedir igual exige un `clock` con iniciarPara/detener
// por su interfaz compartida con el hotseat, pero con modoUnEquipo nunca
// llega a invocar iniciarPara, y el detener() que sí dispara confirmarPie
// no necesita hacer nada acá.
const CLOCK_ADAPTER_PANEL = { iniciarPara: () => {}, detener: () => {} };

// Fondo compartido por TODAS las pantallas de fase de esta partida — sin
// esto, esta era la única pantalla reskineada que no tapaba el body (ver
// index.html), dejando ver el verde viejo alrededor/detrás de la mesa.
const fondoStyle = { background: colors.bg, minHeight: "100vh", fontFamily: fonts.body };

function MiMano({ cartas, error }) {
  if (error) {
    return <div style={{fontSize:11,color:"#e88"}}>No se pudo cargar tu mano: {error.message}</div>;
  }
  if (!cartas) {
    return <div style={{fontSize:11,color:"rgba(201,168,76,0.4)"}}>Cargando tu mano…</div>;
  }
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",minHeight:52}}>
      {cartas.map((carta) => (
        <svg key={carta.uid} viewBox="0 0 36 52" width={36} height={52}>
          <CartaSVG carta={carta} w={36} h={52}/>
        </svg>
      ))}
    </div>
  );
}

// Panel de solo lectura para todos menos el capitán a quien le toca pedir
// ahora mismo — mirror informativo de lo que submit_bid ya validó server-side.
function EsperaPedido({ totalBases, nombreCapitanTurno, colorTurno, bidMano, kamikazeDeclarado }) {
  return (
    <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:10,padding:"12px 16px",width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
      <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",letterSpacing:2}}>
        {totalBases} BASE{totalBases!==1?"S":""} EN JUEGO{kamikazeDeclarado&&<span style={{color:"#e05555",marginLeft:8}}>✈️ KAMIKAZE</span>}
      </div>
      {bidMano!=null&&(
        <div style={{fontSize:12,color:"rgba(201,168,76,0.6)"}}>Mano pidió <b style={{color:"#f0d080"}}>{bidMano}</b></div>
      )}
      <div style={{fontSize:12,color:colorTurno}}>
        Esperando a que <b>{nombreCapitanTurno}</b> confirme el pedido…
      </div>
    </div>
  );
}

// Fila de cartas ya jugadas — played_cards es pública, así que mostrarla no
// filtra nada. `seatDestacado` es opcional (quién ganó la base, o el
// portador del As de Copas); sin ganador todavía (as de copas a mitad de
// ronda, o menú de copas con la base recién completa pero sin resolver) se
// puede pasar null y no se resalta a nadie.
function FilaCartasJugadas({ cartas, seatDestacado }) {
  return (
    <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
      {cartas.map(({ pc, nombre, seat }) => (
        <div key={pc.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:9,color:seat===seatDestacado?"#f0d080":"rgba(201,168,76,0.5)",fontWeight:seat===seatDestacado?"bold":"normal"}}>{nombre}</div>
          <svg viewBox="0 0 34 50" width={34} height={50}>
            <CartaSVG carta={pc.card} w={34} h={50}/>
          </svg>
        </div>
      ))}
    </div>
  );
}

// Fase 'resolving': la base ya se decidió server-side (last_trick_winner_seat)
// pero nadie confirmó el avance todavía. Muestra las cartas de esa base ya
// completa y quién la ganó.
function BaseResuelta({ cartas, nombreGanador, seatGanador }) {
  return (
    <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:10,padding:"12px 16px",width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
      <div style={{fontSize:12,color:"#f0d080"}}>¡<b>{nombreGanador}</b> gana la base!</div>
      <FilaCartasJugadas cartas={cartas} seatDestacado={seatGanador}/>
    </div>
  );
}

// "Salir de la sala" (piece E, batch overnight post-5r): aislado del resto
// de las acciones de cada pantalla — chico, rojo (colors.danger via Btn
// danger+small), con margen propio arriba para separarlo visualmente de
// la acción principal en vez de sentarse pegado a "Cerrar mano"/"Repartir
// mano" como antes.
function BotonSalir({ onSalir }) {
  return (
    <div style={{ marginTop: 18 }}>
      <Btn danger small onClick={onSalir}>Salir de la sala</Btn>
    </div>
  );
}

// Overlay del Tablero (piece F, batch overnight post-5r) — antes el
// historial de manos era siempre visible debajo de la mesa; ahora se abre
// como panel flotante al tocar el ícono de libreta entre los capitanes
// (ver LibretaIcon en MesaCircular.jsx). Backdrop clickeable para cerrar,
// mismo panelStyle que el resto del chrome.
function TableroOverlay({ estructura, historial, manoActual, onCerrar }) {
  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, background: "rgba(6,8,20,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, width: "100%", maxWidth: 320, maxHeight: "80vh", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: 2, color: colors.text.secondary }}>LIBRETA</div>
          <button onClick={onCerrar} style={{ background: "none", border: "none", color: colors.text.secondary, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <Tablero estructura={estructura} historial={historial} manoActual={manoActual}/>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PANTALLA PARTIDA ONLINE — mesa real (piezas 5d/5e/5f/5g)
// ══════════════════════════════════════════════
// Se monta desde PantallaOnlineSala una vez que gameState existe, reusando
// la misma instancia de useSala (sin segunda suscripción). Cubre 'dealing'/
// 'bidding' (5d), 'playing'/'resolving' (5e), 'copas_menu'/'oros_menu' (5f)
// y ahora 'closing'/'finished' + el reloj real de 'bidding' (5g) — con esto
// la pantalla cubre todas las fases del juego.
export function PantallaPartidaOnline({ roomId, room, players, gameState, playedCards, handResults, mySeat, myTeam, isCaptain, fetchMyHand, onSalir }) {
  const [misCartas, setMisCartas] = useState(null);
  const [errorMano, setErrorMano] = useState(null);
  const [kamikazeLocal, setKamikazeLocal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorPedido, setErrorPedido] = useState(null);
  const [expandidos, setExpandidos] = useState({});
  const [cartasLevantadas, setCartasLevantadas] = useState({});
  const [enviandoJugada, setEnviandoJugada] = useState(false);
  const [errorJugada, setErrorJugada] = useState(null);
  const [enviandoResolucion, setEnviandoResolucion] = useState(false);
  const [errorResolucion, setErrorResolucion] = useState(null);
  const [enviandoCopas, setEnviandoCopas] = useState(false);
  const [errorCopas, setErrorCopas] = useState(null);
  const [enviandoOros, setEnviandoOros] = useState(false);
  const [errorOros, setErrorOros] = useState(null);
  const [enviandoCierre, setEnviandoCierre] = useState(false);
  const [errorCierre, setErrorCierre] = useState(null);
  const [enviandoReparto, setEnviandoReparto] = useState(false);
  const [errorReparto, setErrorReparto] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [reclamandoTiempo, setReclamandoTiempo] = useState(false);
  // Piece F: preferencia del jugador, no estado de la mano — a propósito
  // NO se resetea en el useEffect de "cambio de mano" de más abajo (a
  // diferencia de expandidos/cartasLevantadas/errores), así que si alguien
  // la deja abierta se le mantiene abierta entre manos.
  const [tableroAbierto, setTableroAbierto] = useState(false);

  // La propia mano nunca viaja por Realtime (ver useSala) — hay que pedirla
  // explícitamente cada vez que cambia el número de mano (deal_hand ya dejó
  // la fila en `hands` para esta mano en el momento en que gameState llega)
  // y de nuevo cada vez que jugamos una carta (play_card la saca de `hands`
  // server-side, y eso tampoco viaja por Realtime).
  const refrescarMisCartas = async () => {
    try {
      const cartas = await fetchMyHand(gameState.hand_number);
      setMisCartas(cartas ?? []);
    } catch (err) {
      setErrorMano(err);
    }
  };

  useEffect(() => {
    if (gameState.phase === "dealing") return; // hands todavía no existe para esta mano
    let cancelado = false;
    setMisCartas(null);
    setErrorMano(null);
    fetchMyHand(gameState.hand_number)
      .then((cartas) => { if (!cancelado) setMisCartas(cartas ?? []); })
      .catch((err) => { if (!cancelado) setErrorMano(err); });
    return () => { cancelado = true; };
  }, [gameState.hand_number, gameState.phase, fetchMyHand]);

  // El kamikaze elegido pero todavía no confirmado es puramente local:
  // game_state.kamikaze_declared solo pasa a true server-side después de un
  // submit_bid exitoso con kamikaze=true. Los errores de jugadas/resolución
  // y el estado de cartas expandidas/levantadas tampoco deben sobrevivir a
  // un cambio de mano.
  useEffect(() => {
    setKamikazeLocal(false);
    setErrorJugada(null);
    setErrorResolucion(null);
    setErrorCopas(null);
    setErrorOros(null);
    setErrorCierre(null);
    setErrorReparto(null);
    setExpandidos({});
    setCartasLevantadas({});
  }, [gameState.hand_number]);

  // Reloj online: solo corre visualmente durante 'bidding' (el único momento
  // que game_state.clock representa — ver claim_timeout.sql). El tiempo
  // restante en sí se deriva de clockState.running_since + `ahora` más
  // abajo; este intervalo solo fuerza el re-render cada segundo.
  useEffect(() => {
    if (gameState.phase !== "bidding") return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gameState.phase]);

  const totalBases = room.config?.estructura?.[gameState.hand_number] ?? 0;
  const nJug = room.config?.nJug ?? players.length;
  const seatOfPlayerId = (playerId) => players.find((p) => p.id === playerId)?.seat;
  const jugadorEnAsiento = (seat) => players.find((p) => p.seat === seat);

  // ── Datos compartidos por el resumen+mesa+tablero (piece 5n) — antes solo
  // existían dentro del branch 'playing'; se hoistean para que las demás
  // fases (bidding/resolving/menus/closing) puedan mostrar la misma mesa. ──
  // LOCAL=team 0, VISITANTE=team 1 — fijo, no relativo a quién mira (piece 5r).
  const capLocal = players.find((p) => p.team === 0 && p.is_captain)?.seat ?? 0;
  const capVisitante = players.find((p) => p.team === 1 && p.is_captain)?.seat ?? 1;

  // Cartas ya jugadas en ESTA mano (cualquier base) — pública, sirve para
  // cualquier fase que necesite mostrar la mesa, no solo 'playing'.
  const jugadasEstaMano = playedCards.filter((pc) => pc.hand_number === gameState.hand_number);

  // Cartas de una base puntual, en orden de tirada, listas para MesaCircular.
  const cartasDeTrick = (trickNumber) => jugadasEstaMano
    .filter((pc) => pc.trick_number === trickNumber)
    .sort((a, b) => a.seq_in_trick - b.seq_in_trick)
    .map((pc) => ({ carta: pc.card, jugadorIdx: seatOfPlayerId(pc.player_id) }));

  // Bases hechas por equipo EN ESTA mano (deal_hand resetea tricks_won por
  // mano) — para el resumen en vivo.
  const hechoTeam0 = players.filter((p) => p.team === 0).reduce((s, p) => s + (p.tricks_won ?? 0), 0);
  const hechoTeam1 = players.filter((p) => p.team === 1).reduce((s, p) => s + (p.tricks_won ?? 0), 0);
  const bidsActuales = gameState.bids ?? {};
  // Absoluto — LOCAL=team0/VISITANTE=team1 siempre, sin mirar myTeam.
  const pedLocal = bidsActuales.team0;
  const pedVisitante = bidsActuales.team1;
  const hechoLocal = hechoTeam0;
  const hechoVisitante = hechoTeam1;

  // Puntaje ACUMULADO (manos ya cerradas, hand_results) para el resumen.
  const totalTeam0Acum = handResults.reduce((s, h) => s + h.delta_team0, 0);
  const totalTeam1Acum = handResults.reduce((s, h) => s + h.delta_team1, 0);
  const scoreLocal = totalTeam0Acum;
  const scoreVisitante = totalTeam1Acum;

  // Historial para Tablero: una fila por hand_results ya cerrada. LOCAL/
  // VISITANTE son fijos (equipo 0/1) — piece 5r reemplaza el mapeo
  // anterior a la perspectiva de quien miraba (NOSOTROS=mi equipo).
  const estructuraCompleta = room.config?.estructura ?? [];
  const historialTablero = estructuraCompleta.map((_, i) => {
    const h = handResults.find((r) => r.hand_number === i);
    if (!h) return undefined;
    return {
      deltaLocal: h.delta_team0, deltaVisitante: h.delta_team1,
      pedLocal: h.bid_team0, hechoLocal: h.tricks_team0,
      pedVisitante: h.bid_team1, hechoVisitante: h.tricks_team1,
    };
  });

  // Jugadores para MesaCircular — la única mano real es la propia
  // (fetchMyHand); el resto solo se sabe cuántas cartas le quedan (dealt -
  // jugadas esta mano), nunca cuáles. Sirve para cualquier fase de la mano
  // en curso, no solo 'playing' como antes.
  const jugadoresMesa = Array.from({ length: nJug }, (_, seat) => {
    const jugador = jugadorEnAsiento(seat);
    const mano = seat === mySeat
      ? (misCartas ?? [])
      : Array.from(
          { length: Math.max(totalBases - jugadasEstaMano.filter((pc) => pc.player_id === jugador?.id).length, 0) },
          (_, i) => ({ uid: `back-${seat}-${i}` }),
        );
    return { nombre: jugador?.name ?? `Asiento ${seat}`, eq: jugador?.team ?? (seat % 2), mano, bases: jugador?.tricks_won ?? 0 };
  });

  const resumenProps = {
    scoreLocal, scoreVisitante, pedLocal, hechoLocal, pedVisitante, hechoVisitante,
    handNumber: gameState.hand_number, totalHands: estructuraCompleta.length, totalBases,
  };

  // room.config.clock es ausente/null (sin reloj) o { minutos, modo }. Solo
  // 'muerte' tiene una consecuencia server-side (claim_timeout) — 'deportivo'
  // no tiene flujo de reclamo acá, se muestra el conteo nomás.
  const clockConfig = room.config?.clock;
  const hayReloj = !!clockConfig && typeof clockConfig === "object";
  const esMuerte = clockConfig?.modo === "muerte";
  const clockState = gameState.clock;
  const restante = (team) => {
    if (!clockState) return 0;
    const base = clockState.teamTime?.[team] ?? 0;
    if (clockState.running === team && clockState.running_since) {
      const transcurrido = Math.floor((ahora - new Date(clockState.running_since).getTime()) / 1000);
      return Math.max(0, base - transcurrido);
    }
    return base;
  };
  const tiempoLocal = restante(0);
  const tiempoVisitante = restante(1);
  const agotadoLocal = !!clockState?.expired?.[0] || (clockState?.running === 0 && tiempoLocal <= 0);
  const agotadoVisitante = !!clockState?.expired?.[1] || (clockState?.running === 1 && tiempoVisitante <= 0);
  // DisplayReloj ahora toma directamente el team index (0=LOCAL,
  // 1=VISITANTE, fijo) — piece 5r saca el mapeo viejo a "slot relativo a
  // quién mira" que existía acá (ver 442d8a9, el mismo bug que tuvo el
  // lobby con NOSOTROS/ELLOS).
  const corriendoTeam = clockState?.running ?? null;

  // Reclamo automático: en cuanto el reloj del equipo que corre llega a
  // cero en modo muerte, cualquier sesión puede — y acá, lo intenta —
  // llamar claim_timeout. El servidor vuelve a chequear el deadline real
  // (not_expired_yet si un tick local se adelantó), así que reintentar cada
  // segundo hasta que pase o la fase cambie es seguro, no hace falta
  // coordinar quién llama.
  useEffect(() => {
    if (!hayReloj || !esMuerte || gameState.phase !== "bidding") return;
    if (!clockState || clockState.running == null || !clockState.running_since) return;
    if (reclamandoTiempo) return;
    if (restante(clockState.running) > 0) return;
    setReclamandoTiempo(true);
    reclamarTiempo(roomId).catch(() => {}).finally(() => setReclamandoTiempo(false));
  }, [ahora, hayReloj, esMuerte, gameState.phase, clockState?.running, clockState?.running_since, reclamandoTiempo]);

  const teamMano = gameState.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const bids = gameState.bids ?? {};
  const bidMano = bids[`team${teamMano}`] ?? null;
  const bidPie = bids[`team${teamPie}`] ?? null;
  // Mismo cómputo que hace submit_bid server-side: a quién le toca ahora.
  // null solo puede darse en la ventana instantánea entre que el segundo
  // equipo pide y el phase pasa a 'playing' por Realtime.
  const requiredTeam = bidMano == null ? teamMano : (bidPie == null ? teamPie : null);

  const capitanMano = players.find((p) => p.team === teamMano && p.is_captain);
  const capitanPie = players.find((p) => p.team === teamPie && p.is_captain);
  const nombresMano = players.filter((p) => p.team === teamMano).map((p) => p.name);
  const nombresPie = players.filter((p) => p.team === teamPie).map((p) => p.name);

  const esMiTurno = gameState.phase === "bidding" && isCaptain && myTeam === requiredTeam;

  const onConfirmar = async (miValor) => {
    // Con modoUnEquipo, PanelPedir entrega un solo valor: el de la subfase
    // que esta sesión efectivamente confirmó. El del otro equipo lo
    // confirma su propio capitán en su propia sesión (ver comentario de
    // modoUnEquipo/pedidoManoInicial en PanelPedir.jsx).
    setEnviando(true);
    setErrorPedido(null);
    try {
      await enviarPedido(roomId, miValor, kamikazeLocal);
    } catch (err) {
      setErrorPedido(await mensajeDeError(err));
    } finally {
      setEnviando(false);
      setKamikazeLocal(false);
    }
  };

  // MesaCircular llama onTirar(idx,ci) solo para asientos "seleccionables"
  // (ver mySeat en MesaCircular.jsx) — pero igual se valida acá, nunca
  // confiando en que el prop alcance para bloquear la interacción.
  const onTirar = async (seatIdx, cartaIdx) => {
    if (seatIdx !== mySeat) return;
    const carta = misCartas?.[cartaIdx];
    if (!carta) return;
    setEnviandoJugada(true);
    setErrorJugada(null);
    try {
      await jugarCarta(roomId, carta.uid);
      setCartasLevantadas((cl) => ({ ...cl, [mySeat]: -1 }));
      await refrescarMisCartas();
    } catch (err) {
      setErrorJugada(await mensajeDeError(err));
    } finally {
      setEnviandoJugada(false);
    }
  };

  const onSiguienteBase = async () => {
    setEnviandoResolucion(true);
    setErrorResolucion(null);
    try {
      await siguienteBase(roomId);
    } catch (err) {
      setErrorResolucion(await mensajeDeError(err));
    } finally {
      setEnviandoResolucion(false);
    }
  };

  const onElegirSentido = async (direccion) => {
    setEnviandoCopas(true);
    setErrorCopas(null);
    try {
      await resolverCopas(roomId, direccion);
    } catch (err) {
      setErrorCopas(await mensajeDeError(err));
    } finally {
      setEnviandoCopas(false);
    }
  };

  const onElegirAsiento = async (seat) => {
    setEnviandoOros(true);
    setErrorOros(null);
    try {
      await resolverOros(roomId, seat);
    } catch (err) {
      setErrorOros(await mensajeDeError(err));
    } finally {
      setEnviandoOros(false);
    }
  };

  // Sin restricción de capitán/ganador/portador — igual que el botón
  // "CERRAR MANO" offline, close_hand acepta a cualquier miembro de la sala.
  const onCerrarMano = async () => {
    setEnviandoCierre(true);
    setErrorCierre(null);
    try {
      await cerrarMano(roomId);
    } catch (err) {
      setErrorCierre(await mensajeDeError(err));
    } finally {
      setEnviandoCierre(false);
    }
  };

  // Igual de ungated: deal_hand ya distingue sola la primera mano (requiere
  // rooms.status='waiting') de las siguientes (requiere phase='dealing'),
  // así que no hace falta tratar hand_number===0 distinto acá.
  const onRepartir = async () => {
    setEnviandoReparto(true);
    setErrorReparto(null);
    try {
      await repartirMano(roomId);
    } catch (err) {
      setErrorReparto(await mensajeDeError(err));
    } finally {
      setEnviandoReparto(false);
    }
  };

  if (gameState.phase === "dealing") {
    // Solo quien va a repartir esta mano (el asiento que la mesa etiqueta
    // "PIE", pieIdx=dealer_seat en MesaCircular.jsx) puede tocar "Repartir
    // mano" — piece E. deal_hand ya lo exige server-side (deal_hand_dealer_
    // only); esto solo evita mostrarle el botón a quien igual lo rebotaría.
    const esProximoRepartidor = mySeat === gameState.dealer_seat;
    const nombreProximoRepartidor = jugadorEnAsiento(gameState.dealer_seat)?.name;
    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} de {room.config?.estructura?.length ?? "?"}
        </div>
        {errorReparto && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:340}}>
            {errorReparto}
          </div>
        )}
        {esProximoRepartidor ? (
          <Btn verde onClick={onRepartir} disabled={enviandoReparto}>
            {enviandoReparto ? "Repartiendo…" : "Repartir mano"}
          </Btn>
        ) : (
          <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>
            Esperando a que <b style={{color:"#f0d080"}}>{nombreProximoRepartidor}</b> reparta la mano…
          </div>
        )}
        <BotonSalir onSalir={onSalir}/>
      </div>
    );
  }

  if (gameState.phase === "playing") {
    // Cartas de la base en curso (trick_number === base_num — se resetea
    // solo cuando una base termina y base_num avanza; ver play_card_trick_
    // resolution.sql). played_cards es pública, así que esto vale para las
    // cuatro sesiones por igual. `orden` (no lo trae cartasDeTrick) hace
    // falta acá para ganadorParcial (desempate/As de Espadas).
    const cartasEstaBase = jugadasEstaMano
      .filter((pc) => pc.trick_number === gameState.base_num)
      .sort((a, b) => a.seq_in_trick - b.seq_in_trick);

    const cartasMesa = cartasEstaBase.map((pc) => ({
      carta: pc.card, jugadorIdx: seatOfPlayerId(pc.player_id), orden: pc.seq_in_trick,
    }));
    // Quién abrió esta base: el primero en jugar, o si nadie jugó todavía,
    // quien tiene el turno ahora mismo (todavía no se movió de ahí).
    const liderSeat = cartasEstaBase.length > 0 ? seatOfPlayerId(cartasEstaBase[0].player_id) : gameState.turn_seat;
    const ganaActual = cartasMesa.length > 0 && cartasMesa.length < nJug
      ? ganadorParcial(cartasMesa, room.config?.ases)
      : null;

    const turnoNombre = jugadorEnAsiento(gameState.turn_seat)?.name;

    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"12px 8px"}}>
        <div style={{fontSize:16,color:"#f0d080",letterSpacing:2}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} · base {gameState.base_num+1}/{totalBases}
          {mySeat===gameState.turn_seat ? " · tu turno" : turnoNombre ? ` · turno de ${turnoNombre}` : ""}
        </div>

        {errorJugada && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:420}}>
            {errorJugada}
          </div>
        )}

        {/* Igual que en el panel de pedir: se bloquea la interacción acá
            afuera mientras la RPC está en vuelo, para que un doble tap no
            dispare un segundo play_card. */}
        <div style={{width:"100%",maxWidth:640,pointerEvents:enviandoJugada?"none":"auto",opacity:enviandoJugada?0.6:1}}>
          <BloqueMesa resumen={resumenProps}>
            <MesaCircular
              jugadores={jugadoresMesa}
              cartasMesa={cartasMesa}
              turnoIdx={gameState.turn_seat}
              pieIdx={gameState.dealer_seat}
              manoIdx={liderSeat}
              onTirar={onTirar}
              fase="jugar"
              ganadorBase={null}
              pedidos={[gameState.bids?.team0, gameState.bids?.team1]}
              capLocal={capLocal}
              capVisitante={capVisitante}
              ganaActual={ganaActual}
              expandidos={expandidos}
              onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
              cartasLevantadas={cartasLevantadas}
              onLevantarCarta={(idx,ci)=>setCartasLevantadas((cl)=>({...cl,[idx]:cl[idx]===ci?-1:ci}))}
              mySeat={mySeat}
              totalBases={totalBases}
              tableroAbierto={tableroAbierto}
              onToggleTablero={()=>setTableroAbierto((v)=>!v)}
            />
          </BloqueMesa>
        </div>

        <BotonSalir onSalir={onSalir}/>
        {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
      </div>
    );
  }

  if (gameState.phase === "resolving") {
    // base_num ya quedó incrementado al valor de la PRÓXIMA base apenas
    // play_card completó el truco (ver play_card_trick_resolution.sql) —
    // la base recién resuelta es base_num-1, no base_num.
    const trickNumber = gameState.base_num - 1;
    const cartasUltimaBase = playedCards
      .filter((pc) => pc.hand_number === gameState.hand_number && pc.trick_number === trickNumber)
      .sort((a, b) => a.seq_in_trick - b.seq_in_trick)
      .map((pc) => {
        const seat = seatOfPlayerId(pc.player_id);
        return { pc, seat, nombre: jugadorEnAsiento(seat)?.name ?? `Asiento ${seat}` };
      });
    const seatGanador = gameState.last_trick_winner_seat;
    const nombreGanador = jugadorEnAsiento(seatGanador)?.name;
    const esGanador = mySeat === seatGanador;

    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} · base {trickNumber+1}/{totalBases}
        </div>

        <div style={{width:"100%",maxWidth:640}}>
          <BloqueMesa resumen={resumenProps}>
            <MesaCircular
              jugadores={jugadoresMesa} cartasMesa={cartasDeTrick(trickNumber)}
              turnoIdx={gameState.turn_seat} pieIdx={gameState.dealer_seat} manoIdx={gameState.mano_seat}
              onTirar={()=>{}} fase="resolviendo" ganadorBase={seatGanador}
              pedidos={[gameState.bids?.team0, gameState.bids?.team1]} capLocal={capLocal} capVisitante={capVisitante}
              ganaActual={null} expandidos={expandidos} onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
              cartasLevantadas={cartasLevantadas} onLevantarCarta={()=>{}} mySeat={mySeat} totalBases={totalBases}
              tableroAbierto={tableroAbierto} onToggleTablero={()=>setTableroAbierto((v)=>!v)}
            />
          </BloqueMesa>
        </div>

        <BaseResuelta cartas={cartasUltimaBase} nombreGanador={nombreGanador} seatGanador={seatGanador}/>

        {errorResolucion && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:340}}>
            {errorResolucion}
          </div>
        )}

        {esGanador ? (
          <Btn verde onClick={onSiguienteBase} disabled={enviandoResolucion}>
            {enviandoResolucion ? "Confirmando…" : "Siguiente base →"}
          </Btn>
        ) : (
          <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>
            Esperando a que <b style={{color:"#f0d080"}}>{nombreGanador}</b> confirme la siguiente base…
          </div>
        )}

        <BotonSalir onSalir={onSalir}/>
        {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
      </div>
    );
  }

  if (gameState.phase === "copas_menu") {
    const pa = gameState.pending_action ?? {};
    const carrierSeat = pa.carrier_seat;
    const trickComplete = !!pa.trick_complete;
    const carrier = jugadorEnAsiento(carrierSeat);
    const esCarrier = mySeat === carrierSeat;
    const etapa = trickComplete ? "la próxima base" : "la ronda";

    // La base detrás del As de Copas puede estar completa o no (a
    // diferencia de oros_menu, que solo se entra con la base ya resuelta) —
    // en ningún caso hay un ganador todavía: si trick_complete, resolve_trick
    // recién corre dentro de resolve_copas_menu al elegir el sentido.
    const cartasEstaBase = playedCards
      .filter((pc) => pc.hand_number === gameState.hand_number && pc.trick_number === gameState.base_num)
      .sort((a, b) => a.seq_in_trick - b.seq_in_trick)
      .map((pc) => {
        const seat = seatOfPlayerId(pc.player_id);
        return { pc, seat, nombre: jugadorEnAsiento(seat)?.name ?? `Asiento ${seat}` };
      });

    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} · base {gameState.base_num+1}/{totalBases}
        </div>

        <div style={{width:"100%",maxWidth:640}}>
          <BloqueMesa resumen={resumenProps}>
            <MesaCircular
              jugadores={jugadoresMesa} cartasMesa={cartasDeTrick(gameState.base_num)}
              turnoIdx={gameState.turn_seat} pieIdx={gameState.dealer_seat} manoIdx={gameState.mano_seat}
              onTirar={()=>{}} fase="copas" ganadorBase={null}
              pedidos={[gameState.bids?.team0, gameState.bids?.team1]} capLocal={capLocal} capVisitante={capVisitante}
              ganaActual={null} expandidos={expandidos} onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
              cartasLevantadas={cartasLevantadas} onLevantarCarta={()=>{}} mySeat={mySeat} totalBases={totalBases}
              tableroAbierto={tableroAbierto} onToggleTablero={()=>setTableroAbierto((v)=>!v)}
            />
          </BloqueMesa>
        </div>

        <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(192,57,43,0.35)",borderRadius:10,padding:"12px 16px",width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
          <div style={{fontSize:10,color:"rgba(192,57,43,0.6)",letterSpacing:3}}>AS DE COPAS</div>
          <FilaCartasJugadas cartas={cartasEstaBase} seatDestacado={carrierSeat}/>
        </div>

        {errorCopas && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:340}}>
            {errorCopas}
          </div>
        )}

        {esCarrier ? (
          <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center",pointerEvents:enviandoCopas?"none":"auto",opacity:enviandoCopas?0.5:1}}>
            <div style={{fontSize:12,color:"#f0d080"}}>🏆 Decidís cómo sigue {etapa}</div>
            <div style={{display:"flex",gap:10}}>
              <Btn verde onClick={()=>onElegirSentido(1)}>↺ Sigue</Btn>
              <Btn danger onClick={()=>onElegirSentido(-1)}>↻ Se da vuelta</Btn>
            </div>
          </div>
        ) : (
          <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>
            🏆 Esperando a que <b style={{color:"#f0d080"}}>{carrier?.name}</b> decida cómo sigue {etapa}…
          </div>
        )}

        <BotonSalir onSalir={onSalir}/>
        {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
      </div>
    );
  }

  if (gameState.phase === "oros_menu") {
    const pa = gameState.pending_action ?? {};
    const carrierSeat = pa.carrier_seat;
    const team = pa.team;
    const carrier = jugadorEnAsiento(carrierSeat);
    const esCarrier = mySeat === carrierSeat;
    const jugadoresDelEquipo = players.filter((p) => p.team === team);

    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} · base {gameState.base_num+1}/{totalBases}
        </div>

        <div style={{width:"100%",maxWidth:640}}>
          <BloqueMesa resumen={resumenProps}>
            <MesaCircular
              jugadores={jugadoresMesa} cartasMesa={cartasDeTrick(gameState.base_num - 1)}
              turnoIdx={gameState.turn_seat} pieIdx={gameState.dealer_seat} manoIdx={gameState.mano_seat}
              onTirar={()=>{}} fase="oros" ganadorBase={gameState.last_trick_winner_seat}
              pedidos={[gameState.bids?.team0, gameState.bids?.team1]} capLocal={capLocal} capVisitante={capVisitante}
              ganaActual={null} expandidos={expandidos} onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
              cartasLevantadas={cartasLevantadas} onLevantarCarta={()=>{}} mySeat={mySeat} totalBases={totalBases}
              tableroAbierto={tableroAbierto} onToggleTablero={()=>setTableroAbierto((v)=>!v)}
            />
          </BloqueMesa>
        </div>

        <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:10,padding:"12px 16px",width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
          <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",letterSpacing:3}}>AS DE OROS</div>
          <div style={{fontSize:12,color:"#f0d080"}}>🟡 <b>{carrier?.name}</b> elige quién abre la siguiente base</div>
        </div>

        {errorOros && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:340}}>
            {errorOros}
          </div>
        )}

        {esCarrier ? (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",pointerEvents:enviandoOros?"none":"auto",opacity:enviandoOros?0.5:1}}>
            {jugadoresDelEquipo.map((p) => (
              <button key={p.seat} onClick={()=>onElegirAsiento(p.seat)} style={{
                fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"9px 18px",
                border:"2px solid #c9a84c",borderRadius:6,
                background:p.seat===carrierSeat?"rgba(201,168,76,0.25)":"rgba(201,168,76,0.1)",
                color:"#f0d080",cursor:"pointer",transition:"all 0.15s",
                fontWeight:p.seat===carrierSeat?"bold":"normal",
              }}>
                {p.name}{p.seat===carrierSeat?" 🟡":""}
              </button>
            ))}
          </div>
        ) : (
          <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>
            Esperando a que <b style={{color:"#f0d080"}}>{carrier?.name}</b> elija quién abre la siguiente base…
          </div>
        )}

        <BotonSalir onSalir={onSalir}/>
        {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
      </div>
    );
  }

  if (gameState.phase === "closing") {
    // Todos ven el mismo resumen, pero solo un capitán (de cualquiera de
    // los dos equipos) puede cerrar la mano — piece E. close_hand ya lo
    // exige server-side (close_hand_captain_only); esto solo evita
    // mostrarle el botón a quien igual lo rebotaría. El panel "pidió X ·
    // hizo Y" por equipo que vivía acá se sacó en piece F (batch overnight
    // post-5r): duplicaba, en texto, los mismos números que ResumenMarcador
    // ya muestra arriba con estrellas (EstrellasPedido de pedLocal/
    // hechoLocal/pedVisitante/hechoVisitante, hoisteados más arriba).
    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>Mano {gameState.hand_number+1} terminada</div>

        <div style={{width:"100%",maxWidth:640}}>
          <BloqueMesa resumen={resumenProps}>
            <MesaCircular
              jugadores={jugadoresMesa} cartasMesa={[]}
              turnoIdx={gameState.turn_seat} pieIdx={gameState.dealer_seat} manoIdx={gameState.mano_seat}
              onTirar={()=>{}} fase="cerrada" ganadorBase={null}
              pedidos={[gameState.bids?.team0, gameState.bids?.team1]} capLocal={capLocal} capVisitante={capVisitante}
              ganaActual={null} expandidos={expandidos} onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
              cartasLevantadas={cartasLevantadas} onLevantarCarta={()=>{}} mySeat={mySeat} totalBases={totalBases}
              tableroAbierto={tableroAbierto} onToggleTablero={()=>setTableroAbierto((v)=>!v)}
            />
          </BloqueMesa>
        </div>

        {errorCierre && (
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",maxWidth:340}}>
            {errorCierre}
          </div>
        )}

        {isCaptain ? (
          <Btn verde onClick={onCerrarMano} disabled={enviandoCierre}>
            {enviandoCierre ? "Cerrando…" : "Cerrar mano"}
          </Btn>
        ) : (
          <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>
            Esperando a que un capitán cierre la mano…
          </div>
        )}
        <BotonSalir onSalir={onSalir}/>
        {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
      </div>
    );
  }

  if (gameState.phase === "finished") {
    // LOCAL/VISITANTE fijos (equipo 0/1) en todo este bloque — piece 5r
    // saca el mapeo viejo a miTotal/rivalTotal (relativo a myTeam), incl.
    // en el propio mensaje de resultado ("¡GANARON ELLOS!" contenía el
    // literal que este pase tenía que sacar de todos lados).
    const manosOrdenadas = [...handResults].sort((a, b) => a.hand_number - b.hand_number);
    const totalLocal = manosOrdenadas.reduce((s, h) => s + h.delta_team0, 0);
    const totalVisitante = manosOrdenadas.reduce((s, h) => s + h.delta_team1, 0);
    const resultado = totalLocal === totalVisitante ? "¡EMPATE!" : totalLocal > totalVisitante ? "¡GANÓ LOCAL!" : "¡GANÓ VISITANTE!";
    const causaTexto = {
      kamikaze: "El equipo mano perdió la partida por no declarar kamikaze y quedar 2 o más abajo de lo pedido.",
      clock_expired: "Un equipo se quedó sin tiempo.",
    }[gameState.end_cause] ?? null;

    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>FIN DE LA PARTIDA</div>
        {causaTexto && <div style={{fontSize:11,color:"rgba(201,168,76,0.5)",fontStyle:"italic",textAlign:"center",maxWidth:340}}>{causaTexto}</div>}
        <div style={{fontSize:22,color:totalLocal>totalVisitante?"#7ecf9e":totalLocal<totalVisitante?"#e05555":"#f0d080",fontFamily:"Cinzel, Georgia, serif"}}>{resultado}</div>
        <div style={{fontSize:14,color:"rgba(201,168,76,0.7)"}}>Local: {totalLocal} · Visitante: {totalVisitante}</div>

        <div style={{overflowX:"auto",width:"100%",maxWidth:480}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontSize:11,fontFamily:"Crimson Text, Georgia, serif",color:"rgba(201,168,76,0.7)"}}>
            <thead>
              <tr style={{borderBottom:"1px solid rgba(201,168,76,0.22)"}}>
                <th style={{padding:"4px 6px",textAlign:"center"}}>Mano</th>
                <th style={{padding:"4px 6px",textAlign:"center"}}>Cartas</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.local.accent}}>Ped.</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.local.accent}}>Hecho</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.local.accent}}>Δ</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.visitante.accent}}>Ped.</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.visitante.accent}}>Hecho</th>
                <th style={{padding:"4px 6px",textAlign:"center",color:colors.team.visitante.accent}}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {manosOrdenadas.map((h) => {
                const local = { bid: h.bid_team0, hecho: h.tricks_team0, delta: h.delta_team0 };
                const visitante = { bid: h.bid_team1, hecho: h.tricks_team1, delta: h.delta_team1 };
                return (
                  <tr key={h.hand_number}>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{h.hand_number+1}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{h.cards_dealt}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{local.bid}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{local.hecho}</td>
                    <td style={{padding:"4px 6px",textAlign:"center",color:local.delta<0?"#e05555":"#f0d080"}}>{local.delta}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{visitante.bid}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{visitante.hecho}</td>
                    <td style={{padding:"4px 6px",textAlign:"center",color:visitante.delta<0?"#e05555":"#f0d080"}}>{visitante.delta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <BotonSalir onSalir={onSalir}/>
      </div>
    );
  }

  if (gameState.phase !== "bidding") {
    return (
      <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:14,color:"#f0d080"}}>Fase: {gameState.phase}</div>
        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center"}}>
          La siguiente fase llega en la próxima pieza.
        </div>
        <BotonSalir onSalir={onSalir}/>
      </div>
    );
  }

  return (
    <div style={{...fondoStyle,display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
        Mano {gameState.hand_number+1} · {totalBases} carta{totalBases!==1?"s":""}
      </div>

      <DisplayReloj
        tiempoLocal={tiempoLocal} tiempoVisitante={tiempoVisitante}
        corriendo={corriendoTeam}
        agotadoLocal={agotadoLocal} agotadoVisitante={agotadoVisitante}
        modoLento={false} modoTiempo={clockConfig?.modo} hayTiempo={hayReloj}
      />

      <MiMano cartas={misCartas} error={errorMano}/>

      <div style={{width:"100%",maxWidth:640}}>
        <BloqueMesa resumen={resumenProps}>
          <MesaCircular
            jugadores={jugadoresMesa} cartasMesa={cartasDeTrick(gameState.base_num)}
            turnoIdx={gameState.turn_seat} pieIdx={gameState.dealer_seat} manoIdx={gameState.mano_seat}
            onTirar={()=>{}} fase="bidding" ganadorBase={null}
            pedidos={[gameState.bids?.team0, gameState.bids?.team1]} capLocal={capLocal} capVisitante={capVisitante}
            ganaActual={null} expandidos={expandidos} onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
            cartasLevantadas={cartasLevantadas} onLevantarCarta={()=>{}} mySeat={mySeat} totalBases={totalBases}
            tableroAbierto={tableroAbierto} onToggleTablero={()=>setTableroAbierto((v)=>!v)}
          />
        </BloqueMesa>
      </div>

      {requiredTeam===null ? (
        <div style={{fontSize:11,color:"rgba(201,168,76,0.4)",fontStyle:"italic"}}>Cerrando el pedido…</div>
      ) : esMiTurno ? (
        <div style={{width:"100%",maxWidth:260}}>
          {errorPedido && (
            <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",marginBottom:8}}>
              {errorPedido}
            </div>
          )}
          {/* PanelPedir no tiene noción propia de "enviando" — se bloquea la
              interacción acá afuera mientras la RPC está en vuelo, para que
              un doble click no dispare un segundo submit-bid. */}
          <div style={{pointerEvents:enviando?"none":"auto",opacity:enviando?0.5:1}}>
            <PanelPedir
              totalBases={totalBases}
              nombresMano={nombresMano}
              nombresEq={nombresPie}
              esManoEq0={teamMano===0}
              onConfirmar={onConfirmar}
              clock={CLOCK_ADAPTER_PANEL}
              modoLento={false}
              nombreCapMano={capitanMano?.name}
              nombreCapPie={capitanPie?.name}
              kamikazesDisp={gameState.kamikazes_remaining}
              onKamikaze={()=>setKamikazeLocal(true)}
              kamikazeActivo={kamikazeLocal}
              onCancelarKamikaze={()=>setKamikazeLocal(false)}
              pedidoManoInicial={requiredTeam===teamPie ? bidMano : null}
              modoUnEquipo
            />
          </div>
          {enviando && <div style={{fontSize:10,color:"rgba(201,168,76,0.5)",textAlign:"center",marginTop:6}}>Enviando…</div>}
        </div>
      ) : (
        <EsperaPedido
          totalBases={totalBases}
          nombreCapitanTurno={requiredTeam===teamMano ? capitanMano?.name : capitanPie?.name}
          colorTurno={requiredTeam===0 ? "#5b9bd5" : "#e07b54"}
          bidMano={bidMano}
          kamikazeDeclarado={gameState.kamikaze_declared}
        />
      )}

      <BotonSalir onSalir={onSalir}/>
      {tableroAbierto && <TableroOverlay estructura={estructuraCompleta} historial={historialTablero} manoActual={gameState.hand_number} onCerrar={()=>setTableroAbierto(false)}/>}
    </div>
  );
}
