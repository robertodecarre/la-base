-- La Base — team selection (piece 5r): players now choose LOCAL or
-- VISITANTE explicitly, instead of team being auto-derived from join order
-- (seat % 2). join_room now only reserves a room slot (seat/team left
-- null); choose_team is the only place a seat is ever assigned, and it
-- deliberately keeps the seat%2==team invariant every rule RPC already
-- assumes (submit_bid/close_hand/clock_expired all derive "team mano" from
-- mano_seat % 2, not from players.team — see those files) by making LOCAL
-- (team=0) always land on even seats and VISITANTE (team=1) on odd seats,
-- in join-within-team order. That's what lets this migration avoid
-- touching any of those rule RPCs.
--
-- Concurrency: two sessions calling choose_team for the same room at the
-- same time must not both compute is_captain=true, or both slip past the
-- team_full check on a stale count. choose_team locks the room's `rooms`
-- row FOR UPDATE for the whole transaction (same convention join_room and
-- deal_hand already use to serialize per-room actions — see deal_hand's
-- locking-convention comment) before counting, so the count-then-assign
-- below is never raced — unlike sortear_reparto_inicial, where "first
-- write wins" is fine because the race has no wrong outcome, only a
-- redundant one.

alter table players alter column seat drop not null;
alter table players alter column team drop not null;

-- ════════════════════════════════════════════════════════════
-- JOIN ROOM — replaces the join_room_captain_fix version: no longer
-- assigns seat/team (that now happens in choose_team). Only reserves the
-- room's headcount, same room_full check as before (row count, unaffected
-- by seat/team being null).
-- ════════════════════════════════════════════════════════════
create or replace function join_room(p_code text, p_name text)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_existing players;
  v_count int;
  v_n_jug int;
  v_name text;
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_name := trim(p_name);
  if v_name = '' or char_length(v_name) > 20 then
    raise exception 'invalid_name';
  end if;

  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
  end if;

  select * into v_existing from players where room_id = v_room.id and user_id = auth.uid();
  if found then
    return v_existing;
  end if;

  select count(*) into v_count from players where room_id = v_room.id;
  v_n_jug := (v_room.config->>'nJug')::int;
  if v_count >= v_n_jug then
    raise exception 'room_full';
  end if;

  insert into players (room_id, user_id, seat, team, name, is_captain)
  values (v_room.id, auth.uid(), null, null, v_name, false)
  returning * into v_player;

  return v_player;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- CHOOSE TEAM — LOCAL (p_team=0) / VISITANTE (p_team=1), fijo (no relativo
-- a quien mira). Asigna el próximo asiento de esa paridad y, si es el
-- primero de ese equipo en la sala, lo hace capitán.
-- ════════════════════════════════════════════════════════════
create function choose_team(p_room_id uuid, p_team smallint)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
  v_n_jug int;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_team is null or p_team not in (0, 1) then
    raise exception 'invalid_team';
  end if;

  -- Bloquea la fila de la sala: serializa choose_team concurrentes para la
  -- misma sala, para que el count()+asignación de abajo no se pise entre
  -- dos sesiones eligiendo el mismo equipo a la vez (dos capitanes, o un
  -- team_full que no llega a frenar a tiempo).
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if v_player.team is not null then
    raise exception 'already_chose_team';
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  select count(*) into v_count from players where room_id = p_room_id and team = p_team;
  if v_count >= v_n_jug / 2 then
    raise exception 'team_full';
  end if;

  update players
  set team = p_team,
      seat = 2 * v_count + p_team,
      is_captain = (v_count = 0)
  where id = v_player.id
  returning * into v_player;

  return v_player;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- DEAL HAND — repetido entero (CREATE OR REPLACE lo exige). Única
-- diferencia con la versión anterior: "sala llena" ahora exige que las
-- v_n_jug filas tengan seat asignado, no solo que existan — con el equipo
-- elegido a mano, una fila puede existir (join_room ya reservó el cupo)
-- con seat todavía null mientras esa sesión sigue en la pantalla de
-- selección de equipo. Sin este chequeo, el loop `for v_seat in 0..v_n_jug-1`
-- de más abajo repartiría manos vacías para los asientos todavía sin
-- dueño.
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
    select count(*) into v_player_count from players where room_id = p_room_id and seat is not null;
    if v_player_count <> v_n_jug then
      raise exception 'room_not_full';
    end if;
    v_hand_number := 0;
    v_dealer_seat := floor(random() * v_n_jug)::int;
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
