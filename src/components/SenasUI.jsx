import { useEffect, useRef, useState } from "react";
import { ReactionFace, GESTURE_LABELS } from "./ReactionFace";
import { GESTOS_EDITABLES, GESTOS_LARGOS, SIN_SENA, senasEfectivas, ordenEfectivo, bubbleEfectivo } from "../lib/senas";
import { getSenaColors, setSenaColor, getKeyBindings, setKeyBinding, useSenasKeybindings } from "../lib/senasPrefs";
import { colors, fonts, panelStyle } from "../theme";

// ══════════════════════════════════════════════
// SEÑAS UI — extraído (feature #1, batch post-mano_seat-split) de donde
// vivían antes (SenasIcon dentro de MesaCircular.jsx, SenasOverlay dentro
// de PantallaPartidaOnline.jsx) para que SorteoAnimado.jsx también pueda
// usarlos — Roberto: "las señas tienen que poder usarse durante el
// sorteo, igual que durante la partida, sin cableado aparte". El ícono
// requiere un filtro #glow definido en los <defs> del <svg> que lo monta
// (ya existe en MesaCircular, agregado en SorteoAnimado para esto).
// ══════════════════════════════════════════════

// Ícono de "señas" (pieza J) — mismo patrón click-to-expand que
// LibretaIcon/ClockIcon en MesaCircular.jsx. Abre SenasOverlay: a la vez
// hoja de referencia privada (qué significa cada gesto para MI equipo) y
// disparador ("tocá una para mandarla"). Cara sonriente dibujada a mano,
// mismo lenguaje de líneas simples que el resto de estos íconos SVG.
export function SenasIcon({ x, y, abierta, onToggle }) {
  const r = 12;
  const activo = colors.cta.border, inactivo = colors.panel.border;
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer" }}
       role="button" aria-label={abierta ? "Cerrar señas" : "Ver señas"}
       onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <circle cx={0} cy={0} r={r}
        fill={abierta ? "rgba(255,130,80,0.18)" : "rgba(10,14,38,0.85)"}
        stroke={abierta ? activo : inactivo} strokeWidth={abierta ? 1.6 : 1.2}
        filter={abierta ? "url(#glow)" : undefined}/>
      <circle cx={-4} cy={-2} r={1.4} fill={abierta ? activo : "rgba(200,210,255,0.6)"}/>
      <circle cx={4} cy={-2} r={1.4} fill={abierta ? activo : "rgba(200,210,255,0.6)"}/>
      <path d="M-5,3 Q0,7 5,3" stroke={abierta ? activo : "rgba(200,210,255,0.6)"} strokeWidth={1.4} fill="none" strokeLinecap="round"/>
    </g>
  );
}

