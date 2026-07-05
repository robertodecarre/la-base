// ══════════════════════════════════════════════
// TABLERO
// ══════════════════════════════════════════════
export function Tablero({ estructura, historial }) {
  const colW=36,rowH=28,labelW=68;
  const totalW=labelW+estructura.length*colW+4, totalH=rowH*3+8;
  let acumN=0,acumE=0;
  const acumNArr=[],acumEArr=[];
  for(let i=0;i<estructura.length;i++){
    if(historial[i]){acumN+=historial[i].deltaN;acumE+=historial[i].deltaE;}
    acumNArr.push(historial[i]!==undefined?acumN:"");
    acumEArr.push(historial[i]!==undefined?acumE:"");
  }
  const filas=[
    {label:"Cartas",vals:estructura,color:"rgba(201,168,76,0.55)"},
    {label:"Nosotros",vals:acumNArr,color:"#5b9bd5"},
    {label:"Ellos",vals:acumEArr,color:"#e07b54"},
  ];
  return (
    <div style={{overflowX:"auto",width:"100%"}}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} style={{width:"100%",minWidth:Math.min(totalW,320),maxWidth:totalW,display:"block"}}>
        <rect width={totalW} height={totalH} rx={6} fill="rgba(0,0,0,0.55)" stroke="rgba(201,168,76,0.22)" strokeWidth={1}/>
        {estructura.map((_,i)=>(
          <rect key={`ch-${i}`} x={labelW+i*colW} y={0} width={colW} height={rowH} fill={i%2===0?"rgba(201,168,76,0.05)":"rgba(0,0,0,0)"}/>
        ))}
        {[1,2].map(r=>(<line key={`hl-${r}`} x1={0} y1={r*rowH} x2={totalW} y2={r*rowH} stroke="rgba(201,168,76,0.12)" strokeWidth={0.5}/>))}
        <line x1={labelW} y1={0} x2={labelW} y2={totalH} stroke="rgba(201,168,76,0.22)" strokeWidth={1}/>
        {filas.map((fila,ri)=>(
          <g key={`fila-${ri}`}>
            <text x={labelW-6} y={ri*rowH+rowH/2+4} textAnchor="end" fontSize={9} fontFamily="Crimson Text, Georgia, serif" fill={fila.color} fontWeight="bold">{fila.label}</text>
            {fila.vals.map((val,ci)=>{
              const esNeg=typeof val==="number"&&val<0;
              return (
                <text key={`c-${ri}-${ci}`} x={labelW+ci*colW+colW/2} y={ri*rowH+rowH/2+4}
                  textAnchor="middle" fontSize={10} fontFamily="Crimson Text, Georgia, serif"
                  fill={val!==""?(esNeg?"#e05555":fila.color):"rgba(201,168,76,0.12)"}>
                  {val!==""?val:"·"}
                </text>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
