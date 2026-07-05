export const ESTRUCTURAS = {
  clasica2004:  [1,3,5,5,3,1,1,3,5,5,3,1],
  alt2004:      [1,3,5,6,6,5,3,1,1,3,5,6,6,5,3,1],
  postpandemia: [1,2,3,4,5,6,6,5,4,3,2,1],
};
// Máximo de cartas por cantidad de jugadores y modo
export function maxCartas(nJug, dosMazos) {
  if (nJug === 4) return 7;
  if (nJug === 6) return 6;
  if (nJug === 8) return dosMazos ? 7 : 5;
  return 6;
}
// Nombres por defecto según cantidad de jugadores
export const NOMBRES_POR_CANT = {
  4: ["Micho","Tincho","Leo","Negro"],
  6: ["Micho","Tincho","Leo","Negro","Gordo","CabezonIA"],
  8: ["Micho","Tincho","Leo","Negro","Gordo","CabezonIA","Flaco","Pelado"],
};
export const POS_ANGULOS = {
  4: [270, 0, 90, 180],
  6: [270, 330, 30, 90, 150, 210],
  8: [270, 315, 0, 45, 90, 135, 180, 225],
};
export function posEnCirculo(idx, rx, ry, cx, cy, nJug=6) {
  const angulos = POS_ANGULOS[nJug] || POS_ANGULOS[6];
  const ang = (angulos[idx] * Math.PI) / 180;
  return { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
}
