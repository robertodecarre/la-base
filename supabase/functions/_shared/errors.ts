// Mapea los mensajes de las excepciones de las funciones SECURITY DEFINER
// (create_room, join_room, ...) a un status HTTP. Todo lo no reconocido
// cae en 400: son siempre errores de validación/reglas del juego, nunca
// una falla de infraestructura.
const STATUS_POR_ERROR: Record<string, number> = {
  not_authenticated: 401,
  invalid_config: 400,
  invalid_name: 400,
  room_not_found: 404,
  room_not_open: 409,
  room_full: 409,
  could_not_allocate_code: 500,
  not_room_member: 403,
  not_dealing_phase: 409,
  not_enough_cards: 500,
  not_bidding_phase: 409,
  not_your_teams_turn: 403,
  not_captain: 403,
  already_bid: 409,
  invalid_bid: 400,
  kamikaze_only_for_mano: 400,
  kamikaze_not_available: 400,
  no_kamikazes_left: 400,
};

export function statusParaError(mensaje: string): number {
  return STATUS_POR_ERROR[mensaje] ?? 400;
}
