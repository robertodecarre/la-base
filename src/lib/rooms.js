import { supabase, asegurarSesion } from "./supabase";

// Crea una sala nueva. config debe tener la misma forma que ya produce
// PantallaInicio: { nJug, dosMazos, estructura, ases, kamikazes, clock }.
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
