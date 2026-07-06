import { supabase, asegurarSesion } from "./supabase";

// Reparte la mano actual: la primera vez que se llama arranca la partida
// (rooms.status "waiting" -> "playing", elige quién reparte al azar);
// las siguientes veces reutiliza el hand_number/dealer_seat que haya
// dejado el cierre de la mano anterior.
export async function repartirMano(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("deal_hand", { p_room_id: roomId });
  if (error) throw error;
  return data; // fila de game_state
}

// Solo el capitán del equipo a quien le toca pedir puede llamar esto.
// kamikaze solo es válido en el pedido de mano (0 o el total de bases).
export async function enviarPedido(roomId, value, kamikaze = false) {
  await asegurarSesion();
  const { data, error } = await supabase.functions.invoke("submit-bid", {
    body: { roomId, value, kamikaze },
  });
  if (error) throw error;
  return data; // fila de game_state
}

// Solo válido cuando es el turno del jugador y la base todavía no se
// completa con esta carta (esa resolución es una pieza futura).
export async function jugarCarta(roomId, cardUid) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("play_card", {
    p_room_id: roomId,
    p_card_uid: cardUid,
  });
  if (error) throw error;
  return data; // fila de game_state
}
