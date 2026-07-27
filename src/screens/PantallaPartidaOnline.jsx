import { useEffect, useState } from "react";
import { PanelPedir } from "../components/PanelPedir";
import { MesaCircular } from "../components/MesaCircular";
import { CartaSVG } from "../components/cards/CartaSVG";
import { Btn } from "../components/Btn";
import { enviarPedido, jugarCarta, siguienteBase } from "../lib/game";
import { mensajeDeError } from "../lib/erroresSala";
import { ganadorParcial } from "../engine/trick";

// El reloj de ajedrez online (arranque/parada real ligado a game_state.clock,
// reclamo de tiempo agotado vía claim_timeout) es pieza 5f. PanelPedir igual
// exige un objeto `clock` con iniciarPara/detener y un `modoLento` — acá van
// inertes (modoLento en false apaga su countdown de 10s por completo) para
// no fingir una función que todavía no existe.
const RELOJ_INERTE = { iniciarPara: () => {}, detener: () => {} };

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

// Fase 'resolving': la base ya se decidió server-side (last_trick_winner_seat)
// pero nadie confirmó el avance todavía. Muestra las cartas de esa base ya
// completa — played_cards es pública, no hay nada que ocultar acá — y quién
// la ganó.
function BaseResuelta({ cartas, nombreGanador, seatGanador }) {
  return (
    <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:10,padding:"12px 16px",width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
      <div style={{fontSize:12,color:"#f0d080"}}>¡<b>{nombreGanador}</b> gana la base!</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
        {cartas.map(({ pc, nombre, seat }) => (
          <div key={pc.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{fontSize:9,color:seat===seatGanador?"#f0d080":"rgba(201,168,76,0.5)",fontWeight:seat===seatGanador?"bold":"normal"}}>{nombre}</div>
            <svg viewBox="0 0 34 50" width={34} height={50}>
              <CartaSVG carta={pc.card} w={34} h={50}/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PANTALLA PARTIDA ONLINE — mesa real (piezas 5d/5e)
// ══════════════════════════════════════════════
// Se monta desde PantallaOnlineSala una vez que gameState existe, reusando
// la misma instancia de useSala (sin segunda suscripción). Cubre 'dealing'/
// 'bidding' (5d) y ahora 'playing'/'resolving' (5e) — los menús de copas/oros
// son la pieza 5f; cierre/reloj/fin de partida son la 5g.
export function PantallaPartidaOnline({ roomId, room, players, gameState, playedCards, mySeat, myTeam, isCaptain, fetchMyHand, onSalir }) {
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
    let cancelado = false;
    setMisCartas(null);
    setErrorMano(null);
    fetchMyHand(gameState.hand_number)
      .then((cartas) => { if (!cancelado) setMisCartas(cartas ?? []); })
      .catch((err) => { if (!cancelado) setErrorMano(err); });
    return () => { cancelado = true; };
  }, [gameState.hand_number, fetchMyHand]);

  // El kamikaze elegido pero todavía no confirmado es puramente local:
  // game_state.kamikaze_declared solo pasa a true server-side después de un
  // submit_bid exitoso con kamikaze=true. Los errores de jugadas/resolución
  // y el estado de cartas expandidas/levantadas tampoco deben sobrevivir a
  // un cambio de mano.
  useEffect(() => {
    setKamikazeLocal(false);
    setErrorJugada(null);
    setErrorResolucion(null);
    setExpandidos({});
    setCartasLevantadas({});
  }, [gameState.hand_number]);

  const totalBases = room.config?.estructura?.[gameState.hand_number] ?? 0;
  const nJug = room.config?.nJug ?? players.length;
  const seatOfPlayerId = (playerId) => players.find((p) => p.id === playerId)?.seat;
  const jugadorEnAsiento = (seat) => players.find((p) => p.seat === seat);

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

  if (gameState.phase === "dealing") {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>Repartiendo…</div>
      </div>
    );
  }

  if (gameState.phase === "playing") {
    // Cartas de la base en curso (trick_number === base_num — se resetea
    // solo cuando una base termina y base_num avanza; ver play_card_trick_
    // resolution.sql). played_cards es pública, así que esto vale para las
    // cuatro sesiones por igual.
    const jugadasEstaMano = playedCards.filter((pc) => pc.hand_number === gameState.hand_number);
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

    const capN = players.find((p) => p.team === 0 && p.is_captain)?.seat ?? 0;
    const capE = players.find((p) => p.team === 1 && p.is_captain)?.seat ?? 1;

    // La única mano real es la propia (fetchMyHand) — el resto de los
    // asientos solo se sabe cuántas cartas les quedan (dealt - jugadas esta
    // mano), nunca cuáles: MesaCircular las pinta boca abajo vía mySeat.
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

    const turnoNombre = jugadorEnAsiento(gameState.turn_seat)?.name;

    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"12px 8px"}}>
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
            capN={capN}
            capE={capE}
            ganaActual={ganaActual}
            expandidos={expandidos}
            onToggleExpandir={(idx)=>setExpandidos((e)=>({...e,[idx]:!e[idx]}))}
            cartasLevantadas={cartasLevantadas}
            onLevantarCarta={(idx,ci)=>setCartasLevantadas((cl)=>({...cl,[idx]:cl[idx]===ci?-1:ci}))}
            mySeat={mySeat}
          />
        </div>

        <Btn onClick={onSalir}>Salir de la sala</Btn>
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
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
          Mano {gameState.hand_number+1} · base {trickNumber+1}/{totalBases}
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

        <Btn onClick={onSalir}>Salir de la sala</Btn>
      </div>
    );
  }

  if (gameState.phase !== "bidding") {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:14,color:"#f0d080"}}>Fase: {gameState.phase}</div>
        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center"}}>
          La siguiente fase llega en la próxima pieza.
        </div>
        <Btn onClick={onSalir}>Salir de la sala</Btn>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
        Mano {gameState.hand_number+1} · {totalBases} carta{totalBases!==1?"s":""}
      </div>

      <MiMano cartas={misCartas} error={errorMano}/>

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
              clock={RELOJ_INERTE}
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

      <Btn onClick={onSalir}>Salir de la sala</Btn>
    </div>
  );
}
