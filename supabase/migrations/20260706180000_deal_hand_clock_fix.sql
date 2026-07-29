-- La Base — piece C/D (batch overnight post-5r): "the clock is stuck at
-- 0:00". Root cause traced to a regression that predates this batch: deal_
-- hand's clock start/preserve logic — added correctly by
-- 20260706130000_clock_expired.sql (deal_hand starts the mano team's clock
-- window every hand: running = mano_seat % 2, running_since = now(), and
-- preserves the cumulative teamTime/expired across hands) — was silently
-- dropped two migrations later, in 20260706150000_sorteo_inicial_rpc.sql's
-- own CREATE OR REPLACE of deal_hand (which needed to add the sorteo-based
-- dealer_seat, but was written from an earlier, pre-clock copy of the
-- function body instead of the then-current one). Every deal_hand
-- replacement since — 20260706160000_choose_team_rpc.sql and
-- 20260706170000_deal_hand_sorteo_fix.sql, both from this same batch —
-- carried the already-broken body forward without noticing, since neither
-- was written with the clock code in view. Confirmed empirically: with a
-- clock-enabled room, deal_hand's game_state INSERT carried `clock: null`
-- over Realtime, so DisplayReloj's restante() always fell back to a base of
-- 0 with nothing running — the observed "stuck at 0:00", not a frontend
-- bug at all.
--
-- Same 150000 replacement ALSO silently dropped
-- `update players set tricks_won = 0 where room_id = p_room_id` (added by
-- 20260706070000_players_tricks_won.sql, preserved through 130000, lost at
-- 150000 same as the clock) — found while restoring the clock code back
-- into this function and worth fixing here rather than filing separately,
-- since it's the exact same missing hunk. Without it, tricks_won carries
-- over between hands, corrupting the "bases hechas" running total
-- (hechoTeam0/hechoTeam1 in PantallaPartidaOnline.jsx) from hand 2 onward —
-- a real scoring bug, not just cosmetic, that nothing in the existing
-- suite happened to catch (online-hand-refresh.spec.js only checks that
-- the next hand's cards aren't empty, never tricks_won).
--
-- This migration restores both, on top of everything 160000/170000 already
-- added (sorteo dealer_seat, seat-is-not-null readiness gate). Full body
-- repeated once more (CREATE OR REPLACE requires it) — this is now the
-- single source of truth for deal_hand; please diff against this version,
-- not an earlier migration, before touching it again.
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
  v_clock_enabled boolean;
  v_clock_seconds int;
  v_clock_insert jsonb;
  v_clock_update jsonb;
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
    if v_room.sorteo_inicial is not null and v_room.sorteo_inicial ? 'ganador_seat' then
      v_dealer_seat := (v_room.sorteo_inicial->>'ganador_seat')::int;
    else
      v_dealer_seat := floor(random() * v_n_jug)::int;
    end if;
    update rooms set status = 'playing' where id = p_room_id;
  else
    -- Mano siguiente: hand_number/dealer_seat ya los dejó close_hand al
    -- terminar la mano anterior.
    if v_gs.phase <> 'dealing' then
      raise exception 'not_dealing_phase';
    end if;
    v_hand_number := v_gs.hand_number;
    v_dealer_seat := v_gs.dealer_seat;
  end if;

  -- Runs for both branches above: first-hand players all start at 0 anyway
  -- (redundant but harmless there), next-hand players get their per-hand
  -- counter cleared. Restored — see migration header.
  update players set tricks_won = 0 where room_id = p_room_id;

  v_mano_seat := (v_dealer_seat + v_n_jug - 1) % v_n_jug;
  v_cards_dealt := (v_room.config->'estructura'->>v_hand_number)::int;

  -- jsonb_typeof(NULL) is SQL NULL, not false, when 'clock' is entirely
  -- absent from config (as opposed to present-but-JSON-null) — coalesce
  -- guarantees a real boolean here rather than a three-valued-logic trap.
  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  if v_clock_enabled then
    v_clock_seconds := coalesce((v_room.config->'clock'->>'minutos')::int, 0) * 60;
    -- First-hand path: always a fresh full budget.
    v_clock_insert := jsonb_build_object(
      'teamTime', jsonb_build_array(v_clock_seconds, v_clock_seconds),
      'running', v_mano_seat % 2,
      'running_since', now(),
      'expired', jsonb_build_array(false, false)
    );
    -- Next-hand path: preserve the cumulative budget/expired flags already
    -- on the row (v_gs, if found above), only restart the running window
    -- for this hand's mano team.
    v_clock_update := jsonb_build_object(
      'teamTime', coalesce(v_gs.clock->'teamTime', jsonb_build_array(v_clock_seconds, v_clock_seconds)),
      'running', v_mano_seat % 2,
      'running_since', now(),
      'expired', coalesce(v_gs.clock->'expired', jsonb_build_array(false, false))
    );
  else
    v_clock_insert := null;
    v_clock_update := null;
  end if;

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
    kamikazes_remaining, kamikaze_declared, pending_action, end_cause, clock
  ) values (
    p_room_id, v_hand_number, 'bidding', v_dealer_seat, v_mano_seat, v_mano_seat,
    0, null, jsonb_build_object('team0', null, 'team1', null), 1,
    coalesce((v_room.config->>'kamikazes')::int, 0), false, null, null, v_clock_insert
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
    clock = v_clock_update,
    updated_at = now()
  returning * into v_gs;

  return v_gs;
end;
$$;
