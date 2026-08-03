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

// Elige equipo fijo — LOCAL (0) o VISITANTE (1) — para el propio jugador.
// join_room ya reservó el cupo en la sala pero dejó seat/team en null;
// choose_team es quien asigna ambos de una (ver choose_team_rpc.sql: el
// asiento que le toca mantiene la invariante seat%2==team que el resto de
// las RPCs de juego siguen asumiendo).
export async function elegirEquipo(roomId, team) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("choose_team", { p_room_id: roomId, p_team: team });
  if (error) throw error;
  return data; // fila de players
}

// Guarda la apariencia de cara elegida (pieza J) para el propio jugador —
// { hairStyle, hairColor, glasses }. Puramente cosmético, sin gate de fase.
export async function guardarApariencia(roomId, appearance) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("set_appearance", { p_room_id: roomId, p_appearance: appearance });
  if (error) throw error;
  return data; // fila de players
}

// Guarda el remapeo de señas del propio EQUIPO (pieza J) — solo mientras
// la sala sigue en 'waiting' (set_senas_mapping rechaza room_not_open una
// vez que arrancó la partida). p_mapping es { gestureKey: label, ... },
// parcial: solo los gestos que el equipo eligió remapear.
export async function guardarSenasMapping(roomId, mapping) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("set_senas_mapping", { p_room_id: roomId, p_mapping: mapping });
  if (error) throw error;
  return data; // fila de rooms
}
