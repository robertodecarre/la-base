-- La Base — piece LL (batch overnight post-EE): close_hand currently lets
-- EITHER team's captain unilaterally close the hand alone (captain-gated
-- since 20260706200000_captain_dealer_gates.sql, but not "both"-gated —
-- a single captain's call runs the full scoring/transition in one shot).
-- Require confirmation from a captain of EACH team before the hand
-- actually closes.
--
-- Design: two boolean flags on game_state (close_hand_confirmed_team0/1),
-- one per team, not a JSONB structure — same flat-column style as
-- kamikaze_declared/pending_action already on this table, and a fixed
-- 2-team game never needs more than 2 flags, so there's no variable-shape
-- data that would justify JSONB.
--
-- close_hand is now a TWO-STEP RPC under the same name (no new RPC
-- introduced — same caller-facing action, "the button a captain presses
-- to close the hand", just no longer a single unconditional step): each
-- call marks ONLY the calling captain's own team as confirmed (not
-- "either team", to prevent one captain from confirming on behalf of the
-- other by calling twice) and returns the game_state as-is if the OTHER
-- team hasn't confirmed yet — still phase='closing', so the room's
-- "próximo repartidor"/deal_hand gate (see deal_hand_dealer_only,
-- 20260706200000) naturally stays closed until a captain of each team
-- has pressed the button, matching the task's requirement that dealing
-- the next hand can only happen after the hand has actually closed this
-- way. Only once BOTH flags are true does this call run the original
-- scoring/insert-hand_results/phase-transition logic (unchanged from
-- 20260706200000), and it resets both flags back to false as part of
-- that same transition so the NEXT hand's 'closing' starts clean.
--
-- A captain calling twice (e.g. an accidental double-click) is a no-op
-- past the first call: their own flag is already true, so re-setting it
-- to true changes nothing, and the function still only proceeds past the
-- "wait for the other team" check once BOTH are true.
alter table game_state
  add column close_hand_confirmed_team0 boolean not null default false,
  add column close_hand_confirmed_team1 boolean not null default false;

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

  v_mano_team := v_gs.mano_seat % 2;
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

-- revancha_partida: full body repeated (CREATE OR REPLACE requires it),
-- diffed from 20260706280000_revancha_pie_to_mano.sql (the most recent
-- prior version) — only change is resetting the two new columns, for the
-- same reason it already resets kamikaze_declared/pending_action/etc.:
-- a rematch is a brand-new match and shouldn't inherit any leftover
-- per-hand negotiation state from the finished one (in practice these
-- are always already false by the time a hand reaches 'finished', since
-- close_hand itself resets them on every transition out of 'closing' —
-- this is defense-in-depth/explicitness, matching how revancha already
-- treats every other per-hand field on this table, not a fix for an
-- observed stuck-true case).
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

  if v_gs.mano_seat is not null then
    v_dealer_seat := v_gs.mano_seat;
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
