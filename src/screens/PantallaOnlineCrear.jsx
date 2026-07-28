import { useEffect, useState } from "react";
import { ESTRUCTURAS, maxCartas } from "../engine/structures";
import { crearSala, unirseASala } from "../lib/rooms";
import { mensajeDeError } from "../lib/erroresSala";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, tituloStyle,
  ctaStyle, linkStyle, inputStyle, selectStyle, segmentedOptionStyle,
  checkRowStyle, checkboxStyle, chipStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

const labelCenter = { fontSize: 11, color: colors.text.secondary, letterSpacing: 2, textAlign: "center", fontFamily: fonts.body, fontWeight: 600 };
const labelLeft = { fontSize: 11, color: colors.text.secondary, letterSpacing: 2, fontFamily: fonts.body, fontWeight: 600 };
const helpText = { fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic", fontFamily: fonts.body, lineHeight: 1.4 };
const divider = { borderTop: "1px solid rgba(74,90,168,0.35)", paddingTop: 14, marginBottom: 14 };
const errorBox = { fontSize: 11, color: "#ffb3a8", background: "rgba(160,50,30,0.18)", border: "1px solid rgba(255,140,100,0.4)", borderRadius: 10, padding: "8px 12px", textAlign: "center", fontFamily: fonts.body };

// ══════════════════════════════════════════════
// PANTALLA ONLINE CREAR — arma la config de la sala
// ══════════════════════════════════════════════
// Mismos campos de configuración que PantallaInicio.jsx (nJug, dosMazos,
// estructura, ases, kamikazes, tiempo) compuestos acá aparte en vez de
// extraídos de PantallaInicio, para no tocar ese flujo hotseat ya
// funcionando. create_room en sí no espera nombre/capitán (ver
// validateConfig.ts) — pero quien crea la sala también tiene que hacer
// join_room para tener un asiento, igual que cualquier otro jugador:
// players/game_state/played_cards están detrás de is_room_member(room_id)
// en RLS (ver 20260706000000_online_multiplayer_schema.sql), así que sin
// ese join el creador ni siquiera podría ver a los demás jugadores
// entrando a su propia sala. Por eso este formulario pide "tu nombre" y
// encadena crearSala() -> unirseASala() antes de avisar que la sala está
// lista.
export function PantallaOnlineCrear({ onCreada, onVolver }) {
  const [nJug,setNJug]=useState(6);
  const [dosMazos,setDosMazos]=useState(false);
  const [estructuraSel,setEstructuraSel]=useState("clasica2004");
  const [customStr,setCustomStr]=useState("1,2,3,2,1");
  const [usarTiempo,setUsarTiempo]=useState(false);
  const [minutos,setMinutos]=useState(10);
  const [modoTiempo,setModoTiempo]=useState("muerte");
  const [kamikazes,setKamikazes]=useState(1);
  const [ases,setAses]=useState({espadas:true,copas:true,oros:true});
  const [nombre,setNombre]=useState("");
  const [creando,setCreando]=useState(false);
  const [error,setError]=useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const cambiarNJug = (n) => {
    setNJug(n);
    if (n !== 8) setDosMazos(false);
  };

  const maxC = maxCartas(nJug, dosMazos);
  const estructura = (estructuraSel==="custom"
    ? customStr.split(",").map(x=>parseInt(x.trim())).filter(x=>!isNaN(x)&&x>0)
    : ESTRUCTURAS[estructuraSel]
  ).map(x=>Math.min(x,maxC));

  const puedeCrear = nombre.trim().length>0 && !creando;

  const crear = async () => {
    setError(null);
    setCreando(true);
    try {
      const config = {
        nJug, dosMazos, estructura, ases, kamikazes,
        clock: usarTiempo ? { minutos, modo: modoTiempo } : null,
      };
      const room = await crearSala(config);
      await unirseASala(room.code, nombre.trim());
      onCreada(room);
    } catch (err) {
      setError(await mensajeDeError(err));
      setCreando(false);
    }
  };

  return (
    <div style={{
      background: colors.bg, minHeight: "100vh", fontFamily: fonts.body,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      padding: "30px 14px",
    }}>
      <div style={{ ...panelStyle, width: "100%", maxWidth: 520, padding: "22px 20px 24px" }}>
        <div style={diagonalWordmarkStyle}>{Array(6).fill(WORDMARK).join(" · ")}</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <div style={badgeStyle}>LB</div>
          <div style={tituloStyle}>CREAR SALA</div>
        </div>

        {/* TU NOMBRE — quien crea la sala también entra como jugador */}
        <div style={{marginBottom:16}}>
          <div style={{...labelCenter, marginBottom:6}}>TU NOMBRE</div>
          <input value={nombre} onChange={e=>setNombre(e.target.value.slice(0,20))} placeholder="Ej: Tincho" style={inputStyle()}/>
        </div>

        {/* CANTIDAD DE JUGADORES */}
        <div style={{...labelCenter, marginBottom:8}}>CANTIDAD DE JUGADORES</div>
        <div style={{display:"flex",gap:10,marginBottom:16,justifyContent:"center"}}>
          {[4,6,8].map(n=>(
            <button key={n} onClick={()=>cambiarNJug(n)} style={{
              ...segmentedOptionStyle(nJug===n),
              width:52, height:52, padding:0, fontSize:16,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>{n}</button>
          ))}
        </div>

        {/* DOS MAZOS — solo para 8 jugadores */}
        {nJug===8&&(
          <div style={{...checkRowStyle(dosMazos), alignItems:"center", marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:colors.text.secondary}}>
              <input type="checkbox" checked={dosMazos} onChange={e=>setDosMazos(e.target.checked)} style={checkboxStyle}/>
              Jugar con dos mazos (sin ases del 2do mazo · máx {maxC} cartas)
            </label>
          </div>
        )}

        <div style={{...labelLeft, marginBottom:8}}>ESTRUCTURA DE MANOS</div>
        <select value={estructuraSel} onChange={e=>setEstructuraSel(e.target.value)} style={{...selectStyle(),marginBottom:8}}>
          <option value="clasica2004">2004 Clásica (1,3,5,5,3,1,1,3,5,5,3,1)</option>
          <option value="alt2004">2004 Alternativa (1,3,5,6,6,5,3,1,1,3,5,6,6,5,3,1)</option>
          <option value="postpandemia">Postpandemia (1,2,3,4,5,6,6,5,4,3,2,1)</option>
          <option value="custom">Personalizada</option>
        </select>
        {estructuraSel==="custom"&&(
          <input style={{...inputStyle(),textAlign:"left",marginBottom:8}} value={customStr} onChange={e=>setCustomStr(e.target.value)} placeholder={`ej: 1,2,3,2,1 (máx ${maxC})`}/>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {estructura.map((c,i)=>(
            <div key={i} style={chipStyle}>{c}</div>
          ))}
        </div>

        {/* SUPERPODERES DE ASES */}
        <div style={divider}>
          <div style={{...labelLeft, marginBottom:10}}>SUPERPODERES DE ASES</div>
          {[
            {key:"espadas", label:"As de Espadas", desc:"Si cae después del Ancho de Bastos en la misma base, lo mata y gana la base.", emoji:"⚔️"},
            {key:"copas",   label:"As de Copas",   desc:"Al caer, quien lo tiró elige si el sentido de juego se invierte o continúa.", emoji:"🏆"},
            {key:"oros",    label:"As de Oros",     desc:"Si su equipo gana la base, quien lo tiró elige quién abre la siguiente.", emoji:"🟡"},
          ].map(({key,label,desc,emoji})=>(
            <div key={key} style={{...checkRowStyle(ases[key]), marginBottom:10}}>
              <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}}>
                <input type="checkbox" checked={ases[key]} onChange={e=>setAses(a=>({...a,[key]:e.target.checked}))} style={checkboxStyle}/>
                <span style={{fontSize:13}}>{emoji}</span>
              </label>
              <div>
                <div style={{fontSize:11,color:ases[key]?colors.text.primary:colors.text.secondary,fontFamily:fonts.body,fontWeight:700,marginBottom:2}}>{label}</div>
                <div style={helpText}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* KAMIKAZES */}
        <div style={divider}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <label style={{fontSize:11,color:colors.text.secondary,whiteSpace:"nowrap",fontFamily:fonts.body}}>Kamikazes por equipo mano:</label>
            <select value={kamikazes} onChange={e=>setKamikazes(parseInt(e.target.value))} style={{...selectStyle(),width:70,textAlign:"center"}}>
              {[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={helpText}>Pedir 0 o el maximo sin declarar kamikaze y perder por 2+ = perder la partida.</div>
        </div>

        {/* TIEMPO */}
        <div style={{...divider, marginBottom:0}}>
          <div style={{...checkRowStyle(usarTiempo), alignItems:"center", marginBottom:10}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:colors.text.secondary}}>
              <input type="checkbox" checked={usarTiempo} onChange={e=>setUsarTiempo(e.target.checked)} style={checkboxStyle}/>
              Jugar con reloj
            </label>
          </div>
          {usarTiempo&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <label style={{fontSize:11,color:colors.text.secondary,whiteSpace:"nowrap",fontFamily:fonts.body}}>Minutos por equipo:</label>
                <input type="number" min={1} max={60} value={minutos} onChange={e=>setMinutos(parseInt(e.target.value)||5)}
                  style={{...inputStyle(),width:70}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                {["muerte","deportivo"].map(modo=>(
                  <button key={modo} onClick={()=>setModoTiempo(modo)} style={{
                    ...segmentedOptionStyle(modoTiempo===modo), flex:1, fontSize:12, padding:"9px 8px",
                  }}>
                    {modo==="muerte"?"⚡ Muerte súbita":"🏃 Modo deportivo"}
                  </button>
                ))}
              </div>
              <div style={helpText}>
                {modoTiempo==="muerte"
                  ?"Al agotar el tiempo, el equipo pierde la partida."
                  :"Al agotar el tiempo, ese equipo tendrá solo 10 segundos por mano para decidir."}
              </div>
            </div>
          )}
        </div>

        {error&&<div style={{...errorBox, marginTop:14}}>{error}</div>}

        <button onClick={crear} disabled={!puedeCrear} style={{...ctaStyle({disabled:!puedeCrear}), marginTop:16}}>
          {creando?"Creando…":"Crear sala"}
        </button>
      </div>

      <button onClick={onVolver} style={linkStyle}>← volver</button>
    </div>
  );
}
