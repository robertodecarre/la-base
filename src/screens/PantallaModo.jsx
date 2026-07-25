import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA MODO — hotseat vs. online
// ══════════════════════════════════════════════
export function PantallaModo({ onHotseat, onOnline }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:28,color:"#f0d080",letterSpacing:4,textShadow:"0 0 20px rgba(201,168,76,0.4)"}}>LA BASE</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.3)",letterSpacing:3}}>NAIPES ESPAÑOLES</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:24,width:"100%",maxWidth:420,display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,textAlign:"center"}}>¿CÓMO QUERÉS JUGAR?</div>
        <Btn verde onClick={onHotseat}>📱 Jugar en este dispositivo</Btn>
        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center"}}>Todos los jugadores comparten esta pantalla, por turnos.</div>
        <Btn onClick={onOnline}>🌐 Jugar online</Btn>
        <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",textAlign:"center"}}>Cada jugador entra desde su propio dispositivo.</div>
      </div>
    </div>
  );
}
