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

// Válido cuando es el turno del jugador. Si la carta jugada completa la
// base, la resolución (ganador, trigger de As de Oros) corre server-side
// dentro del mismo RPC.
export async function jugarCarta(roomId, cardUid) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("play_card", {
    p_room_id: roomId,
    p_card_uid: cardUid,
  });
  if (error) throw error;
  return data; // fila de game_state
}

// Solo válido para quien tiró el As de Copas (game_state.pending_action.
// carrier_seat) mientras la sala está en fase copas_menu. sentido: 1 =
// sigue, -1 = se da vuelta. Si esa jugada ya había completado la base
// (pending_action.trick_complete), la resolución de ganador corre
// server-side dentro del mismo RPC, igual que en jugarCarta.
export async function resolverCopas(roomId, sentido) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("resolve_copas_menu", {
    p_room_id: roomId,
    p_direction: sentido,
  });
  if (error) throw error;
  return data; // fila de game_state
}
