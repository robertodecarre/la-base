// As de Espadas
export function AsEspadas({ w, h }) {
  const cx=w/2, cy=h/2, c="#1a1a2e";
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke={c} strokeWidth={0.6}/>
      {/* Hoja de espada */}
      <polygon points={`${cx},${cy-h*0.38} ${cx+w*0.2},${cy+h*0.18} ${cx},${cy+h*0.08} ${cx-w*0.2},${cy+h*0.18}`} fill={c}/>
      {/* Brillo en hoja */}
      <polygon points={`${cx},${cy-h*0.35} ${cx+w*0.04},${cy+h*0.1} ${cx},${cy+h*0.05}`} fill="rgba(255,255,255,0.25)"/>
      {/* Guarda */}
      <path d={`M ${cx-w*0.38} ${cy+h*0.2} Q ${cx-w*0.1} ${cy+h*0.32} ${cx} ${cy+h*0.22} Q ${cx+w*0.1} ${cy+h*0.32} ${cx+w*0.38} ${cy+h*0.2}`} fill="none" stroke={c} strokeWidth={w*0.09} strokeLinecap="round"/>
      {/* Mango */}
      <rect x={cx-w*0.06} y={cy+h*0.22} width={w*0.12} height={h*0.2} rx={w*0.03} fill="#8B5020"/>
      {/* Pommel */}
      <circle cx={cx} cy={cy+h*0.42} r={w*0.08} fill={c}/>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}
