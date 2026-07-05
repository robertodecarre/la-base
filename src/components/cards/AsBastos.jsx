// As de Bastos — el Ancho, carta más poderosa
export function AsBastos({ w, h }) {
  const cx=w/2, cy=h/2, c="#2d4a1e";
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#5a3a1a" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke="#c0392b" strokeWidth={0.8}/>
      {/* Basto central grueso y nudoso */}
      <rect x={cx-w*0.08} y={h*0.1} width={w*0.16} height={h*0.75} rx={w*0.06} fill="#5a3a1a"/>
      {/* Nudos */}
      <circle cx={cx-w*0.06} cy={h*0.28} r={w*0.09} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      <circle cx={cx+w*0.06} cy={h*0.45} r={w*0.08} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      <circle cx={cx-w*0.05} cy={h*0.62} r={w*0.08} fill="#7a5020" stroke="#5a3a1a" strokeWidth={0.8}/>
      {/* Corona superior */}
      <polygon points={`${cx-w*0.12},${h*0.1} ${cx},${h*0.02} ${cx+w*0.12},${h*0.1}`} fill="#c9a84c"/>
      {/* Etiqueta ANCHO */}
      <text x={cx} y={h*0.96} textAnchor="middle" fontSize={Math.max(4,w*0.18)} fill="#c0392b" fontFamily="Cinzel, Georgia, serif" fontWeight="bold">ANCHO</text>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
    </g>
  );
}
