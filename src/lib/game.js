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
