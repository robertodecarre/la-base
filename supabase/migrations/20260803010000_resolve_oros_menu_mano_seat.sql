-- La Base — batch fix #4 (post-pieza-J): As de Oros no movía mano_seat.
--
-- resolve_oros_menu (20260706100000_resolve_oros_menu.sql) ya validaba y
-- ponía turn_seat = p_seat, así que el asiento elegido SÍ abría la
-- próxima base — pero mano_seat (columna aparte, la que alimenta la
-- insignia "MANO" en MesaCircular vía manoIdx={gameState.mano_seat}, y la
-- que submit_bid/close_hand leen como "team mano") se quedaba en el valor
-- que deal_hand le puso al repartir. El resultado visible: usar el poder
-- se sentía como que "no hacía nada", aunque el orden de turno de esa
-- base sí era el correcto.
--
-- Repetido entero (CREATE OR REPLACE lo exige) — único cambio real:
-- mano_seat = p_seat junto al turn_seat = p_seat existente.
--
-- Efecto secundario evaluado a propósito, no un descuido: "team mano" en
-- close_hand (v_mano_team := v_gs.mano_seat % 2, usado para el chequeo de
-- kamikaze-no-declarado) y en revancha_partida (semilla del dealer_seat
-- de la revancha) ahora puede reflejar el equipo AL QUE SE LE TRANSFIRIÓ
-- la mano vía Oros, no necesariamente el que era mano al momento de
-- pedir/declarar kamikaze — ninguna de esas dos RPCs necesita cambio de
-- código (ya leen game_state.mano_seat fresco), pero SU RESULTADO cambia
-- de significado: "team mano" pasa a ser "quien tiene la mano ahora
-- mismo" en vez de "quien la tenía al repartir", de forma consistente en
-- todo el esquema. Se documenta como juicio deliberado (ver el mensaje al
-- usuario que acompaña este batch) en vez de agregar una columna nueva
-- para congelar el mano original — eso sería una regla de juego nueva sin
-- pedido explícito.
create or replace function resolve_oros_menu(p_room_id uuid, p_seat int)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_carrier_seat int;
  v_team smallint;
  v_chosen players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'oros_menu' then
    raise exception 'not_oros_menu_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  v_carrier_seat := (v_gs.pending_action->>'carrier_seat')::int;
  if v_player.seat <> v_carrier_seat then
    raise exception 'not_oros_carrier';
  end if;

  v_team := (v_gs.pending_action->>'team')::smallint;

  select * into v_chosen from players where room_id = p_room_id and seat = p_seat;
  if not found then
    raise exception 'invalid_seat';
  end if;
  if v_chosen.team <> v_team then
    raise exception 'seat_not_on_winning_team';
  end if;

  update game_state
  set
    turn_seat = p_seat,
    mano_seat = p_seat,
    phase = 'playing',
    pending_action = null,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
