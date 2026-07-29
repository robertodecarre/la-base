// El hook useClock (reloj local de hotseat) se fue con PantallaPartida.jsx
// — el reloj online es server-authoritative (game_state.clock), no usa
// ningún hook local, ver PantallaPartidaOnline.jsx. fmtTiempo sigue acá
// porque DisplayReloj.jsx (compartido) todavía la necesita.
export function fmtTiempo(seg) {
  if (seg <= 0) return "0:00";
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
