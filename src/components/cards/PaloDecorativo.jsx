// Palo central decorativo
export function PaloDecorativo({ palo, cx, cy, size }) {
  const c = palo.col;
  const s = size;
  if (palo.n === "Oros") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={s*0.42} fill="#d4a020" stroke="#8B6914" strokeWidth={s*0.06}/>
        <circle cx={cx} cy={cy} r={s*0.28} fill="#f5c842" stroke="#8B6914" strokeWidth={s*0.04}/>
        <circle cx={cx} cy={cy} r={s*0.12} fill="#fffbe0"/>
      </g>
    );
  }
  if (palo.n === "Copas") {
    return (
      <g fill={c}>
        <path d={`M ${cx} ${cy+s*0.45} Q ${cx-s*0.5} ${cy+s*0.1} ${cx-s*0.5} ${cy-s*0.1} A ${s*0.32} ${s*0.32} 0 0 1 ${cx} ${cy-s*0.05} A ${s*0.32} ${s*0.32} 0 0 1 ${cx+s*0.5} ${cy-s*0.1} Q ${cx+s*0.5} ${cy+s*0.1} ${cx} ${cy+s*0.45} Z`}/>
        <rect x={cx-s*0.06} y={cy+s*0.44} width={s*0.12} height={s*0.22} rx={s*0.03}/>
        <rect x={cx-s*0.22} y={cy+s*0.63} width={s*0.44} height={s*0.08} rx={s*0.04}/>
      </g>
    );
  }
  if (palo.n === "Espadas") {
    return (
      <g fill={c}>
        <polygon points={`${cx},${cy-s*0.48} ${cx+s*0.18},${cy+s*0.2} ${cx-s*0.18},${cy+s*0.2}`}/>
        <path d={`M ${cx-s*0.35} ${cy+s*0.25} Q ${cx-s*0.1} ${cy+s*0.38} ${cx} ${cy+s*0.28} Q ${cx+s*0.1} ${cy+s*0.38} ${cx+s*0.35} ${cy+s*0.25}`} fill="none" stroke={c} strokeWidth={s*0.1}/>
        <rect x={cx-s*0.06} y={cy+s*0.28} width={s*0.12} height={s*0.22} rx={s*0.03}/>
      </g>
    );
  }
  if (palo.n === "Bastos") {
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={s*0.12} ry={s*0.48} fill={c} rx={s*0.12}/>
        <ellipse cx={cx-s*0.3} cy={cy-s*0.15} rx={s*0.28} ry={s*0.1} fill={c} transform={`rotate(-35,${cx-s*0.3},${cy-s*0.15})`}/>
        <ellipse cx={cx+s*0.3} cy={cy-s*0.15} rx={s*0.28} ry={s*0.1} fill={c} transform={`rotate(35,${cx+s*0.3},${cy-s*0.15})`}/>
        <circle cx={cx} cy={cy-s*0.48} r={s*0.12} fill={c}/>
        <circle cx={cx-s*0.38} cy={cy-s*0.22} r={s*0.1} fill={c}/>
        <circle cx={cx+s*0.38} cy={cy-s*0.22} r={s*0.1} fill={c}/>
      </g>
    );
  }
  return null;
}
