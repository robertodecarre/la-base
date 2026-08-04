import { useEffect, useRef, useState, useCallback } from "react";

// ══════════════════════════════════════════════
// REACTION FACE — pieza J (señas)
// ══════════════════════════════════════════════
// Cara SVG por asiento, config-object-per-gesture (GESTURES abajo) en vez
// de lógica condicional dispersa por gesto. Nunca muestra qué SIGNIFICA
// cada gesto en pantalla (ni durante ni fuera de la animación) — esa
// decodificación es la mecánica de señas en sí (ver useGestos.js /
// SenasOverlay), no algo que este componente deba saber.

const DARK = "#5C1A26";

export const GESTURES = {
  neutral: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  guino: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "closed", browRot: 0, browLift: 0, nose: false },
  guino_r: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "closed", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  media_sonrisa: { mouth: "M68,142 L100,142 Q114,142 124,135", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  siete_oros: { mouth: "M132,142 L100,142 Q86,142 76,135", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  beso: { mouth: "M92,142 Q100,154 108,142 Q100,132 92,142 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  lengua: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: true, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  abrir_boca: { mouth: "M83,150 Q83,138 100,138 Q117,138 117,150 Q117,162 100,162 Q83,162 83,150 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  cejas: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: -8, nose: false },
  sonreir: { mouth: "M62,136 Q100,158 138,136", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false },
  oler_feo: { mouth: "M74,144 L84,138 L94,146 L104,136 L114,144 L124,138", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: true },
  mejilla: { mouth: "M68,141 Q92,143 110,138 Q121,135 130,139", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false, cheekBulge: true, cheekCx: 158, noseSidePath: "M105,80 Q109,76 113,80" },
  desprecio_r: { mouth: "M132,141 Q108,143 90,138 Q79,135 70,139", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false, cheekBulge: true, cheekCx: 42, noseSidePath: "M87,80 Q91,76 95,80" },
  pt: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: 0, nose: false, cheekBulgeStrong: true, cheekCx: 158 },
  cerrar_ojos: { mouth: "M68,142 L132,142", filled: false, color: DARK, teeth: false, tongue: false, leftEye: "closed", rightEye: "closed", browRot: 0, browLift: 0, nose: false },
  wow: { mouth: "M82,132 Q82,171 100,171 Q118,171 118,132 Q118,123 100,123 Q82,123 82,132 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 0, browLift: -12, nose: false, sweat: true },
  jaja: { mouth: "M48,108 Q100,215 152,108 Q100,150 48,108 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "squint", rightEye: "squint", browRot: 14, browLift: -6, nose: false, tears: true },
  miedo: { mouth: "M70,150 Q70,180 100,180 Q130,180 130,150 Q130,134 100,134 Q70,134 70,150 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "terror", rightEye: "terror", browRot: 18, browLift: -18, nose: false, sweat: true },
  shhh: { mouth: "M84,132 Q84,166 100,166 Q116,166 116,132 Q116,120 100,120 Q84,120 84,132 Z", filled: true, color: DARK, teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 4, browLift: -6, nose: false, hand: true },
  enojo: { mouth: "M78,132 Q78,170 100,170 Q122,170 122,132 Q122,120 100,120 Q78,120 78,132 Z", filled: true, color: "#5A0C0C", teeth: false, tongue: false, leftEye: "open", rightEye: "open", browRot: 22, browLift: 0, nose: false, red: true },
};

// Gestos "largos" (2000ms) — el resto dura 150ms. La duración corta es lo
// que hace costoso espiar la cara de un rival (mirar una es perderse el
// resto), no un timer arbitrario.
const GESTOS_LARGOS = new Set(["wow", "jaja", "miedo", "shhh", "enojo"]);
export function duracionGesto(key) {
  return GESTOS_LARGOS.has(key) ? 2000 : 150;
}

export const GESTURE_KEYS = Object.keys(GESTURES);

// Nombre legible por gesto — puramente una etiqueta de identificación
// (para saber a qué fila corresponde cada uno en el customizador de
// señas), NUNCA un significado ("beso" se llama "Beso", no lo que un
// equipo decida que significa). Traducción literal de la key interna.
export const GESTURE_LABELS = {
  guino: "Guiño derecho",
  guino_r: "Guiño izquierdo",
  media_sonrisa: "Media sonrisa",
  siete_oros: "Media sonrisa (espejada)",
  beso: "Beso",
  lengua: "Lengua",
  abrir_boca: "Abrir la boca",
  cejas: "Levantar cejas",
  sonreir: "Sonreír",
  oler_feo: "Oler feo",
  mejilla: "Inflar cachete",
  desprecio_r: "Desprecio",
  pt: "Pt",
  cerrar_ojos: "Cerrar los ojos",
  wow: "Wow",
  jaja: "Jaja",
  miedo: "Miedo",
  shhh: "Shhh",
  enojo: "Enojo",
};

// ── Pelo ─────────────────────────────────────────
const HAIR_COLORS = { castano: "#5C3A21", rubio: "#D9A63E", negro: "#1C1410" };
export const HAIR_STYLES = ["pelado", "corto", "mohawk", "largo", "entradas"];
export const HAIR_COLOR_KEYS = Object.keys(HAIR_COLORS);

function Hair({ style, color }) {
  if (!style || style === "pelado") return null;
  const fill = HAIR_COLORS[color] || HAIR_COLORS.castano;
  if (style === "corto") {
    return <path d="M22,108 A78,78 0 0,1 178,108 L178,80 A78,74 0 0,0 22,80 Z" fill={fill} />;
  }
  if (style === "mohawk") {
    return (
      <>
        <path d="M22,108 A78,78 0 0,1 178,108 L178,102 A78,78 0 0,0 22,102 Z" fill={fill} opacity={0.5} />
        <path d="M86,20 L114,20 L110,90 L90,90 Z" fill={fill} />
      </>
    );
  }
  if (style === "largo") {
    return (
      <>
        <path d="M22,108 A78,78 0 0,1 178,108 L178,80 A78,74 0 0,0 22,80 Z" fill={fill} />
        <path d="M20,90 Q10,150 26,200 L42,200 Q30,150 36,92 Z" fill={fill} />
        <path d="M180,90 Q190,150 174,200 L158,200 Q170,150 164,92 Z" fill={fill} />
      </>
    );
  }
  if (style === "entradas") {
    return (
      <>
        <path d="M22,108 A78,78 0 0,1 62,42 Q50,60 46,95 Z" fill={fill} />
        <path d="M178,108 A78,78 0 0,0 138,42 Q150,60 154,95 Z" fill={fill} />
        <path d="M30,95 A70,70 0 0,1 170,95 L170,112 A70,66 0 0,0 30,112 Z" fill={fill} opacity={0.85} />
      </>
    );
  }
  return null;
}

function Eye({ side, kind }) {
  const cx = side === "left" ? 70 : 130;
  const cy = 88;
  if (kind === "closed") {
    const d = side === "left" ? "M58,90 Q70,96 82,90" : "M118,90 Q130,96 142,90";
    return <path d={d} fill="none" stroke="#3A2A1A" strokeWidth={3.5} strokeLinecap="round" />;
  }
  if (kind === "squint") {
    const d = side === "left" ? "M58,88 Q70,82 82,86" : "M118,86 Q130,82 142,88";
    return <path d={d} fill="none" stroke="#3A2A1A" strokeWidth={4.5} strokeLinecap="round" />;
  }
  if (kind === "terror") {
    return (
      <>
        <ellipse cx={cx} cy={cy} rx={15} ry={17} fill="white" stroke="#3A2A1A" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={7} fill="#2B1D12" />
      </>
    );
  }
  return <ellipse cx={cx} cy={cy} rx={12} ry={11} fill="#2B1D12" />;
}

function Brow({ side, browRot, browLift }) {
  const x = side === "left" ? 55 : 115;
  const rotOrigin = side === "left" ? "70,63" : "130,63";
  const rot = side === "left" ? browRot : -browRot;
  return (
    <rect x={x} y={60} width={30} height={7} rx={3.5} fill="#4A3320"
      transform={`translate(0, ${browLift}) rotate(${rot}, ${rotOrigin})`} />
  );
}

// ══════════════════════════════════════════════
// REACTION FACE — cara sola, sin lógica de timing (eso vive en
// useGesturePlayback, más abajo). `gestureKey` es la que se está mostrando
// AHORA MISMO — el caller decide cuándo volver a 'neutral'.
// ══════════════════════════════════════════════
// `x`/`y` (default 0) posicionan este <svg> directamente vía atributos SVG
// nativos en vez de que el caller lo envuelva en un <g transform=...> — a
// propósito: en MesaCircular.jsx, la cara se planta como hijo directo del
// <g> del asiento, que varios tests de Playwright ya usan `:scope > g`
// para contar EXACTAMENTE las cartas de la mano (ver
// tests/online-reparto-animado.spec.js, helpers.js's jugarCartaDelTurnoActual).
// Un <g> nuevo ahí rompe ese conteo; un <svg> anidado (viewport SVG válido,
// soporta x/y nativos) no matchea ese selector porque no es tag `g`.
export function ReactionFace({ gestureKey = "neutral", appearance, size = 60, x = 0, y = 0, rotate = 0 }) {
  const g = GESTURES[gestureKey] || GESTURES.neutral;
  const { hairStyle = "pelado", hairColor = "castano", glasses = false } = appearance || {};
  const faceFill = g.red ? "#E8503A" : "#FFCF66";
  // `rotate` (feature de rotación hacia el centro de la mesa, ver
  // rotacionHaciaCentro en engine/structures.js) se aplica como transform
  // nativo del propio <svg> anidado — sigue sin agregar ningún <g> nuevo
  // (ver el comentario de arriba sobre por qué eso importa), un <svg>
  // también acepta `transform` como cualquier elemento gráfico de SVG.
  const centro = size / 2;

  return (
    <svg x={x} y={y} viewBox="0 0 200 200" width={size} height={size} style={{ overflow: "visible", pointerEvents: "none" }}
      transform={rotate ? `rotate(${rotate}, ${x + centro}, ${y + centro})` : undefined}>
      <circle cx={100} cy={110} r={82} fill={faceFill} />

      <Brow side="left" browRot={g.browRot} browLift={g.browLift} />
      <Brow side="right" browRot={g.browRot} browLift={g.browLift} />

      <Eye side="left" kind={g.leftEye} />
      <Eye side="right" kind={g.rightEye} />

      <path d="M97,98 L100,113 L104,98" stroke="#00000030" strokeWidth={2.5} fill="none" />
      {g.nose && (
        <path d="M87,80 Q91,76 95,80 M105,80 Q109,76 113,80" stroke="#00000030" strokeWidth={2.5} fill="none" />
      )}

      <path d={g.mouth} stroke={g.color} strokeWidth={4} fill={g.filled ? g.color : "none"} />

      {g.tongue && <path d="M88,142 Q100,172 112,142 Z" fill="#C85D72" />}

      {g.cheekBulge && (
        <>
          <ellipse cx={g.cheekCx} cy={122} rx={20} ry={17} fill={faceFill} />
          {g.noseSidePath && <path d={g.noseSidePath} stroke="#00000030" strokeWidth={2.5} fill="none" />}
        </>
      )}
      {g.cheekBulgeStrong && (
        <>
          <ellipse cx={g.cheekCx} cy={122} rx={29} ry={23} fill={faceFill} />
          <ellipse cx={g.cheekCx} cy={122} rx={12} ry={9} fill="#E8A93A" />
        </>
      )}

      {g.sweat && <path d="M158,58 Q170,76 158,88 Q146,76 158,58 Z" fill="#7EC8E3" />}
      {g.tears && (
        <>
          <path d="M40,98 Q30,116 38,132 Q48,116 40,98 Z" fill="#7EC8E3" />
          <path d="M160,98 Q150,116 158,132 Q168,116 160,98 Z" fill="#7EC8E3" />
        </>
      )}

      {g.hand && (
        <>
          <path d="M62,170 Q58,120 70,96 Q76,86 84,90 Q90,94 88,106 L88,150 Q88,168 76,178 Q66,182 62,170 Z"
            fill={faceFill} stroke="#E0A94A" strokeWidth={1.5} />
          <path d="M158,54 Q210,40 232,58 L226,72 Q206,60 168,68 Z" fill="white" stroke="#c9c9c9" strokeWidth={1} />
          <text x={196} y={62} textAnchor="middle" fontSize={13} fontWeight={800} fontStyle="italic" fill="#1a1a1a">PUTO!</text>
        </>
      )}
      {g.red && (
        <>
          <path d="M118,30 Q210,-10 260,30 L250,52 Q206,20 130,48 Z" fill="white" stroke="#c9c9c9" strokeWidth={1} />
          <text x={188} y={34} textAnchor="middle" fontSize={10} fontWeight={800} fontStyle="italic" fill="#1a1a1a">Dale, la concha de tu madre!</text>
        </>
      )}

      <Hair style={hairStyle} color={hairColor} />

      {glasses && (
        <g fillOpacity={0.25} stroke="#2B1D12" strokeWidth={2} fill="#dfe6ff">
          <rect x={52} y={76} width={36} height={26} rx={8} />
          <rect x={112} y={76} width={36} height={26} rx={8} />
          <line x1={88} y1={88} x2={112} y2={88} />
        </g>
      )}
    </svg>
  );
}

// ══════════════════════════════════════════════
// USE GESTURE PLAYBACK — press(key) muestra ese gesto y programa la vuelta
// a 'neutral' según duracionGesto(key). Clicks rápidos no apilan: cada
// press cancela cualquier timeout pendiente antes de programar el propio.
// ══════════════════════════════════════════════
export function useGesturePlayback(initial = "neutral") {
  const [gesture, setGesture] = useState(initial);
  const timeoutRef = useRef(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const press = useCallback((key) => {
    if (!GESTURES[key]) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setGesture(key);
    timeoutRef.current = setTimeout(() => {
      setGesture("neutral");
      timeoutRef.current = null;
    }, duracionGesto(key));
  }, []);

  return [gesture, press];
}
