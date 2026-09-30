import { useEffect, useRef, useState } from "react";
import { fonts, colors, secondaryBtnStyle } from "../theme";

// Standalone test page for the 3D table, only reachable with ?mesa3d=sim (see main.jsx).
// Mounts the scene through the simulator (src/mesa3d/sim.ts), which drives it ONLY via the
// MesaScene/MesaEvents contract. Params: ?n=4|6|8 ?yo=<asiento> ?manos=3,5 ?raw=1 ?low=<px> ?debug=1
export default function MesaSim() {
  const ref = useRef(null);
  const simRef = useRef(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const n = Number(q.get("n"));
    const opciones = {
      n: n === 6 || n === 8 ? n : 4,
      yo: Number(q.get("yo") ?? 0) || 0,
      manos: (q.get("manos") ?? "3,5").split(",").map(Number).filter((x) => x >= 1 && x <= 10),
      raw: q.has("raw"),
      debug: q.has("debug"),
      lowHeight: q.has("low") ? Number(q.get("low")) : undefined,
      yaw: q.has("yaw") ? Number(q.get("yaw")) : undefined,
      pitch: q.has("pitch") ? Number(q.get("pitch")) : undefined,
      onInfo: setInfo,
    };
    let cancelado = false;
    // three + the scene live in their own chunk: without ?mesa3d=sim none of this is loaded
    import("./sim").then(({ iniciarSim }) => {
      if (cancelado || !ref.current) return;
      const sim = iniciarSim(ref.current, opciones);
      simRef.current = sim;
      if (opciones.debug) window.__mesa3dSim = sim;
    });
    return () => {
      cancelado = true;
      simRef.current?.destruir();
      simRef.current = null;
      if (window.__mesa3dSim) delete window.__mesa3dSim;
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0908" }}>
      <div ref={ref} data-testid="mesa3d" style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", right: 12, top: 10, display: "flex", gap: 10, alignItems: "center", pointerEvents: "auto" }}>
        <span style={{ fontFamily: fonts.body, color: colors.text.secondary, fontSize: 14, opacity: 0.8 }}>SIMULADOR · {info}</span>
        <button style={secondaryBtnStyle()} onClick={() => simRef.current?.reconectar()}>Reconectar (R)</button>
      </div>
    </div>
  );
}
