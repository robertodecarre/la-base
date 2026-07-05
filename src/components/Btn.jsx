import { useState } from "react";

// ══════════════════════════════════════════════
// BOTÓN
// ══════════════════════════════════════════════
export function Btn({ onClick, children, verde, danger, disabled }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      fontFamily:"Cinzel, Georgia, serif",fontSize:13,padding:"10px 24px",
      border:`2px solid ${danger?"#c0392b":verde?"#4a9e6a":"#c9a84c"}`,borderRadius:6,
      background:h&&!disabled?(danger?"#c0392b":verde?"#4a9e6a":"#c9a84c"):"rgba(0,0,0,0.6)",
      color:h&&!disabled?"#000":(danger?"#e88":verde?"#7ecf9e":"#f0d080"),
      cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,transition:"all 0.18s",letterSpacing:1,
    }}>{children}</button>
  );
}
