import { supabase, asegurarSesion } from "./supabase";

// Sortea quién reparte primero (una carta al azar por asiento, gana la
// jerarquía más alta — mismo criterio que src/engine/hierarchy.js). First-
// call-wins igual que deal_hand/set_ready: si rooms.sorteo_inicial ya
// estaba seteado, esta llamada es un no-op que devuelve la fila tal cual
// (no pisa un sorteo ya hecho), así que no hace falta coordinar entre las
// sesiones que lo disparan a la vez.
export async function sortearRepartoInicial(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("sortear_reparto_inicial", { p_room_id: roomId });
  if (error) throw error;
  return data; // fila de rooms
}

// Piece H (batch overnight post-5r): marca que la propia sesión ya dio
// vuelta su carta del sorteo — el asiento sale de la propia fila de
// players server-side, no de un parámetro (estructuralmente imposible
// marcar el flip de otro). Idempotente: llamarla de nuevo con el propio
// asiento ya marcado no rompe nada.
export async function marcarFlipSorteo(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("marcar_flip_sorteo", { p_room_id: roomId });
  if (error) throw error;
  return data; // fila de rooms
}

// Piece R (batch overnight post-5r): marca que la propia sesión confirmó
// "ARRANCAMOS" — igual que marcarFlipSorteo, el asiento sale de la propia
// fila de players server-side. Solo una vez que los nJug asientos
// confirmaron, PantallaOnlineSala.jsx dispara repartirMano().
export async function marcarArrancamosSorteo(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("marcar_arrancamos_sorteo", { p_room_id: roomId });
  if (error) throw error;
  return data; // fila de rooms
}

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

// Solo válido para quien tiró el As de Oros (game_state.pending_action.
// carrier_seat) mientras la sala está en fase oros_menu. seat: asiento de
// cualquier jugador del equipo ganador (pending_action.team), incluido el
// propio portador, que abrirá la siguiente base. A diferencia de
// resolverCopas, la base ya quedó resuelta antes de entrar a este menú
// (oros_menu solo se entra después de que resolve_trick corrió), así que
// esta llamada no dispara ninguna resolución de ganador.
export async function resolverOros(roomId, seat) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("resolve_oros_menu", {
    p_room_id: roomId,
    p_seat: seat,
  });
  if (error) throw error;
  return data; // fila de game_state
}

// Solo válido para quien ganó la base recién completada (game_state.
// last_trick_winner_seat) mientras la sala está en fase 'resolving' (base
// completada sin trigger de As de Copas ni de As de Oros). No hay ninguna
// decisión que tomar — solo confirma el avance a la siguiente base,
// abriendo con el ganador — mismo botón "SIGUIENTE BASE →" que tenía el
// hotseat (borrado en piece 5q).
export async function siguienteBase(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("resolve_resolving", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data; // fila de game_state
}

// Válido para cualquier miembro de la sala (sin restricción de capitán ni
// ganador — igual que el botón "CERRAR MANO" offline) mientras la sala
// está en fase 'closing'. Calcula el puntaje de la mano, inserta la fila
// en hand_results y, según el resultado, termina la partida
// (phase='finished') o deja la sala en 'dealing' lista para el próximo
// repartirMano.
export async function cerrarMano(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("close_hand", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data; // fila de game_state
}

// Válido para cualquier miembro de la sala, en fase 'bidding', mientras la
// sala tenga reloj activado en modo "muerte" y el tiempo del equipo que le
// toca pedir ya se haya agotado (el chequeo lo hace el servidor al
// momento de la llamada, no un proceso en segundo plano — cualquier
// jugador que note que el reloj llegó a cero puede reclamarlo). Si no
// llegó a cero todavía, la llamada falla con 'not_expired_yet'. El equipo
// cuyo reloj corría pierde la partida (phase='finished',
// end_cause='clock_expired'); en modo "deportivo" esta RPC no aplica —
// ese modo es puro ritmo de cliente, sin consecuencia server-side.
export async function reclamarTiempo(roomId) {
  await asegurarSesion();
  const { data, error } = await supabase.rpc("claim_timeout", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data; // fila de game_state
}
