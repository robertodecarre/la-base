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

// Guarda el orden de cards de la pestaña Señas (rediseño de barra de
// señas) para el propio EQUIPO — a diferencia de guardarSenasMapping, SIN
// gate de fase: es puro orden visual, se puede reordenar arrastrando
// durante la partida real (ver set_senas_order). order es un array de
// gestureKeys.
export async function guardarSenasOrder(roomId, order) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("set_senas_order", { p_room_id: roomId, p_order: order });
  if (error) throw error;
  return data; // fila de rooms
}

// Prende/apaga y edita el texto de la viñeta de un gesto largo, para el
// propio EQUIPO — tampoco tiene gate de fase (ver set_senas_bubble).
export async function guardarSenasBubble(roomId, gestureKey, on, text) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("set_senas_bubble", {
    p_room_id: roomId, p_gesture_key: gestureKey, p_on: on, p_text: text,
  });
  if (error) throw error;
  return data; // fila de rooms
}

// Mírenme (mecanismo real, no el toggle simplificado del mockup) — pedido
// propio (togglea: abre si no tenía uno activo, cancela manualmente si
// sí, sin importar quién lo esté mirando), "te miro"/"dejar de ver" sobre
// el pedido de un compañero puntual. Ver game_state.mirenme y las tres
// RPCs en 20260805000000_senas_order_bubbles_mirenme.sql.
export async function mirenmePedir(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("mirenme_request", { p_room_id: roomId });
  if (error) throw error;
  return data; // fila de game_state
}
export async function mirenmeVerA(roomId, requesterSeat) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("mirenme_watch", { p_room_id: roomId, p_requester_seat: requesterSeat });
  if (error) throw error;
  return data; // fila de game_state
}
export async function mirenmeDejarDeVerA(roomId, requesterSeat) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("mirenme_unwatch", { p_room_id: roomId, p_requester_seat: requesterSeat });
  if (error) throw error;
  return data; // fila de game_state
}
