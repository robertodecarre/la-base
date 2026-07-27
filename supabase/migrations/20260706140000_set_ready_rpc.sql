-- La Base — reemplaza el arranque "cualquiera aprieta un botón único" por
-- un "listo" individual por jugador. Cuando la sala está completa y todos
-- los players.ready son true, el frontend (PantallaOnlineSala.jsx) dispara
-- repartirMano() sola por su cuenta — no hace falta ninguna RPC nueva de
-- "arrancar", deal_hand ya cubre eso (mismo patrón "ungated" que ya usa
-- el botón "Repartir mano" de la mano 2 en adelante: varias sesiones
-- pueden intentarlo a la vez, deal_hand solo deja efecto a la primera
-- porque exige rooms.status='waiting', el resto recibe room_not_open).
--
-- No hay reset de `ready` por desconexión/reconexión — el proyecto no
-- maneja reconexión todavía, así que no hay ningún flujo que reutilice un
-- `ready` viejo de forma incorrecta.

alter table players add column ready boolean not null default false;

-- ════════════════════════════════════════════════════════════
-- SET_READY — cada jugador marca/desmarca su propio "listo" en el lobby.
-- Sin gate de fase: una vez que existe game_state, PantallaOnlineSala.jsx
-- deja de mostrar este control (se muestra PantallaPartidaOnline en su
-- lugar), así que no hace falta que el servidor lo rechace explícitamente
-- después de arrancada la partida.
-- ════════════════════════════════════════════════════════════
create function set_ready(p_room_id uuid, p_ready boolean)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
  end if;

  update players
  set ready = p_ready
  where room_id = p_room_id and user_id = auth.uid()
  returning * into v_player;

  return v_player;
end;
$$;
