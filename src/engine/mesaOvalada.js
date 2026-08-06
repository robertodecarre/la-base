// ══════════════════════════════════════════════
// GEOMETRÍA DE LA MESA OVALADA — puerto directo de Component.renderVals()
// (y de sus helpers _stadiumPoint/_stadiumPath) en "Mesa Ovalada para La
// Base (standalone).html" (proyecto raíz) — no una aproximación calculada
// a partir de la captura, el propio archivo del mockup fue leído para
// sacar esto. Ese archivo es una herramienta de mockup con sliders (hw, r,
// separación de asiento, etc.) — STADIUM_PARAMS abajo son los valores ya
// afinados a mano ahí para 4/6/8 jugadores, copiados tal cual, no
// interpolados ni recalculados.
//
// Forma "pista de atletismo" (dos semicírculos de radio r + dos tramos
// rectos de largo 2*hw) en vez de la elipse anterior — MesaCircular.jsx
// consume este módulo para tabla+asientos, engine/structures.js
// (posEnCirculo/rotacionHaciaCentro, círculo puro) se queda como estaba
// para SorteoAnimado.jsx, que es una pantalla distinta y no forma parte de
// este rediseño.

// cx,cy son un espacio de coordenadas local arbitrario (no depende del
// tamaño final en pantalla): el viewBox se recalcula abajo para encuadrar
// justo el contenido, así que solo importan las proporciones relativas
// entre hw/r/FACE_R/CARD_W/CARD_H — mismo valor que usa el propio mockup.
const CX = 600, CY = 400;
const FACE_R = 26, CARD_W = 30, CARD_H = 44;
// Ancho del borde de mesa (madera) entre el óvalo exterior y el paño verde
// interior — mismo RIM que el mockup, offset paralelo exacto del borde.
const RIM = 18;

// Tabla de valores afinados a mano por cantidad de jugadores, portada tal
// cual del `state.params` del mockup (los tres únicos nJug que soporta el
// juego real — ver maxCartas en engine/structures.js).
export const STADIUM_PARAMS = {
  4: { hw: 0, r: 151, seatOffset: 40, mySeatScale: 1.55, faceOffsetMult: 2.1, nameOffsetX: 0, nameOffsetY: 19, topNameOffsetX: 0, topNameOffsetY: 0, tableCardMult: 1.45, otherCardMult: 0.9, mySeatCardMult: 1.05, faceSizeMult: 1 },
  6: { hw: 134, r: 135, seatOffset: 40, mySeatScale: 1.45, faceOffsetMult: 1.65, nameOffsetX: 0, nameOffsetY: 28, topNameOffsetX: 0, topNameOffsetY: 0, tableCardMult: 1.5, otherCardMult: 1.05, mySeatCardMult: 1.1, faceSizeMult: 1.55 },
  8: { hw: 103, r: 145, seatOffset: 40, mySeatScale: 1.5, faceOffsetMult: 1.9, nameOffsetX: 0, nameOffsetY: 19, topNameOffsetX: 0, topNameOffsetY: -7, tableCardMult: 1.35, otherCardMult: 0.9, mySeatCardMult: 1.15, faceSizeMult: 1.35 },
};

// Punto sobre el perímetro "pista" a distancia de arco `s` desde el centro
// del tramo recto inferior, más la normal saliente en ese punto (en
// grados) — usada tanto para ubicar el asiento como para saber hacia dónde
// "empuja" (afuera de la mesa) y cuánto rotar sus cartas hacia el centro.
export function stadiumPoint(s, hw, r) {
  const seg1 = hw, arc = Math.PI * r, seg3 = 2 * hw;
  let x, y, normalDeg;
  if (s <= seg1) {
    x = s; y = r; normalDeg = 90;
  } else if (s <= seg1 + arc) {
    const localS = s - seg1;
    const ang = 90 - (localS / r) * (180 / Math.PI);
    x = hw + r * Math.cos((ang * Math.PI) / 180);
    y = r * Math.sin((ang * Math.PI) / 180);
    normalDeg = ang;
  } else if (s <= seg1 + arc + seg3) {
    const localS = s - seg1 - arc;
    x = hw - localS; y = -r; normalDeg = -90;
  } else if (s <= seg1 + arc + seg3 + arc) {
    const localS = s - seg1 - arc - seg3;
    const ang = -90 - (localS / r) * (180 / Math.PI);
    x = -hw + r * Math.cos((ang * Math.PI) / 180);
    y = r * Math.sin((ang * Math.PI) / 180);
    normalDeg = ang;
  } else {
    const localS = s - seg1 - arc - seg3 - arc;
    x = -hw + localS; y = r; normalDeg = 90;
  }
  return { x, y, normalDeg: ((normalDeg % 360) + 360) % 360 };
}

