-- La Base — deportivo mode: 10s grace period + auto-loss, mirroring the
-- existing muerte/claim_timeout pattern (20260706130000_clock_expired.sql)
-- rather than inventing a new one.
--
-- Confirmed by reading deal_hand/submit_bid/claim_timeout directly before
-- writing this: deportivo mode currently has NO timeout behavior at all
-- beyond cosmetic styling — the clock counts down and stops at 0
-- (teamTime clamped >=0, expired flag set) but nothing ever ends the
-- match for it, unlike muerte's claim_timeout.
--
-- No new game_state column needed for the grace period itself — this
-- follows the SAME derivability philosophy clock_expired.sql's own header
-- comment states explicitly ("avoid storing computed values"): a team's
-- main-budget deadline is running_since + teamTime[running] seconds; the
-- grace deadline is simply 10 seconds past THAT. Both are computable on
-- demand from fields that already exist (running, running_since,
-- teamTime) — a `grace_started_at` column would just be storing
-- (running_since + teamTime[running]) redundantly. Deviates from a
-- literal reading of the task's own suggested approach (which floated a
-- new column as one option, "e.g.") — flagged here rather than silently
-- adding a column that isn't needed.
--
-- claim_deportivo_timeout: parallel to claim_timeout, but the modo check
-- is inverted (deportivo instead of muerte) and the deadline includes the
-- +10s grace. Same "claim" framing — no scheduled job, any client can
-- call this once it locally computes the grace has elapsed, and the
-- server independently re-verifies the real deadline before acting
-- (not_expired_yet if a client's local tick was ahead of the server).
-- Reuses end_cause='clock_expired' (already covers "this team ran out of
-- time", muerte or deportivo — the frontend's equipoPerdioPorTiempo logic
-- already keys off end_cause + clock.running, with no mode-specific
-- branching needed there either).
create function claim_deportivo_timeout(p_room_id uuid)
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

  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  if not v_clock_enabled then
    raise exception 'clock_not_enabled';
  end if;
  v_modo := v_room.config->'clock'->>'modo';
  if v_modo <> 'deportivo' then
    raise exception 'clock_not_deportivo_mode';
  end if;

  if v_gs.clock is null or (v_gs.clock->>'running') is null then
    raise exception 'no_clock_running';
  end if;

  v_running := (v_gs.clock->>'running')::int;
  v_running_since := (v_gs.clock->>'running_since')::timestamptz;
  v_team_time := (v_gs.clock->'teamTime'->>v_running)::int;
  v_elapsed := greatest(0, extract(epoch from (now() - v_running_since))::int);
  -- Main budget + 10s grace — the deadline claim_timeout doesn't have.
  v_remaining := (v_team_time + 10) - v_elapsed;

  if v_remaining > 0 then
    raise exception 'not_expired_yet';
  end if;

  -- Same "frozen clock is the record" pattern as claim_timeout — clock
  -- column untouched, running still points at the team that lost.
  update rooms set status = 'finished' where id = p_room_id;
  update game_state
  set phase = 'finished', end_cause = 'clock_expired', pending_action = null, updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
