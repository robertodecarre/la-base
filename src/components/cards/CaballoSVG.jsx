// ── Caballo: jinete real montado a caballo ────────────────────────────
export function CaballoSVG({ palo, w, h }) {
  const cx=w/2, c=palo.col;
  const ropaColor = {"Oros":"#c9a84c","Copas":"#c0392b","Espadas":"#1a1a2e","Bastos":"#2d4a1e"}[palo.n]||c;
  const hc = h*0.62; // Y centro cuerpo caballo
  const rj = h*0.25; // Y cabeza jinete
  return (
    <g>
      {/* ── Cuerpo caballo ── */}
      <ellipse cx={cx} cy={hc} rx={w*0.34} ry={h*0.12} fill="#8B5e3c" stroke="#5a3520" strokeWidth={0.7}/>
      {/* Cuello caballo */}
      <path d={`M ${cx+w*0.22} ${hc-h*0.1} Q ${cx+w*0.3} ${hc-h*0.25} ${cx+w*0.25} ${hc-h*0.34}`}
        fill="#8B5e3c" stroke="#5a3520" strokeWidth={4}/>
      {/* Cabeza caballo */}
      <ellipse cx={cx+w*0.28} cy={hc-h*0.38} rx={w*0.11} ry={h*0.07}
        fill="#8B5e3c" stroke="#5a3520" strokeWidth={0.7} transform={`rotate(-25,${cx+w*0.28},${hc-h*0.38})`}/>
      {/* Hocico */}
      <ellipse cx={cx+w*0.36} cy={hc-h*0.43} rx={w*0.06} ry={h*0.04}
        fill="#7a4f2e" stroke="#5a3520" strokeWidth={0.5}/>
      {/* Ollares */}
      <ellipse cx={cx+w*0.38} cy={hc-h*0.41} rx={w*0.015} ry={h*0.01} fill="#5a3520"/>
      {/* Ojo */}
      <circle cx={cx+w*0.24} cy={hc-h*0.4} r={w*0.025} fill="#1a0a00"/>
      <circle cx={cx+w*0.235} cy={hc-h*0.402} r={w*0.008} fill="#fff" opacity={0.6}/>
      {/* Crin */}
      <path d={`M ${cx+w*0.26} ${hc-h*0.34} Q ${cx+w*0.18} ${hc-h*0.3} ${cx+w*0.14} ${hc-h*0.2}`}
        fill="none" stroke="#3a2010" strokeWidth={w*0.06} strokeLinecap="round"/>
      {/* Cola */}
      <path d={`M ${cx-w*0.32} ${hc-h*0.02} Q ${cx-w*0.42} ${hc+h*0.12} ${cx-w*0.38} ${hc+h*0.26}`}
        fill="none" stroke="#3a2010" strokeWidth={w*0.05} strokeLinecap="round"/>
      {/* Patas delanteras (levantadas al galope) */}
      <path d={`M ${cx+w*0.18} ${hc+h*0.1} L ${cx+w*0.26} ${hc+h*0.22} L ${cx+w*0.24} ${hc+h*0.3}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round" strokeLinejoin="round"/>
      <path d={`M ${cx+w*0.26} ${hc+h*0.08} L ${cx+w*0.18} ${hc+h*0.18}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.07} strokeLinecap="round"/>
      {/* Patas traseras */}
      <path d={`M ${cx-w*0.14} ${hc+h*0.1} L ${cx-w*0.18} ${hc+h*0.28}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round"/>
      <path d={`M ${cx-w*0.26} ${hc+h*0.1} L ${cx-w*0.2} ${hc+h*0.28}`}
        fill="none" stroke="#5a3520" strokeWidth={w*0.08} strokeLinecap="round"/>

      {/* ── Jinete ── */}
      {/* Cuerpo */}
      <path d={`M ${cx-w*0.1} ${rj+h*0.22} L ${cx-w*0.06} ${rj+h*0.06} L ${cx+w*0.1} ${rj+h*0.06} L ${cx+w*0.12} ${rj+h*0.22} Z`}
        fill={ropaColor} stroke={c} strokeWidth={0.5}/>
      {/* Cabeza */}
      <ellipse cx={cx+w*0.02} cy={rj} rx={w*0.1} ry={h*0.08} fill="#f5d5a0" stroke={c} strokeWidth={0.5}/>
      {/* Yelmo */}
      <path d={`M ${cx-w*0.08} ${rj+h*0.02} Q ${cx-w*0.1} ${rj-h*0.12} ${cx+w*0.02} ${rj-h*0.14} Q ${cx+w*0.14} ${rj-h*0.12} ${cx+w*0.12} ${rj+h*0.02}`}
        fill={ropaColor} stroke={c} strokeWidth={0.6}/>
      <line x1={cx-w*0.08} y1={rj-h*0.01} x2={cx+w*0.12} y2={rj-h*0.01} stroke={c} strokeWidth={0.5}/>
      {/* Penacho del yelmo */}
      <path d={`M ${cx+w*0.02} ${rj-h*0.14} Q ${cx+w*0.06} ${rj-h*0.24} ${cx} ${rj-h*0.3}`}
        fill="none" stroke="#c0392b" strokeWidth={w*0.05} strokeLinecap="round"/>
      {/* Lanza */}
      <line x1={cx+w*0.12} y1={rj-h*0.08} x2={cx+w*0.42} y2={hc-h*0.36}
        stroke={c} strokeWidth={w*0.055}/>
      <polygon points={`${cx+w*0.42},${hc-h*0.36} ${cx+w*0.36},${hc-h*0.29} ${cx+w*0.46},${hc-h*0.28}`} fill={c}/>

      {/* Valor esquinas */}
      <text x={2.5} y={h*0.14} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif">C</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill={c} fontFamily="Cinzel, Georgia, serif" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>C</text>
      <text x={2.5} y={h*0.25} fontSize={Math.max(4,w*0.16)} fill={c} fontFamily="Crimson Text, Georgia, serif" opacity={0.7}>{palo.e}</text>
    </g>
  );
}
