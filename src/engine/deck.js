import { PALOS, VALS } from "./cards";

export function crearMazo(dosMazos=false) {
  let id = 0; const m = [];
  // Primer mazo completo
  for (const p of PALOS) for (const v of VALS) m.push({ palo: p, valor: v, uid: id++, mazo: 1 });
  // Segundo mazo sin ases (vals 2-7, 10-12)
  if (dosMazos) {
    const VALS2 = [2,3,4,5,6,7,10,11,12];
    for (const p of PALOS) for (const v of VALS2) m.push({ palo: p, valor: v, uid: id++, mazo: 2 });
  }
  return m;
}
export function mezclar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
