import { useState, useEffect } from "react";
import { PantallaInicio } from "./screens/PantallaInicio";
import { PantallaSorteo } from "./screens/PantallaSorteo";
import { PantallaPartida } from "./screens/PantallaPartida";

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
export default function App() {
  const [pantalla,setPantalla]=useState("inicio");
  const [datos,setDatos]=useState(null);

  // Cargar fuentes Google
  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap";
    document.head.appendChild(link);
    return ()=>document.head.removeChild(link);
  },[]);

  const handleReset = () => {
    setDatos(null);
    setPantalla("inicio");
  };

  const handleReiniciar = () => {
    // Vuelve al sorteo con la misma configuración
    setDatos(d => ({...d, pieIdx: undefined}));
    setPantalla("sorteo");
  };

  return (
    <div style={{background:"radial-gradient(ellipse at center, #0d2b1a 0%, #050f08 100%)",minHeight:"100vh",fontFamily:"Crimson Text, Georgia, serif",color:"#f0d080"}}>
      {pantalla==="inicio"&&(
        <PantallaInicio onIniciar={(nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug,dosMazos,ases)=>{
          setDatos({nombres,estructura,tiempoSeg,modoTiempo,capN,capE,kamikazes,nJug:nJug||6,dosMazos:dosMazos||false,ases:ases||{espadas:true,copas:true,oros:true}});
          setPantalla("sorteo");
        }}/>
      )}
      {pantalla==="sorteo"&&datos&&(
        <PantallaSorteo
          jugadores={datos.nombres.map((nombre,i)=>({nombre,eq:i%2===0?0:1}))}
          onComenzar={(pieIdx)=>{setDatos(d=>({...d,pieIdx}));setPantalla("partida");}}
        />
      )}
      {pantalla==="partida"&&datos&&(
        <PantallaPartida
          jugadoresInit={datos.nombres}
          estructura={datos.estructura}
          tiempoInicial={datos.tiempoSeg}
          modoTiempo={datos.modoTiempo}
          pieInicial={datos.pieIdx}
          capN={datos.capN}
          capE={datos.capE}
          kamikazesIniciales={datos.kamikazes??1}
          nJug={datos.nJug??6}
          dosMazos={datos.dosMazos??false}
          ases={datos.ases??{espadas:true,copas:true,oros:true}}
          onReset={handleReset}
          onReiniciar={handleReiniciar}
        />
      )}
    </div>
  );
}
