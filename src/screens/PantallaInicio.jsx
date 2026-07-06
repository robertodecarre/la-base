import { useState } from "react";
import { ESTRUCTURAS, maxCartas, NOMBRES_POR_CANT } from "../engine/structures";
import { Btn } from "../components/Btn";

// ══════════════════════════════════════════════
// PANTALLA INICIO
// ══════════════════════════════════════════════
export function PantallaInicio({ onIniciar }) {
  const [nJug,setNJug]=useState(6);
  const [dosMazos,setDosMazos]=useState(false);
  const [nombres,setNombres]=useState([...NOMBRES_POR_CANT[6]]);
  const [estructuraSel,setEstructuraSel]=useState("clasica2004");
  const [customStr,setCustomStr]=useState("1,2,3,2,1");
  const [usarTiempo,setUsarTiempo]=useState(false);
  const [minutos,setMinutos]=useState(10);
  const [modoTiempo,setModoTiempo]=useState("muerte");
  const [kamikazes,setKamikazes]=useState(1);
  const [capN,setCapN]=useState(0);
  const [capE,setCapE]=useState(1);
  const [ases,setAses]=useState({espadas:true,copas:true,oros:true});

  const cambiarNJug = (n) => {
    setNJug(n);
    setNombres([...NOMBRES_POR_CANT[n]]);
    setCapN(0); setCapE(1);
    if (n !== 8) setDosMazos(false);
  };

  const maxC = maxCartas(nJug, dosMazos);
  const estructura = (estructuraSel==="custom"
    ? customStr.split(",").map(x=>parseInt(x.trim())).filter(x=>!isNaN(x)&&x>0)
    : ESTRUCTURAS[estructuraSel]
  ).map(x=>Math.min(x,maxC));

  const inp={fontFamily:"Crimson Text, Georgia, serif",fontSize:12,padding:"5px 8px",borderRadius:5,border:"1.5px solid rgba(201,168,76,0.4)",background:"rgba(0,0,0,0.4)",color:"#f0d080",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"16px 12px"}}>
      <div style={{fontSize:28,color:"#f0d080",letterSpacing:4,textShadow:"0 0 20px rgba(201,168,76,0.4)"}}>LA BASE</div>
      <div style={{fontSize:11,color:"rgba(201,168,76,0.3)",letterSpacing:3}}>NAIPES ESPAÑOLES</div>

      <div style={{background:"rgba(0,0,0,0.5)",border:"1.5px solid rgba(201,168,76,0.22)",borderRadius:12,padding:20,width:"100%",maxWidth:520}}>

        {/* CANTIDAD DE JUGADORES */}
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8,textAlign:"center"}}>CANTIDAD DE JUGADORES</div>
        <div style={{display:"flex",gap:8,marginBottom:16,justifyContent:"center"}}>
          {[4,6,8].map(n=>(
            <button key={n} onClick={()=>cambiarNJug(n)} style={{
              fontFamily:"Cinzel, Georgia, serif",fontSize:14,fontWeight:"bold",
              width:52,height:52,borderRadius:8,
              border:`2px solid ${nJug===n?"#c9a84c":"rgba(201,168,76,0.25)"}`,
              background:nJug===n?"rgba(201,168,76,0.2)":"rgba(0,0,0,0.3)",
              color:nJug===n?"#f0d080":"rgba(201,168,76,0.45)",cursor:"pointer",
            }}>{n}</button>
          ))}
        </div>

        {/* DOS MAZOS — solo para 8 jugadores */}
        {nJug===8&&(
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"8px 12px",background:"rgba(201,168,76,0.08)",borderRadius:8,border:"1px solid rgba(201,168,76,0.2)"}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"rgba(201,168,76,0.7)"}}>
              <input type="checkbox" checked={dosMazos} onChange={e=>setDosMazos(e.target.checked)} style={{accentColor:"#c9a84c"}}/>
              Jugar con dos mazos (sin ases del 2do mazo · máx {maxC} cartas)
            </label>
          </div>
        )}

        {/* JUGADORES Y CAPITANES */}
        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8,textAlign:"center"}}>JUGADORES Y CAPITANES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          {Array.from({length:nJug},(_,i)=>{
            const eq=i%2===0?"NOSOTROS":"ELLOS";
            const eqColor=i%2===0?"#5b9bd5":"#e07b54";
            const esCap = i%2===0 ? capN===i : capE===i;
            return (
              <div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{fontSize:9,color:eqColor,letterSpacing:1}}>J{i+1} · {eq}</div>
                  <button onClick={()=>i%2===0?setCapN(i):setCapE(i)} title="Hacer capitán" style={{
                    fontSize:9,padding:"1px 5px",borderRadius:4,border:`1px solid ${esCap?"#c9a84c":"rgba(201,168,76,0.25)"}`,
                    background:esCap?"rgba(201,168,76,0.2)":"transparent",
                    color:esCap?"#f0d080":"rgba(201,168,76,0.4)",cursor:"pointer",
                  }}>{esCap?"★ CAP":"☆"}</button>
                </div>
                <input style={inp} value={nombres[i]||""} onChange={e=>setNombres(n=>n.map((v,j)=>j===i?e.target.value:v))}/>
              </div>
            );
          })}
        </div>

        <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:8}}>ESTRUCTURA DE MANOS</div>
        <select value={estructuraSel} onChange={e=>setEstructuraSel(e.target.value)} style={{...inp,marginBottom:8}}>
          <option value="clasica2004">2004 Clásica (1,3,5,5,3,1,1,3,5,5,3,1)</option>
          <option value="alt2004">2004 Alternativa (1,3,5,6,6,5,3,1,1,3,5,6,6,5,3,1)</option>
          <option value="postpandemia">Postpandemia (1,2,3,4,5,6,6,5,4,3,2,1)</option>
          <option value="custom">Personalizada</option>
        </select>
        {estructuraSel==="custom"&&(
          <input style={{...inp,marginBottom:8}} value={customStr} onChange={e=>setCustomStr(e.target.value)} placeholder={`ej: 1,2,3,2,1 (máx ${maxC})`}/>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
          {estructura.map((c,i)=>(
            <div key={i} style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.18)",color:"rgba(201,168,76,0.55)"}}>{c}</div>
          ))}
        </div>

        {/* SUPERPODERES DE ASES */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{fontSize:11,color:"rgba(201,168,76,0.45)",letterSpacing:2,marginBottom:10}}>SUPERPODERES DE ASES</div>
          {[
            {key:"espadas", label:"As de Espadas", desc:"Si cae después del Ancho de Bastos en la misma base, lo mata y gana la base.", emoji:"⚔️"},
            {key:"copas",   label:"As de Copas",   desc:"Al caer, quien lo tiró elige si el sentido de juego se invierte o continúa.", emoji:"🏆"},
            {key:"oros",    label:"As de Oros",     desc:"Si su equipo gana la base, quien lo tiró elige quién abre la siguiente.", emoji:"🟡"},
          ].map(({key,label,desc,emoji})=>(
            <div key={key} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,padding:"8px 10px",borderRadius:8,border:`1px solid ${ases[key]?"rgba(201,168,76,0.35)":"rgba(201,168,76,0.12)"}`,background:ases[key]?"rgba(201,168,76,0.07)":"rgba(0,0,0,0.2)"}}>
              <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}}>
                <input type="checkbox" checked={ases[key]} onChange={e=>setAses(a=>({...a,[key]:e.target.checked}))} style={{accentColor:"#c9a84c",width:14,height:14}}/>
                <span style={{fontSize:13}}>{emoji}</span>
              </label>
              <div>
                <div style={{fontSize:11,color:ases[key]?"#f0d080":"rgba(201,168,76,0.4)",fontWeight:"bold",marginBottom:2}}>{label}</div>
                <div style={{fontSize:10,color:"rgba(201,168,76,0.4)",fontStyle:"italic",lineHeight:1.4}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* KAMIKAZES */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <label style={{fontSize:11,color:"rgba(201,168,76,0.7)",whiteSpace:"nowrap"}}>Kamikazes por equipo mano:</label>
            <select value={kamikazes} onChange={e=>setKamikazes(parseInt(e.target.value))} style={{...inp,width:60}}>
              {[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic",marginBottom:10}}>Pedir 0 o el maximo sin declarar kamikaze y perder por 2+ = perder la partida.</div>
        </div>

        {/* TIEMPO */}
        <div style={{borderTop:"1px solid rgba(201,168,76,0.15)",paddingTop:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"rgba(201,168,76,0.7)"}}>
              <input type="checkbox" checked={usarTiempo} onChange={e=>setUsarTiempo(e.target.checked)} style={{accentColor:"#c9a84c"}}/>
              Jugar con reloj
            </label>
          </div>
          {usarTiempo&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <label style={{fontSize:11,color:"rgba(201,168,76,0.5)",whiteSpace:"nowrap"}}>Minutos por equipo:</label>
                <input type="number" min={1} max={60} value={minutos} onChange={e=>setMinutos(parseInt(e.target.value)||5)}
                  style={{...inp,width:60,textAlign:"center"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                {["muerte","deportivo"].map(modo=>(
                  <button key={modo} onClick={()=>setModoTiempo(modo)} style={{
                    flex:1,padding:"8px",fontFamily:"Crimson Text, Georgia, serif",fontSize:11,letterSpacing:1,
                    border:`2px solid ${modoTiempo===modo?"#c9a84c":"rgba(201,168,76,0.25)"}`,
                    borderRadius:7,background:modoTiempo===modo?"rgba(201,168,76,0.15)":"rgba(0,0,0,0.3)",
                    color:modoTiempo===modo?"#f0d080":"rgba(201,168,76,0.45)",cursor:"pointer",
                  }}>
                    {modo==="muerte"?"⚡ Muerte súbita":"🏃 Modo deportivo"}
                  </button>
                ))}
              </div>
              <div style={{fontSize:10,color:"rgba(201,168,76,0.35)",fontStyle:"italic"}}>
                {modoTiempo==="muerte"
                  ?"Al agotar el tiempo, el equipo pierde la partida."
                  :"Al agotar el tiempo, ese equipo tendrá solo 10 segundos por mano para decidir."}
              </div>
            </div>
          )}
        </div>

        <div style={{display:"flex",justifyContent:"center"}}>
          <Btn verde onClick={()=>onIniciar(nombres.map((n,i)=>n.trim()||`J${i+1}`),estructura,usarTiempo?minutos*60:null,modoTiempo,capN,capE,kamikazes,nJug,dosMazos,ases)}>
            COMENZAR SORTEO
          </Btn>
        </div>
      </div>
    </div>
  );
}