// Contorno SVG de la pista (mismo hw que el óvalo exterior, solo el radio
// de punta se achica RIM px, para que el paño verde sea un offset paralelo
// exacto del borde marrón). hw<=0.5 (mesa de 4, ver STADIUM_PARAMS) cae en
// un círculo puro en vez de degenerar el arco a 0.
export function stadiumPath(hw, r, cx, cy) {
  if (hw <= 0.5) {
    return `M ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy} Z`;
  }
  return `M ${cx - hw},${cy + r} L ${cx + hw},${cy + r} A ${r},${r} 0 0 0 ${cx + hw},${cy - r} L ${cx - hw},${cy - r} A ${r},${r} 0 0 0 ${cx - hw},${cy + r} Z`;
}

// Ancla para un ícono "entre dos asientos" (libreta/reloj, siempre entre
// los capitanes, seats 0 y 1) — NO es el punto medio entre sus anclas ya
// empujadas (seat.ax/ay): esa cuerda entre dos puntos del perímetro cae
// más cerca del centro que cualquiera de los dos asientos (geometría
// básica de cuerda vs. arco), lo que en la práctica lo metía DENTRO del
// panel de pedir del centro para nJug=4 — confirmado con Playwright real
// (el botón CONFIRMA le tapaba el click al ícono de libreta), no en
// teoría. Se calcula sobre los puntos CRUDOS del perímetro (antes del
// empuje de cada asiento) y se empuja hacia afuera a lo largo de SU
// PROPIA dirección radial desde el centro — mismo principio que el empuje
// de cada asiento, pero a lo largo del radio al punto medio en vez de la
// normal local del perímetro (un punto medio entre dos esquinas no tiene
// una única normal de borde bien definida).
export function pairAnchor(nJug, idxA, idxB) {
  const params = STADIUM_PARAMS[nJug] || STADIUM_PARAMS[6];
  const { hw, r, seatOffset } = params;
  const total = 4 * hw + 2 * Math.PI * r;
  const ptA = stadiumPoint((idxA / nJug) * total, hw, r);
  const ptB = stadiumPoint((idxB / nJug) * total, hw, r);
  const mx = (ptA.x + ptB.x) / 2, my = (ptA.y + ptB.y) / 2;
  const dist = Math.hypot(mx, my) || 1;
  // 2x seatOffset (no 1x): el punto medio ya arranca más adentro que un
  // asiento individual (ver comentario arriba), así que necesita más
  // empuje que un asiento normal para terminar afuera del panel de
  // pedir — verificado con el mismo test que agarró el bug original
  // (online-libreta.spec.js), no un número elegido a ojo.
  const push = seatOffset * 2;
  return { x: CX + mx + (mx / dist) * push, y: CY + my + (my / dist) * push };
}

