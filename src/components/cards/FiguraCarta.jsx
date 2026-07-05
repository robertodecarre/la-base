// ── Sota y Rey ────────────────────────────────────────────────────────
export function FiguraCarta({ valor, palo, w, h }) {
  const cx=w/2, cy=h/2, c=palo.col;
  const skinColor = "#f5d5a0";
  const hairColor = valor===12 ? "#8B5020" : "#3a2010";
  const ropaColor = {"Oros":"#c9a84c","Copas":"#c0392b","Espadas":"#1a1a2e","Bastos":"#2d4a1e"}[palo.n]||c;
  const headY = cy - h*0.28;
  const bodyY = cy - h*0.12;
  const bodyH = h*0.35;

  return (
    <g>
      {/* Manto/cuerpo */}
      <path d={`M ${cx-w*0.28} ${bodyY+bodyH} L ${cx-w*0.2} ${bodyY} L ${cx+w*0.2} ${bodyY} L ${cx+w*0.28} ${bodyY+bodyH} Z`}
        fill={ropaColor} stroke={c} strokeWidth={0.5}/>
      <line x1={cx} y1={bodyY} x2={cx} y2={bodyY+bodyH} stroke={c} strokeWidth={0.4} opacity={0.4}/>
      {/* Cabeza */}
      <ellipse cx={cx} cy={headY} rx={w*0.16} ry={h*0.14} fill={skinColor} stroke={c} strokeWidth={0.6}/>
      {/* Cabello */}
      <path d={`M ${cx-w*0.16} ${headY-h*0.04} Q ${cx-w*0.18} ${headY-h*0.18} ${cx} ${headY-h*0.2} Q ${cx+w*0.18} ${headY-h*0.18} ${cx+w*0.16} ${headY-h*0.04}`}
        fill={hairColor}/>

      {valor === 12 && (
        <g fill="#d4a020" stroke="#8B6914" strokeWidth={0.5}>
          <rect x={cx-w*0.18} y={headY-h*0.2} width={w*0.36} height={h*0.07} rx={1}/>
          <polygon points={`${cx-w*0.16},${headY-h*0.2} ${cx-w*0.12},${headY-h*0.3} ${cx-w*0.08},${headY-h*0.2}`}/>
          <polygon points={`${cx-w*0.02},${headY-h*0.2} ${cx},${headY-h*0.33} ${cx+w*0.02},${headY-h*0.2}`}/>
          <polygon points={`${cx+w*0.08},${headY-h*0.2} ${cx+w*0.12},${headY-h*0.3} ${cx+w*0.16},${headY-h*0.2}`}/>
        </g>
      )}
      {valor === 10 && (
        <g>
          {/* Sombrero */}
          <ellipse cx={cx} cy={headY-h*0.14} rx={w*0.2} ry={h*0.04} fill={ropaColor} stroke={c} strokeWidth={0.5}/>
          <rect x={cx-w*0.12} y={headY-h*0.28} width={w*0.24} height={h*0.14} rx={2} fill={ropaColor} stroke={c} strokeWidth={0.5}/>
          {/* Piernas */}
          <rect x={cx-w*0.14} y={bodyY+bodyH} width={w*0.1} height={h*0.14} rx={w*0.04} fill={ropaColor} stroke={c} strokeWidth={0.4}/>
          <rect x={cx+w*0.04} y={bodyY+bodyH} width={w*0.1} height={h*0.14} rx={w*0.04} fill={ropaColor} stroke={c} strokeWidth={0.4}/>
          {/* Pies */}
          <ellipse cx={cx-w*0.09} cy={bodyY+bodyH+h*0.14} rx={w*0.08} ry={h*0.03} fill={c}/>
          <ellipse cx={cx+w*0.09} cy={bodyY+bodyH+h*0.14} rx={w*0.08} ry={h*0.03} fill={c}/>
        </g>
      )}

      {valor === 12 && (
        <g>
          <line x1={cx+w*0.22} y1={bodyY-h*0.08} x2={cx+w*0.22} y2={bodyY+bodyH*0.7} stroke={ropaColor} strokeWidth={w*0.06}/>
          <circle cx={cx+w*0.22} cy={bodyY-h*0.1} r={w*0.07} fill="#d4a020" stroke="#8B6914" strokeWidth={0.5}/>
        </g>
      )}
      {valor === 10 && (
        <line x1={cx+w*0.25} y1={bodyY-h*0.15} x2={cx+w*0.2} y2={bodyY+bodyH*0.8}
          stroke={c} strokeWidth={w*0.05}/>
      )}

      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">
        {valor===10?"S":"R"}
      </text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>
        {valor===10?"S":"R"}
      </text>
      <text x={2.5} y={h*0.3} fontSize={Math.max(4,w*0.16)} fill={c} fontFamily="Crimson Text, Georgia, serif" opacity={0.7}>
        {palo.e}
      </text>
    </g>
  );
}
