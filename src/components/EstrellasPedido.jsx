// ══════════════════════════════════════════════
// ESTRELLAS DE PEDIDO (vacías/rellenas)
// ══════════════════════════════════════════════
export function EstrellasPedido({ pedidas, hechas, color }) {
  if (pedidas === 0) return null;
  return (
    <div style={{display:"flex",gap:3,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
      {Array.from({length:pedidas}).map((_,i)=>{
        const hecha = i < hechas;
        // Piece QQ: antes las vacías usaban el mismo trazo (0.8px, opacidad
        // plena) que las rellenas — la única diferencia era el relleno
        // transparente, lo que las hacía difíciles de distinguir a
        // primera vista. Vacías ahora con trazo más fino Y más tenue.
        return (
          <span key={i} style={{
            fontSize:12,
            color: hecha ? color : "transparent",
            WebkitTextStroke: hecha ? `0.8px ${color}` : `0.5px ${color}`,
            opacity: hecha ? 1 : 0.5,
            lineHeight:1,
          }}>★</span>
        );
      })}
    </div>
  );
}
