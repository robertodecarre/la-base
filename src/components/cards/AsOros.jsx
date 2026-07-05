// As de Oros — círculo dorado elaborado
export function AsOros({ w, h }) {
  const cx=w/2, cy=h/2;
  return (
    <g>
      <rect width={w} height={h} rx={3} fill="#faf0dc" stroke="#8B6914" strokeWidth={1.5}/>
      <rect x={1.5} y={1.5} width={w-3} height={h-3} rx={2} fill="none" stroke="#d4a020" strokeWidth={0.6}/>
      {/* Disco exterior */}
      <circle cx={cx} cy={cy} r={w*0.38} fill="#d4a020" stroke="#8B6914" strokeWidth={1}/>
      {/* Rayos */}
      {[0,45,90,135].map(a => (
        <line key={a}
          x1={cx + Math.cos(a*Math.PI/180)*w*0.2} y1={cy + Math.sin(a*Math.PI/180)*w*0.2}
          x2={cx + Math.cos(a*Math.PI/180)*w*0.36} y2={cy + Math.sin(a*Math.PI/180)*w*0.36}
          stroke="#8B6914" strokeWidth={0.8}/>
      ))}
      {[0,45,90,135].map(a => (
        <line key={a+"b"}
          x1={cx + Math.cos((a+22.5)*Math.PI/180)*w*0.22} y1={cy + Math.sin((a+22.5)*Math.PI/180)*w*0.22}
          x2={cx + Math.cos((a+22.5)*Math.PI/180)*w*0.36} y2={cy + Math.sin((a+22.5)*Math.PI/180)*w*0.36}
          stroke="#8B6914" strokeWidth={0.5}/>
      ))}
      {/* Disco medio */}
      <circle cx={cx} cy={cy} r={w*0.22} fill="#f5c842" stroke="#8B6914" strokeWidth={0.8}/>
      {/* Disco interior */}
      <circle cx={cx} cy={cy} r={w*0.1} fill="#fffbe0" stroke="#d4a020" strokeWidth={0.6}/>
      {/* Valor */}
      <text x={2.5} y={h*0.18} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill="#8B6914" fontFamily="Crimson Text, Georgia, serif" fontStyle="italic">A</text>
      <text x={w-2.5} y={h-2} fontSize={Math.max(5,w*0.2)} fontWeight="bold" fill="#8B6914" fontFamily="Crimson Text, Georgia, serif" fontStyle="italic" textAnchor="end" transform={`rotate(180,${w-2.5},${h-2})`}>A</text>
    </g>
  );
}
