import { useSala } from "../hooks/useSala";
import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA ONLINE SALA — placeholder de la 5b
// ══════════════════════════════════════════════
// Todavía no es el lobby real (asientos, listo/empezar — eso es la pieza
// 5c): esto solo confirma que crearSala()/unirseASala() funcionaron y
// muestra el código para compartir. Ya usa useSala (pieza 5a) para
// mostrar estado en vivo, así que 5c solo tiene que construir la UI del
// lobby sobre lo mismo que ya está acá.
export function PantallaOnlineSala({ roomId, onSalir }) {
  const { room, players, mySeat, ready, error } = useSala(roomId);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>SALA</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:20,width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
        {error&&(
          <div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
            No se pudo cargar la sala: {error.message}
          </div>
        )}
        {!room&&!error&&<div style={{fontSize:12,color:"rgba(201,168,76,0.5)"}}>Cargando sala…</div>}
        {room&&(
          <>
            <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2}}>CÓDIGO PARA COMPARTIR</div>
            <div style={{fontSize:32,color:"#f0d080",letterSpacing:8,fontFamily:"Cinzel, Georgia, serif",fontWeight:"bold"}}>{room.code}</div>
            <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>Estado: {room.status}</div>
            <div style={{fontSize:11,color:"rgba(201,168,76,0.5)"}}>
              Jugadores conectados: {players.length}/{room.config?.nJug ?? "?"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,width:"100%"}}>
              {players.slice().sort((a,b)=>a.seat-b.seat).map(p=>(
                <div key={p.id} style={{fontSize:11,color:p.seat===mySeat?"#f0d080":"rgba(201,168,76,0.6)",textAlign:"center"}}>
                  Asiento {p.seat} — {p.name}{p.seat===mySeat?" (vos)":""}
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center",marginTop:6}}>
          {ready?"Conectado en vivo.":"Conectando…"} El lobby completo (listo / empezar partida) llega en la próxima pieza.
        </div>
      </div>

      <Btn onClick={onSalir}>Salir de la sala</Btn>
    </div>
  );
}
