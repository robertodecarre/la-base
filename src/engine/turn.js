// Siguiente jugador según sentido de juego (1=antihorario normal, -1=horario invertido)
export function siguienteTurno(jugIdx, nJugTotal, sentido) {
  return sentido === 1 ? (jugIdx + nJugTotal - 1) % nJugTotal : (jugIdx + 1) % nJugTotal;
}
