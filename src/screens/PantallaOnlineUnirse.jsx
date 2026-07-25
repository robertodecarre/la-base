import { useState } from "react";
import { Btn } from "../components/Btn";
import { unirseASala } from "../lib/rooms";
import { mensajeDeError } from "../lib/erroresSala";

// Mismo alfabeto que generate_room_code() en la base (sin 0/O/1/I/L, para
// que no haya ambigüedad al leerlo/tipearlo en voz alta).
const CARACTER_INVALIDO = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
function limpiarCodigo(v) {
  return v.toUpperCase().replace(CARACTER_INVALIDO, "").slice(0, 6);
}

const inp={fontFamily:"Crimson Text, Georgia, serif",fontSize:12,padding:"5px 8px",borderRadius:5,border:"1.5px solid rgba(201,168,76,0.4)",background:"rgba(0,0,0,0.4)",color:"#f0d080",width:"100%"};

// ══════════════════════════════════════════════
// PANTALLA ONLINE UNIRSE — código + nombre
// ══════════════════════════════════════════════
export function PantallaOnlineUnirse({ onUnida, onVolver }) {
  const [code,setCode]=useState("");
  const [nombre,setNombre]=useState("");
  const [uniendo,setUniendo]=useState(false);
  const [error,setError]=useState(null);

  const puedeUnirse = code.length>=4 && nombre.trim().length>0 && !uniendo;

  const unirse = async () => {
    setError(null);
    setUniendo(true);
    try {
      const player = await unirseASala(code, nombre.trim());
      onUnida(player);
    } catch (err) {
      setError(await mensajeDeError(err));
      setUniendo(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:18,color:"#f0d080",letterSpacing:3}}>UNIRSE A SALA</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:20,width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:6,textAlign:"center"}}>CÓDIGO DE SALA</div>
          <input
            value={code}
            onChange={e=>setCode(limpiarCodigo(e.target.value))}
            placeholder="ABCDE"
            maxLength={6}
            style={{...inp,textAlign:"center",fontSize:22,letterSpacing:6,fontFamily:"Cinzel, Georgia, serif"}}
          />
        </div>
        <div>
          <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:6,textAlign:"center"}}>TU NOMBRE</div>
          <input
            value={nombre}
            onChange={e=>setNombre(e.target.value.slice(0,20))}
            placeholder="Ej: Tincho"
            style={{...inp,textAlign:"center"}}
            onKeyDown={e=>{if(e.key==="Enter"&&puedeUnirse)unirse();}}
          />
        </div>

        {error&&<div style={{fontSize:11,color:"#e88",background:"rgba(192,57,43,0.12)",border:"1px solid rgba(192,57,43,0.4)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>{error}</div>}

        <div style={{display:"flex",justifyContent:"center"}}>
          <Btn verde onClick={unirse} disabled={!puedeUnirse}>{uniendo?"Uniendo…":"Unirse"}</Btn>
        </div>
      </div>

      <button onClick={onVolver} style={{
        fontFamily:"Crimson Text, Georgia, serif",fontSize:11,padding:"4px 12px",
        border:"none",background:"transparent",color:"rgba(201,168,76,0.4)",cursor:"pointer",letterSpacing:1,
      }}>← volver</button>
    </div>
  );
}
