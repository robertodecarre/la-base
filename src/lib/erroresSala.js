// Traduce los errores que puede tirar create-room/join-room (edge
// functions) y deal_hand (RPC directa) a mensajes en español para mostrar
// en pantalla. Solo cubre los códigos que esas llamadas pueden emitir
// realmente — el resto de STATUS_POR_ERROR (supabase/functions/_shared/
// errors.ts) es de RPCs de juego que todavía no tienen UI (piezas 5d+).
const MENSAJES = {
  not_authenticated: "No se pudo verificar tu sesión. Probá de nuevo en unos segundos.",
  invalid_config: "La configuración de la sala no es válida.",
  invalid_name: "El nombre tiene que tener entre 1 y 20 caracteres.",
  room_not_found: "No existe ninguna sala con ese código.",
  room_not_open: "Esa sala ya empezó a jugar o ya terminó.",
  room_full: "Esa sala ya está completa.",
  could_not_allocate_code: "No se pudo crear la sala, intentá de nuevo.",
  // deal_hand (llamada directa vía supabase.rpc, no edge function)
  not_room_member: "No formás parte de esta sala.",
  room_not_full: "Todavía faltan jugadores para poder empezar.",
  not_enough_cards: "No hay suficientes cartas para esta configuración.",
};

// Dos formas de error posibles acá, con dos formas distintas de sacarles
// el código real:
// - supabase.functions.invoke() (create-room, join-room) no entrega el
//   mensaje real (p.ej. "room_full") en error.message — eso queda en el
//   cuerpo JSON de la respuesta, accesible solo vía error.context (la
//   Response cruda) y solo cuando el error es un FunctionsHttpError (una
//   respuesta no-2xx real, a diferencia de un FunctionsFetchError por
//   falla de red, que no tiene cuerpo que leer).
// - supabase.rpc() (deal_hand) no pasa por ninguna Edge Function — el
//   error que tira supabase-js ya es un PostgrestError cuyo .message ES
//   directamente el texto del `raise exception` de Postgres (p.ej.
//   "room_not_full"), sin nada que desempaquetar. Por eso alcanza con
//   dejar `codigo` en su valor por defecto (error.message) para ese caso.
export async function mensajeDeError(error) {
  let codigo = error?.message;
  if (error?.name === "FunctionsHttpError" && error?.context?.json) {
    try {
      const cuerpo = await error.context.json();
      if (cuerpo?.error) codigo = cuerpo.error;
    } catch {
      // La respuesta no era JSON — se usa error.message tal cual.
    }
  }
  return MENSAJES[codigo] ?? `Ocurrió un error inesperado (${codigo ?? "desconocido"}).`;
}