// Geometría completa de la mesa para nJug asientos — puerto de
// Component.renderVals() del mockup, generalizado a cualquier mySeat (el
// mockup lo dejaba fijo en un slider a mano). No calcula nada de gestos/
// cartas de la mano en sí (eso lo sigue resolviendo MesaCircular.jsx con
// ReactionFace/CartasManoSVG tal cual, este módulo solo da las coordenadas).
export function layoutMesa(nJug, mySeat) {
  const params = STADIUM_PARAMS[nJug] || STADIUM_PARAMS[6];
  const { hw, r, seatOffset, mySeatScale, faceOffsetMult, nameOffsetX, nameOffsetY, topNameOffsetX, topNameOffsetY, tableCardMult, otherCardMult, mySeatCardMult, faceSizeMult } = params;

  const outerPath = stadiumPath(hw, r, CX, CY);
  const innerPath = stadiumPath(hw, Math.max(r - RIM, 20), CX, CY);
  const total = 4 * hw + 2 * Math.PI * r;

  const seats = [];
  for (let i = 0; i < nJug; i++) {
    const isMine = mySeat != null && i === mySeat;
    const scale = isMine ? mySeatScale : 1;
    const s = (i / nJug) * total;
    const pt = stadiumPoint(s, hw, r);
    const normalRad = (pt.normalDeg * Math.PI) / 180;
    const push = seatOffset * (isMine ? 1.15 : 1);
    // ax,ay: ancla del asiento (donde se centran las cartas de la mano),
    // empujada afuera del borde de la mesa a lo largo de la normal.
    const ax = CX + pt.x + Math.cos(normalRad) * push;
    const ay = CY + pt.y + Math.sin(normalRad) * push;
    // Rotación de las cartas hacia el centro — la carita NUNCA rota (así
    // lo hace el mockup: su <svg> de cara no lleva transform alguno),
    // solo el abanico de cartas.
    const rot = pt.normalDeg - 90;

    const faceR = FACE_R * scale * faceSizeMult;
    const faceSize = faceR * 2.1;
    const cw = CARD_W * scale * (isMine ? mySeatCardMult : otherCardMult);
    const ch = CARD_H * scale * (isMine ? mySeatCardMult : otherCardMult);

    // fax,fay: ancla de la carita, empujada MÁS afuera todavía que ax,ay —
    // esto es lo que separa espacialmente cara y cartas (arregla el bug de
    // capas: ya no dependen del orden del DOM para no taparse, están en
    // zonas distintas de la mesa).
    const faceOut = faceR * faceOffsetMult;
    const fax = ax + Math.cos(normalRad) * faceOut;
    const fay = ay + Math.sin(normalRad) * faceOut;

    // Nombre en el "cuello" de la carita — sombrero (arriba, sin rotar)
    // salvo en el tramo recto inferior exacto (pt.y≈r), que lleva el
    // nombre abajo. Se decide por geometría, no por índice de asiento.
    const isTop = !(pt.y >= r - 0.5);
    const nameX = fax + (isTop ? topNameOffsetX : nameOffsetX);
    const nameY = isTop ? fay - faceSize * 0.58 + topNameOffsetY : fay + faceSize * 0.42 + nameOffsetY;
    const bubbleAnchorX = fax, bubbleAnchorY = fay - faceSize * 0.58;
    // Dirección "hacia afuera" (contraria al centro) en la que se apilan
    // más líneas de estado (rol/pedido, bases ganadas) debajo o encima del
    // nombre, según isTop — MesaCircular.jsx las consume tal cual en vez
    // de recalcular el escalado, así el margen del viewBox (abajo) y lo
    // que de verdad se dibuja nunca pueden desincronizarse.
    const outDir = isTop ? -1 : 1;
    const escala = faceR / FACE_R;
    const rolY = nameY + outDir * 14 * escala;
    const basesY = nameY + outDir * 26 * escala;

    // Punto de la mesa (paño) asociado a este asiento, para las cartas
    // YA JUGADAS al centro — interpolación 0.52 hacia el centro, igual
    // que el mockup (ccx/ccy de centerCards).
    const tableCardPoint = { x: CX + pt.x * 0.52, y: CY + pt.y * 0.52 };

    seats.push({
      idx: i, isMine, scale, escala, ax, ay, rot, outDir,
      faceX: fax - faceSize / 2, faceY: fay - faceSize / 2, faceSize,
      faceCx: fax, faceCy: fay, faceR,
      cw, ch,
      nameX, nameY, rolY, basesY, isTop,
      bubbleAnchorX, bubbleAnchorY,
      tableCardPoint,
      cardsTransform: `rotate(${rot} ${ax} ${ay})`,
    });
  }

  // Margen del viewBox: en vez de aproximar con una fórmula cerrada (como
  // hace el mockup, que solo presupuesta UNA línea de nombre — con la
  // línea de rol/pedido y los puntos de bases que agrega MesaCircular.jsx
  // encima, esa aproximación queda corta y recorta texto contra el borde
  // del viewBox, confirmado con captura real, no en teoría), se escanea el
  // alcance real de cada asiento (círculo de la carita + el punto más
  // lejano de las líneas de texto apiladas) y se calcula el cuadro
  // delimitador exacto. TEXT_PAD es un colchón chico y fijo por glyphs de
  // texto (el ancla es la línea base, no el borde del texto) — no depende
  // de nJug/escala porque compensa el tamaño de fuente más grande
  // (mySeat) igual que el más chico (11-14px básicos).
  const TEXT_PAD = 22;
  let reachMaxX = hw + r, reachMaxY = r;
  for (const s of seats) {
    reachMaxX = Math.max(reachMaxX, Math.abs(s.faceCx - CX) + s.faceR, Math.abs(s.nameX - CX) + TEXT_PAD, Math.abs(s.bubbleAnchorX - CX) + TEXT_PAD);
    reachMaxY = Math.max(reachMaxY, Math.abs(s.faceCy - CY) + s.faceR, Math.abs(s.basesY - CY) + TEXT_PAD, Math.abs(s.bubbleAnchorY - CY) + TEXT_PAD);
  }
  const vbMinX = CX - reachMaxX, vbMinY = CY - reachMaxY;
  const vbW = 2 * reachMaxX, vbH = 2 * reachMaxY;

  return {
    cx: CX, cy: CY, hw, r, outerPath, innerPath, seats,
    tableCardMult, otherCardMult, mySeatCardMult,
    vbMinX, vbMinY, vbW, vbH,
    viewBox: `${vbMinX} ${vbMinY} ${vbW} ${vbH}`,
    aspectRatio: vbW / vbH,
  };
}
