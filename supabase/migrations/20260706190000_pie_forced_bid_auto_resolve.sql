-- La Base — piece D (batch overnight post-5r, depends on piece C above):
-- when pie has exactly one legal bid value left (opcionesValidas collapses
-- to a single option — always true for a 1-card hand, but the condition
-- itself is general, not special-cased to totalBases=1), pie's captain
-- should never have to confirm a bid they have no real say in, and the
-- clock should never run for that forced turn.
--
-- The clock half of this was already correct: submit_bid only starts
-- pie's window `if v_pie_opts_count > 1`. What was missing is the
-- confirmation itself — pie's captain still had to click a button and hit
-- CONFIRMA for a value the game had already forced, unlike the hotseat
-- flow (PanelPedir.confirmarMano: "Pie no tiene elección — auto-confirmar
-- sin correr reloj"), which resolves both bids in one shot when this
-- happens. This migration replicates that shortcut server-side: when
-- mano's bid leaves pie exactly one legal value, submit_bid resolves BOTH
-- bids in this same call and jumps straight to phase='playing' — no
-- second submit_bid from pie's captain, ever, for that hand.
--
-- No frontend change needed for this: PantallaPartidaOnline.jsx already
-- branches on gameState.phase, and pie's session never had bidding-UI
-- state of its own to reconcile (modoUnEquipo mounts PanelPedir straight
-- into the "pie" subfase only once bidMano arrives) — once phase flips to
-- 'playing' over Realtime, pie's session renders the table directly and
-- never mounts a pending-confirmation panel at all.
--
-- v_pie_opts_count/v_a/v_b move out of the `if v_clock_enabled` block
-- (previously computed only for the clock decision) so the same
-- computation can also drive the auto-resolve decision regardless of
-- whether the room has a clock at all. Full body repeated (CREATE OR
-- REPLACE requires it); bid validation above this point is unchanged.
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
  v_pie_forced_value int;
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

  -- How many legal values will pie have left, and what's the forced one if
  -- exactly one — same opcionesValidas formula as the bid validation just
  -- above, computed unconditionally (not just under the clock branch)
  -- since it now also drives the auto-resolve decision below.
  v_pie_opts_count := null;
  v_pie_forced_value := null;
  if v_required_team = v_team_mano then
    v_a := v_total_bases - 1 - p_value;
    v_b := v_total_bases + 1 - p_value;
    v_pie_opts_count := 0;
    if v_a >= 0 and v_a <= v_total_bases then
      v_pie_opts_count := v_pie_opts_count + 1;
      v_pie_forced_value := v_a;
    end if;
    if v_b >= 0 and v_b <= v_total_bases and v_b <> v_a then
      v_pie_opts_count := v_pie_opts_count + 1;
      v_pie_forced_value := v_b;
    end if;
  end if;

  -- jsonb_typeof(NULL) is SQL NULL, not false, when 'clock' is entirely
  -- absent from config (as opposed to present-but-JSON-null) — coalesce
  -- guarantees a real boolean here rather than a three-valued-logic trap.
  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  v_now := now();
  if v_clock_enabled and v_gs.clock is not null then
    v_team_time0 := (v_gs.clock->'teamTime'->>0)::int;
    v_team_time1 := (v_gs.clock->'teamTime'->>1)::int;
    v_expired0 := coalesce((v_gs.clock->'expired'->>0)::boolean, false);
    v_expired1 := coalesce((v_gs.clock->'expired'->>1)::boolean, false);

    -- Stop the just-submitted team's window, if it was actually the one
    -- running (defensive: a no-op otherwise, e.g. the forced-single-
    -- option case never started pie's window in the first place).
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
    if v_required_team = v_team_mano and v_pie_opts_count > 1 then
      -- Only start pie's window if pie actually has a real choice.
      v_new_running := v_team_pie;
      v_new_running_since := v_now;
    end if;
    -- If v_required_team = v_team_pie (the final bid), or pie has no real
    -- choice (resolved below in the same call as mano's bid), both stay
    -- null: bidding is over, nothing left to time.

    v_new_clock := jsonb_build_object(
      'teamTime', jsonb_build_array(v_team_time0, v_team_time1),
      'running', v_new_running,
      'running_since', v_new_running_since,
      'expired', jsonb_build_array(v_expired0, v_expired1)
    );
  else
    v_new_clock := v_gs.clock;
  end if;

  if v_required_team = v_team_mano and v_pie_opts_count = 1 then
    -- Pie has no real choice: resolve both bids in this same call and
    -- jump straight to 'playing' — piece D, see migration header.
    update game_state
    set
      bids = jsonb_set(
        jsonb_set(bids, array['team' || v_team_mano], to_jsonb(p_value)),
        array['team' || v_team_pie], to_jsonb(v_pie_forced_value)
      ),
      kamikaze_declared = kamikaze_declared or p_kamikaze,
      kamikazes_remaining = case when p_kamikaze then kamikazes_remaining - 1 else kamikazes_remaining end,
      phase = 'playing',
      turn_seat = mano_seat,
      clock = v_new_clock,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
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
  end if;

  return v_gs;
end;
$$;
