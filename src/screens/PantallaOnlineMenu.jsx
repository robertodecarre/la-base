import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA ONLINE MENU — crear vs. unirse
// ══════════════════════════════════════════════
export function PantallaOnlineMenu({ onCrear, onUnirse, onVolver }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>JUGAR ONLINE</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:24,width:"100%",maxWidth:420,display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <Btn verde onClick={onCrear}>Crear sala</Btn>
        <Btn onClick={onUnirse}>Unirse a sala</Btn>
      </div>

      <button onClick={onVolver} style={{
        fontFamily:"Crimson Text, Georgia, serif",fontSize:11,padding:"4px 12px",
        border:"none",background:"transparent",color:"rgba(201,168,76,0.4)",cursor:"pointer",letterSpacing:1,
      }}>← volver</button>
    </div>
  );
}
