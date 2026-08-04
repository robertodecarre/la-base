import { useState, useEffect } from "react";
import { PantallaModo } from "./screens/PantallaModo";
import { PantallaOnlineCrear } from "./screens/PantallaOnlineCrear";
import { PantallaOnlineUnirse } from "./screens/PantallaOnlineUnirse";
import { PantallaOnlineSala } from "./screens/PantallaOnlineSala";
import { PantallaDevFake } from "./screens/PantallaDevFake";

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

  return (
    <>
      {pantalla==="modo"&&(
        <PantallaModo onCrear={()=>setPantalla("online-crear")} onUnirse={()=>setPantalla("online-unirse")} onDevFake={()=>setPantalla("dev-fake")}/>
      )}
      {pantalla==="dev-fake"&&(
        <PantallaDevFake onSalir={()=>setPantalla("modo")}/>
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
    </>
  );
}
