-- La Base — phase B, piece 4g: clock_expired.
--
-- Last of the dead-end phases: game_state.clock was scaffolded (comment
-- only) since the phase-A schema but never written to by any RPC, and
-- 'clock_expired' was in the phase enum but unreachable. Confirmed by
-- reading deal_hand/submit_bid directly: neither touches `clock` at all.
--
-- Client-driven claim model (chess-clock "flag must be claimed" pattern),
-- not server-scheduled: nothing here polls or runs on a timer. The clock
-- shape gets a `running_since` timestamp added to the schema comment's
-- original { teamTime, running, expired, slowMode } —`slowMode` is
-- dropped as persisted state, since it's fully derivable client-side from
-- expired + rooms.config.clock.modo, matching how the rest of the schema
-- avoids storing computed values:
--   { teamTime: [n0,n1], running: 0|1|null, running_since: iso|null, expired: [bool,bool] }
-- A team's deadline is always computable on demand:
--   teamTime[running] - (running_since ? now()-running_since : 0) <= 0
--
-- Only the bidding phase ever runs the clock (mirrors useClock.js: started
-- by repartirMano/deal_hand, stopped by confirmarPedidos once both bids
-- land — never during play, menus, or hand-close). "Deportivo" mode needs
-- no new RPC: it's pure client pacing UX (local 10s auto-confirm) that
-- any future client can derive from `expired` + config.clock.modo — only
-- the clock STATE needs to be correct, not a throttling rule enforced
-- here. Only "muerte" mode has a hard, server-authoritative consequence,
-- which is what claim_timeout applies.
--
-- rooms.config->'clock' is either absent/JSON-null (no clock) or
-- { habilitado: true, minutos, modo: 'muerte'|'deportivo' } (per
-- supabase/functions/_shared/validateConfig.ts). Enabled-check is
-- jsonb_typeof(...) = 'object', which correctly treats both "key absent"
-- and "key present but JSON null" as disabled with no special-casing —
-- and, not incidentally, means every existing room config from the
-- 4c/4d/4e/4f verification scripts (which never set `clock` at all)
-- leaves v_clock_enabled false and this piece's changes a no-op for them.
--
-- deal_hand: starts the mano team's window every hand (running =
-- mano_seat % 2, running_since = now()). teamTime/expired are preserved
-- across hands by reading the existing row's values in the ON CONFLICT
-- path (only a fresh full-budget init on the true first insert) — same
-- carve-out deal_hand already gives kamikazes_remaining, a whole-match
-- budget that isn't reset per hand either.
--
-- submit_bid: right before its existing final update, if the clock is
-- enabled and currently running for the team whose bid this is, deducts
-- real elapsed seconds from their teamTime (clamped >=0, sets expired).
-- Then: if this was mano's bid, starts pie's window only if pie actually
-- has more than one legal value (the same 2-line opcionesValidas formula
-- already informally duplicated in this function's own bid validation,
-- per its original piece-2 comment) — mirrors PantallaPartida.jsx's
-- confirmarMano, which never shows pie a timed decision when their value
-- is forced. If this was pie's (the final) bid, leaves running/
-- running_since null: bidding is over, nothing left to time.
--
-- game_state.end_cause's check constraint only allowed ('normal',
-- 'kamikaze') — widened below to add 'clock_expired'.
--
-- claim_timeout: only valid in 'bidding' phase, only for modo='muerte'
-- rooms (deportivo has no loss consequence to apply — this is the one
-- place that boundary is enforced). Computes the deadline live; if
-- expired, ends the match (phase='finished', end_cause='clock_expired',
-- rooms.status='finished'). Deliberately does NOT touch the `clock`
-- column on success — leaving it frozen with running still pointing at
-- the losing team is the entire "who lost" record, no new column needed,
-- same derivability pattern close_hand already established for the
-- kamikaze ending (there: frozen mano_seat; here: frozen clock.running).
-- Bids submitted after a deadline passes but before anyone calls this are
-- still accepted — submit_bid has no expiry guard of its own, matching
-- the "claim" framing (any player who notices can call this) rather than
-- an automatic cutoff.

alter table game_state drop constraint game_state_end_cause_check;
alter table game_state add constraint game_state_end_cause_check
  check (end_cause in ('normal', 'kamikaze', 'clock_expired'));

