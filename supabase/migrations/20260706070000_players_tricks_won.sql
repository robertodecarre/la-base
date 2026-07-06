-- La Base — phase B, piece 4b prerequisite: per-player trick-win counter.
--
-- Nothing currently persists "how many tricks has this player won this
-- hand" — hand_results is a per-hand aggregate (tricks_team0/1), and
-- game_state.last_trick_winner_seat only ever holds the single most recent
-- winner. resolverBase's evarluarCierreMano (a later piece) needs a
-- per-player running count to sum into hechoN/hechoE at hand-close.
--
-- Named `tricks_won`, not `bases`, deliberately: `players.bases` sitting
-- next to `game_state.base_num` (the current trick INDEX, unrelated
-- concept) invites misreading one for the other. `tricks_won` also matches
-- the vocabulary hand_results already established (tricks_team0/1).
alter table players add column tricks_won int not null default 0;

-- Reset happens once, in the code both the first-hand and next-hand
-- branches already funnel into below (right after v_hand_number/
-- v_dealer_seat are resolved, before the per-seat dealing loop) — so it
-- applies regardless of which branch a given call took. Full function body
-- repeated (CREATE OR REPLACE requires it); the only change from the
-- piece-3 version is the `update players set tricks_won = 0 ...` line.
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

  -- Runs for both branches above: first-hand players all start at 0 anyway
  -- (redundant but harmless there), next-hand players get their per-hand
  -- counter cleared.
  update players set tricks_won = 0 where room_id = p_room_id;

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
