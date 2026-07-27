import { useEffect, useState } from "react";
import { PanelPedir } from "../components/PanelPedir";
import { CartaSVG } from "../components/cards/CartaSVG";
import { Btn } from "../components/Btn";
import { enviarPedido } from "../lib/game";
import { mensajeDeError } from "../lib/erroresSala";

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

// ══════════════════════════════════════════════
// PANTALLA PARTIDA ONLINE — mesa real (pieza 5d)
// ══════════════════════════════════════════════
// Se monta desde PantallaOnlineSala una vez que gameState existe, reusando
// la misma instancia de useSala (sin segunda suscripción). Cubre solo las
// fases 'dealing' y 'bidding' — jugar cartas, resolución y los menús de
// copas/oros son la pieza 5e; cierre/reloj/fin de partida son la 5f.
export function PantallaPartidaOnline({ roomId, room, players, gameState, mySeat, myTeam, isCaptain, fetchMyHand, onSalir }) {
  const [misCartas, setMisCartas] = useState(null);
  const [errorMano, setErrorMano] = useState(null);
  const [kamikazeLocal, setKamikazeLocal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorPedido, setErrorPedido] = useState(null);

  // La propia mano nunca viaja por Realtime (ver useSala) — hay que pedirla
  // explícitamente cada vez que cambia el número de mano (deal_hand ya dejó
  // la fila en `hands` para esta mano en el momento en que gameState llega).
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
  // submit_bid exitoso con kamikaze=true.
  useEffect(() => { setKamikazeLocal(false); }, [gameState.hand_number]);

  const totalBases = room.config?.estructura?.[gameState.hand_number] ?? 0;

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

  if (gameState.phase === "dealing") {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA {room.code}</div>
        <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>Repartiendo…</div>
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