// Overlay de señas (pieza J) — mismo patrón que TableroOverlay/RelojOverlay
// (backdrop clickeable, panelStyle), pero hace doble función: hoja de
// referencia PRIVADA (nadie más ve que la abriste, ni tu propio
// compañero — por eso vive puramente en estado local del cliente, sin
// broadcast de "se abrió") Y disparador de gestos — cada fila es
// clickeable y manda ESE gesto de una. Fusionar las dos cosas evita un
// segundo panel separado solo para "elegir qué cara poner": la lista ya
// tiene que existir para la referencia, y dado que solo el propio jugador
// ve estas etiquetas, no hay ninguna fuga en dejar clickear desde acá
// mismo. abrirla cuesta lo mismo que espiar a un rival (mientras está
// abierta no estás mirando la mesa) — ver spec de pieza J.
export function SenasOverlay({ senas, onEnviar, onCerrar }) {
  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, background: "rgba(6,8,20,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, width: "100%", maxWidth: 340, maxHeight: "80vh", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: 2, color: colors.text.secondary }}>SEÑAS</div>
          <button onClick={onCerrar} style={{ background: "none", border: "none", color: colors.text.secondary, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 10, color: "rgba(200,210,255,0.4)", fontStyle: "italic" }}>
          Tocá una para mandarla. Solo vos ves esta lista.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {GESTOS_EDITABLES.map((key) => (
            <button key={key} data-gesture-key={key} onClick={() => { onEnviar(key); onCerrar(); }} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 10,
              border: "1px solid rgba(140,160,240,0.25)", background: "rgba(255,255,255,0.03)", cursor: "pointer", textAlign: "left",
            }}>
              <ReactionFace gestureKey={key} size={34} />
              <span style={{ fontSize: 12, color: senas[key] ? colors.text.primary : "rgba(200,210,255,0.35)", fontStyle: senas[key] ? "normal" : "italic", fontFamily: fonts.body }}>{senas[key] || SIN_SENA}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// SENAS BAR — rediseño de barra de señas: reemplaza el ícono+overlay
// modal de arriba en la mesa real (SorteoAnimado.jsx sigue con el patrón
// viejo, fuera de alcance de este pase — ver plan). Barra horizontal de
// ancho completo, siempre montada (no click-to-open): header con
// título/colapsar/tabs/nota de duración/controles de Mírenme, y debajo
// una fila scrolleable de cards. `abierta` colapsa solo la fila de cards
// + controles de Mírenme, el título/toggle del header siempre se ve.
// ══════════════════════════════════════════════

const COLOR_DOT = { pink: "#ff6fae", cyan: "#38bdf8" };
function fondoPorColor(color) {
  if (color === "pink") return "rgba(255,111,174,0.14)";
  if (color === "cyan") return "rgba(56,189,248,0.14)";
  return "rgba(255,255,255,0.02)";
}

const keybindInputStyle = {
  flexShrink: 0, width: 20, height: 20, textAlign: "center", fontSize: 11,
  borderRadius: 6, border: `1px solid ${colors.panel.border}`,
  background: "rgba(0,0,0,0.35)", color: colors.text.primary,
};

const cardBaseStyle = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0,
  width: 132, padding: "6px 8px", borderRadius: 8, border: `1px solid ${colors.panel.border}`,
  boxSizing: "border-box",
};

function SenaCard({ gestureKey, meaning, color, dragging, onDragStart, onDragEnd, onDragOver, onDrop, onPickColor, keyBinding, onKeyBindingChange, onFire }) {
  return (
    <div
      draggable
      data-gesture-key={gestureKey}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}
      onClick={onFire}
      style={{ ...cardBaseStyle, background: fondoPorColor(color), cursor: "grab", opacity: dragging ? 0.4 : 1 }}
    >
      <ReactionFace gestureKey={gestureKey} size={30} />
      <span style={{ fontSize: 11, color: meaning ? colors.text.primary : "rgba(200,210,255,0.35)", fontStyle: meaning ? "normal" : "italic", fontFamily: fonts.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {meaning || SIN_SENA}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" title="Marcar rosado" onClick={() => onPickColor("pink")}
          style={{ flexShrink: 0, width: 12, height: 12, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.4)", background: COLOR_DOT.pink, padding: 0, cursor: "pointer", boxShadow: color === "pink" ? "0 0 0 2px rgba(255,255,255,0.55)" : "none" }} />
        <input type="text" maxLength={1} value={keyBinding} onChange={onKeyBindingChange} onClick={(e) => e.stopPropagation()}
          placeholder="—" style={keybindInputStyle} />
        <button type="button" title="Marcar celeste" onClick={() => onPickColor("cyan")}
          style={{ flexShrink: 0, width: 12, height: 12, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.4)", background: COLOR_DOT.cyan, padding: 0, cursor: "pointer", boxShadow: color === "cyan" ? "0 0 0 2px rgba(255,255,255,0.55)" : "none" }} />
      </div>
    </div>
  );
}

function GestoCard({ gestureKey, keyBinding, onKeyBindingChange, onFire, bubble, editing, draftText, onToggleBubble, onStartEdit, onDraftChange, onCommitEdit }) {
  return (
    <div onClick={onFire} data-gesture-key={gestureKey} style={{ ...cardBaseStyle, background: "rgba(255,255,255,0.02)", cursor: "pointer" }}>
      <ReactionFace gestureKey={gestureKey} size={30} />
      <span style={{ fontSize: 12, color: colors.text.primary, fontFamily: fonts.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {GESTURE_LABELS[gestureKey] ?? gestureKey}
      </span>
      <input type="text" maxLength={1} value={keyBinding} onChange={onKeyBindingChange} onClick={(e) => e.stopPropagation()}
        placeholder="—" style={keybindInputStyle} />
      {editing ? (
        <input
          autoFocus value={draftText} onChange={onDraftChange} onBlur={onCommitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Texto de la viñeta"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 10, borderRadius: 6, border: `1px solid ${colors.cta.border}`, background: "rgba(0,0,0,0.35)", color: colors.text.primary, padding: "2px 4px" }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Activar/desactivar viñeta" onClick={onToggleBubble}
            style={{ flexShrink: 0, fontSize: 9, padding: "2px 6px", borderRadius: 6, border: `1px solid ${colors.panel.border}`, background: bubble.on ? "rgba(255,130,80,0.22)" : "rgba(255,255,255,0.03)", cursor: "pointer", color: colors.text.primary }}>💬</button>
          <button type="button" title="Editar texto de la viñeta" onClick={onStartEdit}
            style={{ flexShrink: 0, fontSize: 9, padding: "2px 6px", borderRadius: 6, border: `1px solid ${colors.panel.border}`, background: "rgba(255,255,255,0.03)", cursor: "pointer", color: colors.text.primary }}>✎</button>
        </div>
      )}
    </div>
  );
}

// Chip chico de un pedido de Mírenme ajeno ("Te miro"/"Dejar de ver a X").
function MirenmeChip({ nombre, watching, onWatch, onUnwatch }) {
  return (
    <button
      type="button"
      onClick={watching ? onUnwatch : onWatch}
      style={{
        fontFamily: fonts.body, fontWeight: 600, fontSize: 11, padding: "5px 10px",
        borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
        border: `1px solid ${watching ? colors.negative : colors.panel.border}`,
        background: watching ? "rgba(255,106,106,0.16)" : "rgba(255,255,255,0.03)",
        color: watching ? "#ffb3b3" : colors.text.secondary,
      }}
    >
      {watching ? `Dejar de ver a ${nombre}` : `Te miro (${nombre})`}
    </button>
  );
}

export function SenasBar({
  mySeat, myTeam, rawMapping, onEnviar,
  abierta, onToggleAbierta,
  onGuardarOrder, onGuardarBubble,
  mirenmeTeamObj, onMirenmePedir, onMirenmeVerA, onMirenmeDejarDeVerA,
  nombresPorAsiento,
}) {
  const [tab, setTab] = useState("senas");
  const misSenas = senasEfectivas(rawMapping);

  // ── orden (drag-to-reorder), rediseño de barra de señas ──
  const ordenServidor = ordenEfectivo(rawMapping);
  const ordenServidorKey = ordenServidor.join(",");
  const [ordenLocal, setOrdenLocal] = useState(ordenServidor);
  useEffect(() => { setOrdenLocal(ordenServidor); }, [ordenServidorKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragKeyRef = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const onDragStart = (key) => (e) => {
    dragKeyRef.current = key;
    setDraggingKey(key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => setDraggingKey(null);
  const onDragOverCard = (e) => e.preventDefault();
  const onDropCard = (targetKey) => (e) => {
    e.preventDefault();
    const dragKey = dragKeyRef.current;
    dragKeyRef.current = null;
    setDraggingKey(null);
    if (!dragKey || dragKey === targetKey) return;
    const arr = ordenLocal.slice();
    const from = arr.indexOf(dragKey), to = arr.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    arr.splice(from, 1);
    arr.splice(to, 0, dragKey);
    setOrdenLocal(arr);
    onGuardarOrder(arr).catch(() => {});
  };

  // ── color tags, personales (localStorage, ver lib/senasPrefs.js) ──
  const [colores, setColores] = useState(() => getSenaColors());
  const onPickColor = (key) => (colorName) => {
    setColores((prev) => {
      const actual = prev[key];
      const nuevo = actual === colorName ? null : colorName;
      setSenaColor(key, nuevo);
      const next = { ...prev };
      if (nuevo) next[key] = nuevo; else delete next[key];
      return next;
    });
  };

  // ── atajos de teclado, personales (localStorage) ──
  const [bindings, setBindings] = useState(() => getKeyBindings());
  const onKeyBindingChange = (actionKey) => (e) => {
    const char = e.target.value.slice(-1);
    setKeyBinding(actionKey, char);
    setBindings((prev) => {
      const next = { ...prev };
      if (char) next[actionKey] = char; else delete next[actionKey];
      return next;
    });
  };
  useSenasKeybindings(bindings, (actionKey) => {
    if (actionKey === "mirenme") onMirenmePedir();
    else onEnviar(actionKey);
  });

  // ── viñetas de gestos largos ──
  const [editingBubbleKey, setEditingBubbleKey] = useState(null);
  const [bubbleDraft, setBubbleDraft] = useState("");
  const startEditBubble = (key) => (e) => {
    e.stopPropagation();
    setEditingBubbleKey(key);
    setBubbleDraft(bubbleEfectivo(rawMapping, key).text);
  };
  const commitEditBubble = () => {
    if (!editingBubbleKey) return;
    const key = editingBubbleKey;
    const cfg = bubbleEfectivo(rawMapping, key);
    setEditingBubbleKey(null);
    onGuardarBubble(key, cfg.on, bubbleDraft).catch(() => {});
  };
  const toggleBubble = (key) => (e) => {
    e.stopPropagation();
    const cfg = bubbleEfectivo(rawMapping, key);
    onGuardarBubble(key, !cfg.on, cfg.text).catch(() => {});
  };

  // ── Mírenme: mi propio pedido + los de mis compañeros ──
  const miSeatKey = String(mySeat);
  const miPedidoActivo = !!mirenmeTeamObj && Object.prototype.hasOwnProperty.call(mirenmeTeamObj, miSeatKey);
  const pedidosDeCompaneros = Object.keys(mirenmeTeamObj || {})
    .filter((seatKey) => seatKey !== miSeatKey)
    .map((seatKey) => ({
      seat: Number(seatKey),
      watching: (mirenmeTeamObj[seatKey] || []).map(String).includes(miSeatKey),
    }));

  return (
    <div style={{ ...panelStyle, width: "100%", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: fonts.display, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: 2, color: colors.text.secondary }}>SEÑAS</span>
          <button type="button" onClick={onToggleAbierta} aria-label={abierta ? "Colapsar señas" : "Expandir señas"} style={{ background: "none", border: "none", color: colors.text.secondary, fontSize: 14, cursor: "pointer", lineHeight: 1, padding: 4 }}>
            {abierta ? "▲" : "▼"}
          </button>
          {abierta && (
            <>
              <div style={{ display: "inline-flex", overflow: "hidden", border: `1px solid ${colors.panel.border}`, borderRadius: 999 }}>
                <button type="button" onClick={() => setTab("senas")} style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, padding: "5px 12px", border: "none", cursor: "pointer", color: tab === "senas" ? "#ffd7c2" : colors.text.secondary, background: tab === "senas" ? "rgba(255,130,80,0.16)" : "transparent" }}>Señas</button>
                <button type="button" onClick={() => setTab("gestos")} style={{ fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 11, padding: "5px 12px", border: "none", borderLeft: `1px solid ${colors.panel.border}`, cursor: "pointer", color: tab === "gestos" ? "#ffd7c2" : colors.text.secondary, background: tab === "gestos" ? "rgba(255,130,80,0.16)" : "transparent" }}>Gestos</button>
              </div>
              <span style={{ fontSize: 10, opacity: 0.55, color: colors.text.secondary, whiteSpace: "nowrap" }}>Señas: al toque · Gestos: 2s</span>
            </>
          )}
        </div>
        {abierta && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={onMirenmePedir} style={{
              fontFamily: fonts.display, fontWeight: 700, fontStyle: "italic", fontSize: 12, letterSpacing: 1,
              padding: "6px 14px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${miPedidoActivo ? colors.negative : colors.cta.border}`,
              background: miPedidoActivo ? "rgba(255,106,106,0.16)" : "rgba(255,130,80,0.12)",
              color: miPedidoActivo ? "#ffb3b3" : "#ffd7c2",
            }}>
              {miPedidoActivo ? "Dejar de ver" : "Mírenme"}
            </button>
            <input type="text" maxLength={1} value={bindings.mirenme ?? ""} onChange={onKeyBindingChange("mirenme")}
              placeholder="—" style={keybindInputStyle} />
            {pedidosDeCompaneros.map(({ seat, watching }) => (
              <MirenmeChip key={seat} nombre={nombresPorAsiento?.[seat] ?? `Asiento ${seat}`} watching={watching}
                onWatch={() => onMirenmeVerA(seat)} onUnwatch={() => onMirenmeDejarDeVerA(seat)} />
            ))}
          </div>
        )}
      </div>

      {abierta && (
        <div style={{ display: "flex", flexDirection: "row", gap: 8, overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          {tab === "senas" && ordenLocal.map((key) => (
            <SenaCard key={key} gestureKey={key} meaning={misSenas[key]} color={colores[key] ?? null}
              dragging={draggingKey === key}
              onDragStart={onDragStart(key)} onDragEnd={onDragEnd} onDragOver={onDragOverCard} onDrop={onDropCard(key)}
              onPickColor={onPickColor(key)}
              keyBinding={bindings[key] ?? ""} onKeyBindingChange={onKeyBindingChange(key)}
              onFire={() => onEnviar(key)} />
          ))}
          {tab === "gestos" && GESTOS_LARGOS.map((key) => {
            const bubble = bubbleEfectivo(rawMapping, key);
            return (
              <GestoCard key={key} gestureKey={key}
                keyBinding={bindings[key] ?? ""} onKeyBindingChange={onKeyBindingChange(key)}
                onFire={() => onEnviar(key)}
                bubble={bubble} editing={editingBubbleKey === key} draftText={bubbleDraft}
                onToggleBubble={toggleBubble(key)} onStartEdit={startEditBubble(key)}
                onDraftChange={(e) => setBubbleDraft(e.target.value)} onCommitEdit={commitEditBubble} />
            );
          })}
        </div>
      )}
    </div>
  );
}
