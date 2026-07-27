import { useEffect, useState } from "react";
import { unirseASala } from "../lib/rooms";
import { mensajeDeError } from "../lib/erroresSala";
import {
  FONTS_URL, colors, fonts, panelStyle, badgeStyle, tituloStyle,
  ctaStyle, linkStyle, inputStyle, diagonalWordmarkStyle, WORDMARK,
} from "../theme";

// Mismo alfabeto que generate_room_code() en la base (sin 0/O/1/I/L, para
// que no haya ambigüedad al leerlo/tipearlo en voz alta).
const CARACTER_INVALIDO = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
function limpiarCodigo(v) {
  return v.toUpperCase().replace(CARACTER_INVALIDO, "").slice(0, 6);
}

const labelStyle = { fontSize: 11, color: colors.text.secondary, letterSpacing: 2, marginBottom: 6, textAlign: "center", fontFamily: fonts.body, fontWeight: 600 };

// ══════════════════════════════════════════════
// PANTALLA ONLINE UNIRSE — código + nombre
// ══════════════════════════════════════════════
export function PantallaOnlineUnirse({ onUnida, onVolver }) {
  const [code,setCode]=useState("");
  const [nombre,setNombre]=useState("");
  const [uniendo,setUniendo]=useState(false);
  const [error,setError]=useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const puedeUnirse = code.length>=4 && nombre.trim().length>0 && !uniendo;

  const unirse = async () => {
    setError(null);
    setUniendo(true);
    try {
      const player = await unirseASala(code, nombre.trim());
      onUnida(player);
    } catch (err) {
      setError(await mensajeDeError(err));
      setUniendo(false);
    }
  };

  return (
    <div style={{
      background: colors.bg, minHeight: "100vh", fontFamily: fonts.body,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      padding: "30px 14px",
    }}>
      <div style={{ ...panelStyle, width: "100%", maxWidth: 360, padding: "22px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={diagonalWordmarkStyle}>{Array(6).fill(WORDMARK).join(" · ")}</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={badgeStyle}>LB</div>
          <div style={tituloStyle}>UNIRSE A SALA</div>
        </div>

        <div>
          <div style={labelStyle}>CÓDIGO DE SALA</div>
          <input
            value={code}
            onChange={e=>setCode(limpiarCodigo(e.target.value))}
            placeholder="ABCDE"
            maxLength={6}
            style={inputStyle({ big: true })}
          />
        </div>
        <div>
          <div style={labelStyle}>TU NOMBRE</div>
          <input
            value={nombre}
            onChange={e=>setNombre(e.target.value.slice(0,20))}
            placeholder="Ej: Tincho"
            style={inputStyle()}
            onKeyDown={e=>{if(e.key==="Enter"&&puedeUnirse)unirse();}}
          />
        </div>

        {error&&(
          <div style={{ fontSize: 11, color: "#ffb3a8", background: "rgba(160,50,30,0.18)", border: "1px solid rgba(255,140,100,0.4)", borderRadius: 10, padding: "8px 12px", textAlign: "center", fontFamily: fonts.body }}>
            {error}
          </div>
        )}

        <button onClick={unirse} disabled={!puedeUnirse} style={ctaStyle({ disabled: !puedeUnirse })}>
          {uniendo?"Uniendo…":"Unirse"}
        </button>
      </div>

      <button onClick={onVolver} style={linkStyle}>← volver</button>
    </div>
  );
}
