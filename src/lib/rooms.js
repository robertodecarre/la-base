import { supabase, asegurarSesion } from "./supabase";

// Crea una sala nueva. config debe tener esta forma:
// { nJug, dosMazos, estructura, ases, kamikazes, clock }.
export async function crearSala(config) {
  await asegurarSesion();
  const { data, error } = await supabase.functions.invoke("create-room", { body: config });
  if (error) throw error;
  return data; // fila de rooms
}

// Se une a una sala existente por código. Si este dispositivo (su sesión
// anónima) ya tiene un asiento en esa sala, devuelve ese mismo asiento en
// vez de crear uno nuevo (reconexión).
export async function unirseASala(code, name) {
  await asegurarSesion();
  const { data, error } = await supabase.functions.invoke("join-room", { body: { code, name } });
  if (error) throw error;
  return data; // fila de players
}

// Marca/desmarca el "listo" del propio jugador en el lobby — nunca el de
// otro (set_ready solo toca la fila cuyo user_id es el de la sesión que
// llama). Cuando la sala está completa y todos quedan listos, es
// PantallaOnlineSala.jsx quien dispara repartirMano() sola, no esta
// función.
export async function marcarListo(roomId, listo) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("set_ready", { p_room_id: roomId, p_ready: listo });
  if (error) throw error;
  return data; // fila de players
}
