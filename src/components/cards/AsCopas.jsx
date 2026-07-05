// As de Copas — copa clásica española
export function AsCopas({ w, h }) {
  const cx=w/2, cy=h/2, c="#c0392b";
  // Copa: bowl arriba, tallo fino, base ancha
  const bowlTop = cy - h*0.32;
  const bowlBot = cy + h*0.08;
  const stalkTop = bowlBot;
  const stalkBot = cy + h*0.34;
  const baseY = stalkBot;
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.6}/>

      {/* Bowl de la copa — forma cónica abierta arriba */}
      <path d={`
        M ${cx-w*0.32} ${bowlTop}
        L ${cx-w*0.18} ${bowlBot}
        L ${cx+w*0.18} ${bowlBot}
        L ${cx+w*0.32} ${bowlTop}
        Z
      `} fill={c}/>
      {/* Borde superior del bowl */}
      <line x1={cx-w*0.34} y1={bowlTop} x2={cx+w*0.34} y2={bowlTop} stroke={c} strokeWidth={w*0.06} strokeLinecap="round"/>
      {/* Brillo interior */}
      <path d={`M ${cx-w*0.24} ${bowlTop+h*0.02} L ${cx-w*0.14} ${bowlBot-h*0.02} L ${cx-w*0.06} ${bowlBot-h*0.02} L ${cx-w*0.14} ${bowlTop+h*0.02} Z`}
        fill="rgba(255,255,255,0.18)"/>

      {/* Tallo */}
      <path d={`M ${cx-w*0.06} ${stalkTop} Q ${cx-w*0.02} ${(stalkTop+stalkBot)/2} ${cx-w*0.04} ${stalkBot}`}
        fill="none" stroke={c} strokeWidth={w*0.1} strokeLinecap="round"/>

      {/* Base — trapezoide ancho */}
      <path d={`M ${cx-w*0.36} ${baseY+h*0.09} L ${cx-w*0.22} ${baseY} L ${cx+w*0.22} ${baseY} L ${cx+w*0.36} ${baseY+h*0.09} Z`}
        fill={c}/>

      {/* Valor */}
      <text x={2.5} y={h*0.14} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}
