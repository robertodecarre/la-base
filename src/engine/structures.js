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

// Ángulo (grados) para girar las cartas + cara de un asiento hacia el
// centro de la mesa, como una mano real sostenida en ángulo hacia adentro
// — pieza de rotación, hasta ahora inexistente del todo en MesaCircular.
//
// OJO: no es "idx * 360/nJug" — ese cálculo simple asume que el asiento 0
// está al Sur (abajo), y NO es así: POS_ANGULOS ubica cada asiento por
// posición ABSOLUTA en la mesa (idx=0 siempre cae en ángulo 270°=Norte
// para 4/6/8 jugadores, confirmado leyendo POS_ANGULOS directo — nunca
// hay ninguna rotación relativa a "quién mira" en este componente, mySeat
// solo agranda el asiento propio, no lo reubica). La rotación de cada
// asiento tiene que salir de SU PROPIO ángulo real (el mismo que
// posEnCirculo ya usa), no del índice de asiento — si no, un asiento en
// el Norte quedaría con las cartas "derechas" (apuntando hacia arriba,
// AL REVÉS de hacia el centro) en vez de giradas 180°.
//
// Convención: el asiento que cae en el Sur (ángulo 90°, y=cy+ry — abajo
// en pantalla) es el que necesita 0° de giro, porque una carta sin girar
// ya "apunta hacia arriba" (hacia -y), que desde el Sur es exactamente
// hacia el centro. Cualquier otro asiento gira proporcional a su
// distancia angular desde esa posición Sur.
export function rotacionHaciaCentro(idx, nJug=6) {
  const angulos = POS_ANGULOS[nJug] || POS_ANGULOS[6];
  const SUR = 90;
  return ((angulos[idx] - SUR) + 360) % 360;
}
