import { useState } from "react";
import { useSala } from "../hooks/useSala";
import { Btn } from "../components/Btn";
import { repartirMano } from "../lib/game";
import { mensajeDeError } from "../lib/erroresSala";
import { PantallaPartidaOnline } from "./PantallaPartidaOnline";

// Fila de un asiento: nombre si está ocupado, placeholder si no, insignia
// de capitán (seat 0 y 1, auto-asignados por join_room). Sub-componente
// local no exportado, mismo patrón que MesaCircular.jsx (EstrellasSVG,
// CartasManoSVG).
function FilaAsiento({ seat, jugador, mySeat, color }) {
  const ocupado = !!jugador;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,
      border:`1px solid ${ocupado?"rgba(201,168,76,0.28)":"rgba(201,168,76,0.1)"}`,
      background:ocupado?"rgba(201,168,76,0.06)":"rgba(0,0,0,0.2)"}}>
      <span style={{fontSize:9,color:"rgba(201,168,76,0.4)",width:16}}>#{seat}</span>
      <span style={{flex:1,fontSize:12,textAlign:"left",fontStyle:ocupado?"normal":"italic",
        color:!ocupado?"rgba(201,168,76,0.3)":(seat===mySeat?"#f0d080":color)}}>
        {ocupado?jugador.name:"— vacío —"}{ocupado&&seat===mySeat?" (vos)":""}
      </span>
      {ocupado&&jugador.is_captain&&<span style={{fontSize:9,color:"#c9a84c",whiteSpace:"nowrap"}}>★ CAP</span>}
    </div>
  );
}

// ══════════════════════════════════════════════
// PANTALLA ONLINE SALA — lobby real (pieza 5c)
// ══════════════════════════════════════════════
// Sigue usando useSala (pieza 5a) como única fuente de estado en vivo, sin
// duplicar nada de la suscripción. La transición a "partida arrancada" no
// la decide quien apretó el botón: se dispara sola cuando gameState llega
// por realtime (deal_hand lo crea en la misma transacción que pone
// rooms.status en 'playing'), así que las 4 sesiones pasan de pantalla a
// la vez, no solo la que llamó a repartirMano.
export function PantallaOnlineSala({ roomId, onSalir }) {
  const { room, players, gameState, playedCards, handResults, mySeat, myTeam, isCaptain, ready, error, fetchMyHand } = useSala(roomId);
  const [iniciando, setIniciando] = useState(false);
  const [errorInicio, setErrorInicio] = useState(null);

  const iniciarPartida = async () => {
    setErrorInicio(null);
    setIniciando(true);
    try {
      await repartirMano(roomId);
      // No se navega acá — ver el comentario de arriba. Si esta llamada
      // tuvo éxito pero por algún motivo el evento realtime tardara,
      // `iniciando` se queda en true (spinner del botón) hasta que
      // gameState llegue, en vez de mostrar un estado "listo" falso.
    } catch (err) {
      setErrorInicio(await mensajeDeError(err));
      setIniciando(false);
    }
  };

  if (error) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA</div>
        <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
          No se pudo cargar la sala: {error.message}
        </div>
        <Btn onClick={onSalir}>Salir de la sala</Btn>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
        <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA</div>
        <div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>Cargando sala…</div>
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
  const nJug = room.config?.nJug ?? players.length;
  const asientos = Array.from({length:nJug}, (_,seat)=>({seat, jugador: players.find(p=>p.seat===seat) ?? null}));
  // A diferencia de PantallaPartida.jsx (hotseat, una sola pantalla
  // compartida sin punto de vista individual), acá "NOSOTROS"/"ELLOS" es
  // relativo a mySeat: cada jugador ve su propio equipo primero, no
  // siempre team 0. Si mySeat todavía no se resolvió (debería ser
  // momentáneo), se cae al mapeo fijo team0="NOSOTROS" en vez de adivinar.
  const miEquipo = mySeat!=null ? mySeat%2 : 0;
  const misCompaneros = asientos.filter(a=>a.seat%2===miEquipo);
  const rivales = asientos.filter(a=>a.seat%2!==miEquipo);
  const salaCompleta = players.length===nJug;

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:20,width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2}}>CÓDIGO PARA COMPARTIR</div>
        <div style={{fontSize:32,color:"#f0d080",letterSpacing:8,fontFamily:"Cinzel, Georgia, serif",fontWeight:"bold"}}>{room.code}</div>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>Jugadores conectados: {players.length}/{nJug}</div>

        <div style={{display:"flex",gap:12,width:"100%"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:"#5b9bd5",letterSpacing:1,textAlign:"center",marginBottom:2}}>NOSOTROS</div>
            {misCompaneros.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} color="#5b9bd5"/>
            ))}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:"#e07b54",letterSpacing:1,textAlign:"center",marginBottom:2}}>ELLOS</div>
            {rivales.map(({seat,jugador})=>(
              <FilaAsiento key={seat} seat={seat} jugador={jugador} mySeat={mySeat} color="#e07b54"/>
            ))}
          </div>
        </div>

        {errorInicio&&(
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center",width:"100%"}}>
            {errorInicio}
          </div>
        )}

        <Btn verde onClick={iniciarPartida} disabled={!salaCompleta||iniciando}>
          {iniciando?"Repartiendo…":salaCompleta?"Empezar partida":`Esperando jugadores (${players.length}/${nJug})`}
        </Btn>

        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center"}}>
          {ready?"Conectado en vivo.":"Conectando…"} Cualquier jugador puede repartir cuando la sala esté completa.
        </div>
      </div>

      <Btn onClick={onSalir}>Salir de la sala</Btn>
    </div>
  );
}