-- ════════════════════════════════════════════════════════════
-- DEAL_HAND — adds clock start/preserve. Full function body repeated
-- (CREATE OR REPLACE requires it); all non-clock behavior unchanged.
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
    select count(*) into v_player_count from players where room_id = p_room_id;
    if v_player_count <> v_n_jug then
      raise exception 'room_not_full';
    end if;
    v_hand_number := 0;
    v_dealer_seat := floor(random() * v_n_jug)::int;
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
  -- counter cleared.
  update players set tricks_won = 0 where room_id = p_room_id;

  v_mano_seat := (v_dealer_seat + v_n_jug - 1) % v_n_jug;
  v_cards_dealt := (v_room.config->'estructura'->>v_hand_number)::int;

  -- jsonb_typeof(NULL) is SQL NULL, not false, when 'clock' is entirely
  -- absent from config (as opposed to present-but-JSON-null) — coalesce
  -- guarantees a real boolean here rather than a three-valued-logic trap
  -- (claim_timeout's `if not v_clock_enabled` would otherwise silently
  -- fail to fire on a NULL, since `not null` is null, not true).
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
    -- Next-hand path: preserve the cumulative budget/expired flags
    -- already on the row (v_gs, if found above), only restart the
    -- running window for this hand's mano team.
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

-- ════════════════════════════════════════════════════════════
-- SUBMIT_BID — adds clock stop/start bookkeeping. Full function body
-- repeated; all non-clock behavior (bid validation, kamikaze, phase
-- transition) unchanged.
-- ════════════════════════════════════════════════════════════
create or replace function submit_bid(p_room_id uuid, p_value int, p_kamikaze boolean default false)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_room rooms;
  v_team_mano int;
  v_team_pie int;
  v_required_team int;
  v_total_bases int;
  v_bid_mano int;
  v_key text;
  v_clock_enabled boolean;
  v_now timestamptz;
  v_elapsed int;
  v_team_time0 int;
  v_team_time1 int;
  v_expired0 boolean;
  v_expired1 boolean;
  v_new_running int;
  v_new_running_since timestamptz;
  v_a int;
  v_b int;
  v_pie_opts_count int;
  v_new_clock jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'bidding' then
    raise exception 'not_bidding_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  v_team_mano := v_gs.mano_seat % 2;
  v_team_pie := 1 - v_team_mano;

  if (v_gs.bids->>('team' || v_team_mano)) is null then
    v_required_team := v_team_mano;
  elsif (v_gs.bids->>('team' || v_team_pie)) is null then
    v_required_team := v_team_pie;
  else
    raise exception 'already_bid';
  end if;

  if v_player.team <> v_required_team then
    raise exception 'not_your_teams_turn';
  end if;
  if not v_player.is_captain then
    raise exception 'not_captain';
  end if;

  select * into v_room from rooms where id = p_room_id;
  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;

  if p_kamikaze and v_required_team = v_team_pie then
    raise exception 'kamikaze_only_for_mano';
  end if;
  if p_kamikaze and v_total_bases <= 2 then
    raise exception 'kamikaze_not_available';
  end if;

  if p_kamikaze then
    if p_value <> 0 and p_value <> v_total_bases then
      raise exception 'invalid_bid';
    end if;
    if v_gs.kamikazes_remaining <= 0 then
      raise exception 'no_kamikazes_left';
    end if;
  else
    if p_value < 0 or p_value > v_total_bases then
      raise exception 'invalid_bid';
    end if;
    if v_required_team = v_team_pie then
      v_bid_mano := (v_gs.bids->>('team' || v_team_mano))::int;
      if p_value <> (v_total_bases - 1 - v_bid_mano) and p_value <> (v_total_bases + 1 - v_bid_mano) then
        raise exception 'invalid_bid';
      end if;
    end if;
  end if;

  -- jsonb_typeof(NULL) is SQL NULL, not false, when 'clock' is entirely
  -- absent from config (as opposed to present-but-JSON-null) — coalesce
  -- guarantees a real boolean here rather than a three-valued-logic trap
  -- (claim_timeout's `if not v_clock_enabled` would otherwise silently
  -- fail to fire on a NULL, since `not null` is null, not true).
  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  v_now := now();
  if v_clock_enabled and v_gs.clock is not null then
    v_team_time0 := (v_gs.clock->'teamTime'->>0)::int;
    v_team_time1 := (v_gs.clock->'teamTime'->>1)::int;
    v_expired0 := coalesce((v_gs.clock->'expired'->>0)::boolean, false);
    v_expired1 := coalesce((v_gs.clock->'expired'->>1)::boolean, false);

    -- Stop the just-submitted team's window, if it was actually the one
    -- running (defensive: a no-op otherwise, e.g. the forced-single-
    -- option case below never started pie's window in the first place).
    if (v_gs.clock->>'running') is not null and (v_gs.clock->>'running')::int = v_required_team then
      v_elapsed := greatest(0, extract(epoch from (v_now - (v_gs.clock->>'running_since')::timestamptz))::int);
      if v_required_team = 0 then
        v_team_time0 := greatest(0, v_team_time0 - v_elapsed);
        v_expired0 := v_expired0 or v_team_time0 <= 0;
      else
        v_team_time1 := greatest(0, v_team_time1 - v_elapsed);
        v_expired1 := v_expired1 or v_team_time1 <= 0;
      end if;
    end if;

    v_new_running := null;
    v_new_running_since := null;
    if v_required_team = v_team_mano then
      -- Mano just bid; only start pie's window if pie actually has a real
      -- choice (mirrors opcionesValidas from src/engine/bidding.js — same
      -- formula this function's own validation above already uses).
      v_a := v_total_bases - 1 - p_value;
      v_b := v_total_bases + 1 - p_value;
      v_pie_opts_count := 0;
      if v_a >= 0 and v_a <= v_total_bases then
        v_pie_opts_count := v_pie_opts_count + 1;
      end if;
      if v_b >= 0 and v_b <= v_total_bases and v_b <> v_a then
        v_pie_opts_count := v_pie_opts_count + 1;
      end if;
      if v_pie_opts_count > 1 then
        v_new_running := v_team_pie;
        v_new_running_since := v_now;
      end if;
    end if;
    -- If v_required_team = v_team_pie (the final bid), both stay null:
    -- bidding is over, nothing left to time.

    v_new_clock := jsonb_build_object(
      'teamTime', jsonb_build_array(v_team_time0, v_team_time1),
      'running', v_new_running,
      'running_since', v_new_running_since,
      'expired', jsonb_build_array(v_expired0, v_expired1)
    );
  else
    v_new_clock := v_gs.clock;
  end if;

  v_key := 'team' || v_required_team;
  update game_state
  set
    bids = jsonb_set(bids, array[v_key], to_jsonb(p_value)),
    kamikaze_declared = kamikaze_declared or p_kamikaze,
    kamikazes_remaining = case when p_kamikaze then kamikazes_remaining - 1 else kamikazes_remaining end,
    phase = case when v_required_team = v_team_pie then 'playing' else phase end,
    turn_seat = case when v_required_team = v_team_pie then mano_seat else turn_seat end,
    clock = v_new_clock,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- CLAIM_TIMEOUT — piece 4g: the "muerte" mode consequence.
-- ════════════════════════════════════════════════════════════
create function claim_timeout(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
  v_clock_enabled boolean;
  v_modo text;
  v_running int;
  v_running_since timestamptz;
  v_team_time int;
  v_elapsed int;
  v_remaining int;
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
  if v_gs.phase <> 'bidding' then
    raise exception 'not_bidding_phase';
  end if;

  -- jsonb_typeof(NULL) is SQL NULL, not false, when 'clock' is entirely
  -- absent from config (as opposed to present-but-JSON-null) — coalesce
  -- guarantees a real boolean here rather than a three-valued-logic trap
  -- (claim_timeout's `if not v_clock_enabled` would otherwise silently
  -- fail to fire on a NULL, since `not null` is null, not true).
  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  if not v_clock_enabled then
    raise exception 'clock_not_enabled';
  end if;
  v_modo := v_room.config->'clock'->>'modo';
  if v_modo <> 'muerte' then
    raise exception 'clock_not_muerte_mode';
  end if;

  if v_gs.clock is null or (v_gs.clock->>'running') is null then
    raise exception 'no_clock_running';
  end if;

  v_running := (v_gs.clock->>'running')::int;
  v_running_since := (v_gs.clock->>'running_since')::timestamptz;
  v_team_time := (v_gs.clock->'teamTime'->>v_running)::int;
  v_elapsed := greatest(0, extract(epoch from (now() - v_running_since))::int);
  v_remaining := v_team_time - v_elapsed;

  if v_remaining > 0 then
    raise exception 'not_expired_yet';
  end if;

  -- The `clock` column is deliberately left untouched: frozen with
  -- `running` still pointing at the losing team is the entire "who lost"
  -- record, no new column needed (same pattern close_hand already used
  -- via the frozen mano_seat for the kamikaze ending).
  update rooms set status = 'finished' where id = p_room_id;
  update game_state
  set phase = 'finished', end_cause = 'clock_expired', pending_action = null, updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
