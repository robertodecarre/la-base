-- La Base — split "mano" into two columns: bid_mano_seat (frozen once per
-- hand, at deal_hand) vs. mano_seat (dynamic, follows whoever currently
-- leads/owns the next base — a normal trick win OR an As de Oros
-- transfer). Confirmed with Roberto: dealer rotation is pure seat order
-- and must never be affected by in-hand events; the kamikaze-loss
-- accountability at close_hand must stay with whoever actually made the
-- bid, not whoever ends up "mano" later via Oros; the visible MANO badge
-- (MesaCircular's manoIdx) is the one thing that's SUPPOSED to move,
-- every base, whether via a normal win or Oros.
--
-- Live-file audit before editing (multiple functions here were replaced
-- several times via CREATE OR REPLACE across migration history — editing
-- a superseded file would be a silent no-op):
--   deal_hand          -> 20260706200000_captain_dealer_gates.sql (last)
--   close_hand         -> 20260706290000_close_hand_dual_captain_confirm.sql (last)
--   resolve_resolving  -> 20260706240000_resolving_always_before_closing.sql (last)
--   resolve_oros_menu  -> 20260803010000_resolve_oros_menu_mano_seat.sql (last;
--                         already sets mano_seat = p_seat, i.e. job #3 —
--                         no change needed there, per spec)
--   revancha_partida   -> 20260706290000_close_hand_dual_captain_confirm.sql (last)
--
-- A second finding — resolve_trick's own handling of the hand's LAST base
-- needed the same mano_seat fix and was NOT covered by resolve_resolving
-- below — is a separate, later migration
-- (20260804010000_resolve_trick_last_base_mano_seat.sql), not folded in
-- here: this file was already pushed to the real Supabase project before
-- that gap was found, and migrations are append-only in this project
-- (never edit an already-applied file — see the deal_hand history warning
-- in project conventions) — see that file for the finding and the fix.
--
-- Discrepancy found while auditing (flagging rather than silently
-- "fixing" code that doesn't exist): the request describes close_hand as
-- seeding the next hand's dealer from `mano_seat`
-- (`if v_gs.mano_seat is not null then v_dealer_seat := v_gs.mano_seat`).
-- That pattern does NOT exist in close_hand's live body — only in
-- revancha_partida (both live in the same file, easy to conflate while
-- skimming). close_hand's actual next-hand dealer seed is unconditional
-- seat rotation (`dealer_seat = (v_gs.dealer_seat + 1) % v_n_jug`),
-- already completely unaffected by mano_seat/bid_mano_seat — so
-- close_hand below only needs the kamikaze-check line changed, not a
-- second "dealer seed" line that was never really there.

alter table game_state add column bid_mano_seat int;

-- ════════════════════════════════════════════════════════════
-- DEAL_HAND — full body repeated (CREATE OR REPLACE requires it), diffed
-- from 20260706200000_captain_dealer_gates.sql (the most recent prior
-- version). Only change: bid_mano_seat is set alongside mano_seat, both
-- to the same freshly-computed v_mano_seat — the two columns start every
-- hand identical, and only mano_seat is allowed to drift from there.
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
  v_player players;
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

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
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
    -- Ungated a propósito (ver comentario de esta migración) — el dealer
    -- de la mano 0 sale del sorteo, no de una rotación previa.
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
    -- terminar la mano anterior. Solo quien va a repartir (el asiento que
    -- la mesa ya etiqueta "PIE" para la mano que viene) puede disparar
    -- esto — piece E.
    if v_gs.phase <> 'dealing' then
      raise exception 'not_dealing_phase';
    end if;
    if v_player.seat <> v_gs.dealer_seat then
      raise exception 'deal_hand_dealer_only';
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

  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  if v_clock_enabled then
    v_clock_seconds := coalesce((v_room.config->'clock'->>'minutos')::int, 0) * 60;
    v_clock_insert := jsonb_build_object(
      'teamTime', jsonb_build_array(v_clock_seconds, v_clock_seconds),
      'running', v_mano_seat % 2,
      'running_since', now(),
      'expired', jsonb_build_array(false, false)
    );
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
    room_id, hand_number, phase, dealer_seat, mano_seat, bid_mano_seat, turn_seat,
    base_num, last_trick_winner_seat, bids, direction,
    kamikazes_remaining, kamikaze_declared, pending_action, end_cause, clock
  ) values (
    p_room_id, v_hand_number, 'bidding', v_dealer_seat, v_mano_seat, v_mano_seat, v_mano_seat,
    0, null, jsonb_build_object('team0', null, 'team1', null), 1,
    coalesce((v_room.config->>'kamikazes')::int, 0), false, null, null, v_clock_insert
  )
  on conflict (room_id) do update set
    hand_number = excluded.hand_number,
    phase = excluded.phase,
    dealer_seat = excluded.dealer_seat,
    mano_seat = excluded.mano_seat,
    bid_mano_seat = excluded.bid_mano_seat,
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

-- ════════════════════════════════════════════════════════════
-- RESOLVE_RESOLVING — full body repeated, diffed from
-- 20260706240000_resolving_always_before_closing.sql. Only change: also
-- sets mano_seat = last_trick_winner_seat, so mano tracks the winner on
-- EVERY base close (not just via As de Oros, which already set it in
-- resolve_oros_menu — that RPC's own mano_seat write is untouched by this
-- migration). bid_mano_seat is never touched here — it stays frozen for
-- the whole hand, only deal_hand ever sets it.
-- ════════════════════════════════════════════════════════════
create or replace function resolve_resolving(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_room rooms;
  v_total_bases int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'resolving' then
    raise exception 'not_resolving_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  if v_player.seat <> v_gs.last_trick_winner_seat then
    raise exception 'not_trick_winner';
  end if;

  select * into v_room from rooms where id = p_room_id;
  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;

  update game_state
  set
    turn_seat = v_gs.last_trick_winner_seat,
    -- Whoever just won the base becomes mano for whatever comes next —
    -- same rule whether this base's winner got there by a normal trick
    -- or (impossible to reach both ways in the same base, but stated for
    -- clarity) had already been reassigned by As de Oros earlier in the
    -- hand; this is simply "the current base's winner is the new mano",
    -- unconditionally.
    mano_seat = v_gs.last_trick_winner_seat,
    phase = case when v_gs.base_num >= v_total_bases then 'closing' else 'playing' end,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- CLOSE_HAND — full body repeated, diffed from
-- 20260706290000_close_hand_dual_captain_confirm.sql. Only change: the
-- kamikaze-loss check now reads bid_mano_seat (who actually made the
-- pedido/could have declared kamikaze) instead of mano_seat (who's
-- currently mano, which may have drifted via Oros or a mid-hand base
-- win). No "next-hand dealer seed from mano_seat" line exists in this
-- function to change — see the discrepancy note at the top of this file;
-- close_hand's dealer rotation (`dealer_seat = (v_gs.dealer_seat + 1) %
-- v_n_jug`, below, unchanged) was already independent of mano_seat.
-- ════════════════════════════════════════════════════════════
create or replace function close_hand(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
  v_player players;
  v_n_jug int;
  v_total_bases int;
  v_estructura_len int;
  v_ped_team0 int;
  v_ped_team1 int;
  v_hecho_team0 int;
  v_hecho_team1 int;
  v_delta_team0 int;
  v_delta_team1 int;
  v_mano_team smallint;
  v_delta_mano int;
  v_no_declarado boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if not v_player.is_captain then
    raise exception 'close_hand_captain_only';
  end if;

  -- Locking convention (per deal_hand): rooms before game_state, since
  -- this RPC, like deal_hand, may update both.
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'closing' then
    raise exception 'not_closing_phase';
  end if;

  -- Piece LL: mark ONLY the calling captain's own team as confirmed, then
  -- bail out (still phase='closing') unless the OTHER team already
  -- confirmed too.
  if v_player.team = 0 then
    update game_state set close_hand_confirmed_team0 = true, updated_at = now()
      where room_id = p_room_id returning * into v_gs;
  else
    update game_state set close_hand_confirmed_team1 = true, updated_at = now()
      where room_id = p_room_id returning * into v_gs;
  end if;

  if not (v_gs.close_hand_confirmed_team0 and v_gs.close_hand_confirmed_team1) then
    return v_gs;
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;
  v_estructura_len := jsonb_array_length(v_room.config->'estructura');

  v_ped_team0 := (v_gs.bids->>'team0')::int;
  v_ped_team1 := (v_gs.bids->>'team1')::int;

  select
    coalesce(sum(tricks_won) filter (where team = 0), 0),
    coalesce(sum(tricks_won) filter (where team = 1), 0)
    into v_hecho_team0, v_hecho_team1
    from players where room_id = p_room_id;

  if v_hecho_team0 = v_ped_team0 and v_hecho_team1 <> v_ped_team1 then
    v_delta_team0 := 10 + v_hecho_team0;
    v_delta_team1 := -abs(v_hecho_team1 - v_ped_team1);
  elsif v_hecho_team1 = v_ped_team1 and v_hecho_team0 <> v_ped_team0 then
    v_delta_team0 := -abs(v_hecho_team0 - v_ped_team0);
    v_delta_team1 := 10 + v_hecho_team1;
  else
    v_delta_team0 := -abs(v_hecho_team0 - v_ped_team0);
    v_delta_team1 := -abs(v_hecho_team1 - v_ped_team1);
  end if;

  insert into hand_results (
    room_id, hand_number, cards_dealt, bid_team0, bid_team1, tricks_team0, tricks_team1, delta_team0, delta_team1
  ) values (
    p_room_id, v_gs.hand_number, v_total_bases, v_ped_team0, v_ped_team1, v_hecho_team0, v_hecho_team1, v_delta_team0, v_delta_team1
  );

  -- Changed: bid_mano_seat (frozen at deal_hand), not mano_seat (may have
  -- drifted mid-hand via a base win or As de Oros) — the kamikaze-loss
  -- rule blames whoever actually made the pedido/could have declared
  -- kamikaze, not whoever happens to hold mano when the hand ends.
  v_mano_team := v_gs.bid_mano_seat % 2;
  v_delta_mano := case when v_mano_team = 0 then v_delta_team0 else v_delta_team1 end;
  v_no_declarado := (not v_gs.kamikaze_declared) and v_delta_mano <= -2;

  if v_no_declarado then
    update rooms set status = 'finished' where id = p_room_id;
    update game_state
    set phase = 'finished', end_cause = 'kamikaze', pending_action = null,
        close_hand_confirmed_team0 = false, close_hand_confirmed_team1 = false, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  elsif v_gs.hand_number + 1 >= v_estructura_len then
    update rooms set status = 'finished' where id = p_room_id;
    update game_state
    set phase = 'finished', end_cause = 'normal', pending_action = null,
        close_hand_confirmed_team0 = false, close_hand_confirmed_team1 = false, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      hand_number = v_gs.hand_number + 1,
      dealer_seat = (v_gs.dealer_seat + 1) % v_n_jug,
      phase = 'dealing',
      close_hand_confirmed_team0 = false, close_hand_confirmed_team1 = false,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- REVANCHA_PARTIDA — full body repeated, diffed from
-- 20260706290000_close_hand_dual_captain_confirm.sql. Only change: the
-- rematch's first dealer is seeded from bid_mano_seat (the last hand's
-- ORIGINAL bidding-time mano, i.e. plain seat rotation from that hand's
-- own dealer) instead of mano_seat (which may have ended the last hand
-- pointing at whoever most recently won a base/used Oros).
-- ════════════════════════════════════════════════════════════
create or replace function revancha_partida(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
  v_dealer_seat int;
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

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'finished' then
    raise exception 'not_finished_phase';
  end if;

  delete from played_cards where room_id = p_room_id;
  delete from hand_results where room_id = p_room_id;
  update players set tricks_won = 0 where room_id = p_room_id;

  if v_gs.bid_mano_seat is not null then
    v_dealer_seat := v_gs.bid_mano_seat;
  elsif v_room.sorteo_inicial is not null and v_room.sorteo_inicial ? 'ganador_seat' then
    v_dealer_seat := (v_room.sorteo_inicial->>'ganador_seat')::int;
  else
    v_dealer_seat := 0;
  end if;

  update rooms set status = 'playing' where id = p_room_id;

  update game_state
  set
    hand_number = 0,
    phase = 'dealing',
    dealer_seat = v_dealer_seat,
    mano_seat = v_dealer_seat,
    bid_mano_seat = v_dealer_seat,
    turn_seat = v_dealer_seat,
    base_num = 0,
    last_trick_winner_seat = null,
    bids = null,
    direction = 1,
    kamikazes_remaining = coalesce((v_room.config->>'kamikazes')::int, 0),
    kamikaze_declared = false,
    pending_action = null,
    clock = null,
    end_cause = null,
    close_hand_confirmed_team0 = false,
    close_hand_confirmed_team1 = false,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
