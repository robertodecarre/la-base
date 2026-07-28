import { useState, useEffect } from "react";
import { PantallaInicio } from "./screens/PantallaInicio";
import { PantallaSorteo } from "./screens/PantallaSorteo";
import { PantallaPartida } from "./screens/PantallaPartida";
import { PantallaModo } from "./screens/PantallaModo";
import { PantallaOnlineCrear } from "./screens/PantallaOnlineCrear";
import { PantallaOnlineUnirse } from "./screens/PantallaOnlineUnirse";
import { PantallaOnlineSala } from "./screens/PantallaOnlineSala";

const ROOM_ID_KEY = "laBaseOnlineRoomId";

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
export default function App() {
  // Si ya había una sala online guardada de una visita anterior, se
  // reconecta directo ahí en vez de mostrar el elegidor de modo — el
  // asiento se recupera solo (join_room dedupea por user_id de la sesión
  // anónima, ver lib/rooms.js), esto solo evita perder de vista a qué
  // sala volver.
  const [onlineRoomId,setOnlineRoomId]=useState(()=>localStorage.getItem(ROOM_ID_KEY));
  const [pantalla,setPantalla]=useState(()=>localStorage.getItem(ROOM_ID_KEY)?"online-sala":"modo");
  const [datos,setDatos]=useState(null);

  const irAOnlineSala = (roomId) => {
    localStorage.setItem(ROOM_ID_KEY, roomId);
    setOnlineRoomId(roomId);
    setPantalla("online-sala");
  };

  const salirDeOnline = () => {
    localStorage.removeItem(ROOM_ID_KEY);
    setOnlineRoomId(null);
    setPantalla("modo");
  };

  // Cargar fuentes Google
  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap";
    document.head.appendChild(link);
    return ()=>document.head.removeChild(link);
  },[]);

  const handleReset = () => {
    setDatos(null);
    setPantalla("inicio");
  };

  const handleReiniciar = () => {
    // Vuelve al sorteo con la misma configuración
    setDatos(d => ({...d, pieIdx: undefined}));
    setPantalla("sorteo");
  };

  return (
    <div style={{background:"radial-gradient(ellipse at center, #0d2b1a 0%, #050f08 100%)",minHeight:"100vh",fontFamily:"Crimson Text, Georgia, serif",color:"#f0d080"}}>
      {pantalla==="modo"&&(
        <PantallaModo onCrear={()=>setPantalla("online-crear")} onUnirse={()=>setPantalla("online-unirse")}/>
      )}
      {pantalla==="online-crear"&&(
        <PantallaOnlineCrear onCreada={(room)=>irAOnlineSala(room.id)} onVolver={()=>setPantalla("modo")}/>
      )}
      {pantalla==="online-unirse"&&(
        <PantallaOnlineUnirse onUnida={(player)=>irAOnlineSala(player.room_id)} onVolver={()=>setPantalla("modo")}/>
      )}
      {pantalla==="online-sala"&&onlineRoomId&&(
        <PantallaOnlineSala roomId={onlineRoomId} onSalir={salirDeOnline}/>
      )}
      {pantalla==="inicio"&&(
        <PantallaInicio onIniciar={(nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug,dosMazos,ases)=>{
          setDatos({nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug:nJug||6,dosMazos:dosMazos||false,ases:ases||{espadas:true,copas:true,oros:true}});
          setPantalla("sorteo");
        }}/>
      )}
      {pantalla==="sorteo"&&datos&&(
        <PantallaSorteo
          jugadores={datos.nombres.map((nombre,i)=>({nombre,eq:i%2===0?0:1}))}
          onComenzar={(pieIdx)=>{setDatos(d=>({...d,pieIdx}));setPantalla("partida");}}
        />
      )}
      {pantalla==="partida"&&datos&&(
        <PantallaPartida
          jugadoresInit={datos.nombres}
          estructura={datos.estructura}
          tiempoInicial={datos.tiempoSeg}
          modoTiempo={datos.modoTiempo}
          pieInicial={datos.pieIdx}
          capN={datos.capN}
          capE={datos.capE}
          kamikazesIniciales={datos.kamikazes??1}
          nJug={datos.nJug??6}
          dosMazos={datos.dosMazos??false}
          ases={datos.ases??{espadas:true,copas:true,oros:true}}
          onReset={handleReset}
          onReiniciar={handleReiniciar}
        />
      )}
    </div>
  );
}
