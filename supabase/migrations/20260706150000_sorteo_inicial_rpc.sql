-- La Base — sorteo inicial online (piece 5l).
--
-- Hasta ahora deal_hand elegía quién reparte primero con un floor(random())
-- silencioso apenas la sala quedaba lista — a diferencia de PantallaSorteo.jsx
-- (hotseat), los jugadores online nunca veían ese sorteo. Se separa en dos
-- pasos: primero esta RPC hace el sorteo real (una carta al azar por
-- asiento, gana la jerarquía más alta) y lo deja en rooms.sorteo_inicial;
-- el frontend lo muestra unos segundos y recién después llama a deal_hand,
-- que ahora usa ese resultado como dealer_seat en vez de tirar su propio
-- azar para la mano 0.
--
-- sorteo_inicial: { cartas: [{seat, carta}, ...], ganador_seat: int }

alter table rooms add column sorteo_inicial jsonb;

-- ════════════════════════════════════════════════════════════
-- SORTEAR_REPARTO_INICIAL — sortea una carta por asiento y determina quién
-- reparte primero. First-call-wins igual que deal_hand/set_ready: si
-- sorteo_inicial ya está seteado, esta llamada es un no-op que devuelve la
-- fila tal cual está (no pisa un sorteo ya hecho) — así, cuando las 4
-- sesiones disparan esta RPC a la vez apenas todosListos, solo el primer
-- intento que llega tiene efecto real y el resto ve el mismo resultado ya
-- calculado.
-- ════════════════════════════════════════════════════════════
create function sortear_reparto_inicial(p_room_id uuid)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_n_jug int;
  v_dos_mazos boolean;
  v_cartas jsonb;
  v_ganador_seat int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  if v_room.sorteo_inicial is not null then
    return v_room;
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_dos_mazos := coalesce((v_room.config->>'dosMazos')::boolean, false);

  -- Mismo mazo que deal_hand (ver 20260706020000_deal_hand_rpc.sql):
  -- construirlo completo y barajarlo con order by random(), aunque acá
  -- solo se usan las primeras v_n_jug cartas del barajo, una por asiento.
  with palos(n, e, col) as (
    values
      ('Oros', '🟡', '#8B6914'),
      ('Copas', '🏆', '#c0392b'),
      ('Espadas', '⚔️', '#1a1a2e'),
      ('Bastos', '🪵', '#2d4a1e')
  ),
  valores1 as (select unnest(array[1,2,3,4,5,6,7,10,11,12]) as v),
  valores2 as (select unnest(array[2,3,4,5,6,7,10,11,12]) as v),
  mazo1 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 1
    ) as carta
    from palos p cross join valores1 v
  ),
  mazo2 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 2
    ) as carta
    from palos p cross join valores2 v
  ),
  todas as (
    select carta from mazo1
    union all
    select carta from mazo2 where v_dos_mazos
  ),
  barajado as (
    select carta, (row_number() over (order by random()) - 1) as seat
    from todas
  ),
  sorteo as (
    select seat, carta,
      -- misma jerarquía que src/engine/hierarchy.js: As de Bastos > todo,
      -- el resto ordena por valor.
      case when (carta->>'valor')::int = 1 and carta->'palo'->>'n' = 'Bastos'
        then 100 else (carta->>'valor')::int end as jer
    from barajado
    where seat < v_n_jug
  )
  select
    jsonb_agg(jsonb_build_object('seat', seat, 'carta', carta) order by seat),
    -- empate de jerarquía: gana el asiento más bajo, igual que el
    -- `if (j>maxJ)` estricto de PantallaSorteo.jsx (primer máximo en orden
    -- de escaneo 0..n-1 se queda con la posta).
    (array_agg(seat order by jer desc, seat asc))[1]
  into v_cartas, v_ganador_seat
  from sorteo;

  update rooms
  set sorteo_inicial = jsonb_build_object('cartas', v_cartas, 'ganador_seat', v_ganador_seat)
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- DEAL_HAND — para la mano 0, usa rooms.sorteo_inicial.ganador_seat como
-- dealer_seat en vez de tirar su propio floor(random()). El fallback
-- aleatorio queda solo por las dudas (defensivo: en el flujo normal
-- sortear_reparto_inicial ya corrió antes de que el frontend llame acá).
-- Cuerpo completo repetido porque CREATE OR REPLACE lo exige — el único
-- cambio real es la asignación de v_dealer_seat en la rama "primera mano".
-- ════════════════════════════════════════════════════════════
create or replace function deal_hand(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
  v_n_jug int;
  v_dos_mazos boolean;
  v_hand_number int;
  v_dealer_seat int;
  v_mano_seat int;
  v_cards_dealt int;
  v_mazo jsonb;
  v_seat int;
  v_hand jsonb;
  v_player_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_dos_mazos := coalesce((v_room.config->>'dosMazos')::boolean, false);

  select * into v_gs from game_state where room_id = p_room_id for update;

  if not found then
    -- Primera mano de la partida: todavía no hay fila en game_state.
    if v_room.status <> 'waiting' then
      raise exception 'room_not_open';
    end if;
    select count(*) into v_player_count from players where room_id = p_room_id;
    if v_player_count <> v_n_jug then
      raise exception 'room_not_full';
    end if;
    v_hand_number := 0;
    if v_room.sorteo_inicial is not null and v_room.sorteo_inicial ? 'ganador_seat' then
      v_dealer_seat := (v_room.sorteo_inicial->>'ganador_seat')::int;
    else
      v_dealer_seat := floor(random() * v_n_jug)::int;
    end if;
    update rooms set status = 'playing' where id = p_room_id;
  else
    -- Mano siguiente: hand_number/dealer_seat ya los dejó close_hand (fase
    -- futura, todavía no construida) al terminar la mano anterior.
    if v_gs.phase <> 'dealing' then
      raise exception 'not_dealing_phase';
    end if;
    v_hand_number := v_gs.hand_number;
    v_dealer_seat := v_gs.dealer_seat;
  end if;

  v_mano_seat := (v_dealer_seat + v_n_jug - 1) % v_n_jug;
  v_cards_dealt := (v_room.config->'estructura'->>v_hand_number)::int;

  with palos(n, e, col) as (
    values
      ('Oros', '🟡', '#8B6914'),
      ('Copas', '🏆', '#c0392b'),
      ('Espadas', '⚔️', '#1a1a2e'),
      ('Bastos', '🪵', '#2d4a1e')
  ),
  valores1 as (select unnest(array[1,2,3,4,5,6,7,10,11,12]) as v),
  valores2 as (select unnest(array[2,3,4,5,6,7,10,11,12]) as v),
  mazo1 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 1
    ) as carta
    from palos p cross join valores1 v
  ),
  mazo2 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 2
    ) as carta
    from palos p cross join valores2 v
  ),
  todas as (
    select carta from mazo1
    union all
    select carta from mazo2 where v_dos_mazos
  ),
  numeradas as (
    select (row_number() over () - 1) as uid, carta from todas
  )
  select jsonb_agg(jsonb_set(carta, '{uid}', to_jsonb(uid)) order by random())
  into v_mazo
  from numeradas;

  if v_cards_dealt * v_n_jug > jsonb_array_length(v_mazo) then
    raise exception 'not_enough_cards';
  end if;

  for v_seat in 0 .. v_n_jug - 1 loop
    select jsonb_agg(elem) into v_hand
    from jsonb_array_elements(v_mazo) with ordinality as t(elem, ord)
    where ord > v_seat * v_cards_dealt and ord <= (v_seat + 1) * v_cards_dealt;

    insert into hands (room_id, player_id, user_id, hand_number, cards)
    select v_room.id, p.id, p.user_id, v_hand_number, coalesce(v_hand, '[]'::jsonb)
    from players p where p.room_id = v_room.id and p.seat = v_seat
    on conflict (room_id, player_id, hand_number) do update set cards = excluded.cards;
  end loop;

  insert into game_state (
    room_id, hand_number, phase, dealer_seat, mano_seat, turn_seat,
    base_num, last_trick_winner_seat, bids, direction,
    kamikazes_remaining, kamikaze_declared, pending_action, end_cause
  ) values (
    p_room_id, v_hand_number, 'bidding', v_dealer_seat, v_mano_seat, v_mano_seat,
    0, null, jsonb_build_object('team0', null, 'team1', null), 1,
    coalesce((v_room.config->>'kamikazes')::int, 0), false, null, null
  )
  on conflict (room_id) do update set
    hand_number = excluded.hand_number,
    phase = excluded.phase,
    dealer_seat = excluded.dealer_seat,
    mano_seat = excluded.mano_seat,
    turn_seat = excluded.turn_seat,
    base_num = 0,
    last_trick_winner_seat = null,
    bids = jsonb_build_object('team0', null, 'team1', null),
    direction = 1,
    kamikaze_declared = false,
    pending_action = null,
    end_cause = null,
    updated_at = now()
  returning * into v_gs;

  return v_gs;
end;
$$;
