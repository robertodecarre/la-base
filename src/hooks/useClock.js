import { useState, useRef, useCallback, useEffect } from "react";

export function fmtTiempo(seg) {
  if (seg <= 0) return "0:00";
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ══════════════════════════════════════════════
// RELOJ DE AJEDREZ
// ══════════════════════════════════════════════
export function useClock(tiempoInicialN, tiempoInicialE, modoTiempo, onAgotado) {
  const [tiempoN, setTiempoN] = useState(tiempoInicialN); // segundos
  const [tiempoE, setTiempoE] = useState(tiempoInicialE);
  const [corriendo, setCorriendo] = useState(null); // null | 0 | 1 (eq que descuenta)
  const [agotadoN, setAgotadoN] = useState(false);
  const [agotadoE, setAgotadoE] = useState(false);
  // modo deportivo: si se agotó, tiene 10s por mano
  const [modoLento, setModoLento] = useState(false);
  const intervalo = useRef(null);

  const detener = useCallback(() => {
    clearInterval(intervalo.current);
    setCorriendo(null);
  }, []);

  const iniciarPara = useCallback((eq) => {
    // Si no hay tiempo configurado, no arrancar el reloj
    if (!tiempoInicialN && !tiempoInicialE) return;
    clearInterval(intervalo.current);
    setCorriendo(eq);
    intervalo.current = setInterval(() => {
      if (eq === 0) {
        setTiempoN(t => {
          const nuevo = t - 1;
          if (nuevo <= 0) {
            clearInterval(intervalo.current);
            setCorriendo(null);
            if (modoTiempo === "muerte") { setAgotadoN(true); onAgotado(0); }
            else { setAgotadoN(true); setModoLento(true); }
            return 0;
          }
          return nuevo;
        });
      } else {
        setTiempoE(t => {
          const nuevo = t - 1;
          if (nuevo <= 0) {
            clearInterval(intervalo.current);
            setCorriendo(null);
            if (modoTiempo === "muerte") { setAgotadoE(true); onAgotado(1); }
            else { setAgotadoE(true); setModoLento(true); }
            return 0;
          }
          return nuevo;
        });
      }
    }, 1000);
  }, [modoTiempo, onAgotado]);

  useEffect(() => () => clearInterval(intervalo.current), []);

  return { tiempoN, tiempoE, corriendo, agotadoN, agotadoE, modoLento, iniciarPara, detener };
}
