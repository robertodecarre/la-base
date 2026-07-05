// ══════════════════════════════════════════════
// ESTRELLAS DE PEDIDO (vacías/rellenas)
// ══════════════════════════════════════════════
export function EstrellasPedido({ pedidas, hechas, color }) {
  if (pedidas === 0) return null;
  return (
    <div style={{display:"flex",gap:3,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
      {Array.from({length:pedidas}).map((_,i)=>(
        <span key={i} style={{
          fontSize:12,
          color: i < hechas ? color : "transparent",
          WebkitTextStroke: `0.8px ${color}`,
          lineHeight:1,
        }}>★</span>
      ))}
    </div>
  );
}
