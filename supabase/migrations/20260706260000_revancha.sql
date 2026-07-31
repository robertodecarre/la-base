-- La Base — piece BB (batch overnight post-5r): "REVANCHA" button on the
-- winner screen. Restarts a fresh match in the SAME room — same players/
-- teams/seats (no trip back through team selection), hand_number back to
-- 0, scores reset — instead of the only current way out of 'finished'
-- being "Salir de la sala" and joining/creating a brand new room.
--
-- Design: a dedicated RPC rather than repurposing deal_hand, because a
-- rematch needs to WIPE match history (played_cards/hand_results — both
-- keyed by hand_number, which the new match reuses starting at 0) before
-- anything can safely reset hand_number back to 0; deal_hand only ever
-- advances forward and has no notion of clearing prior hands. Ungated
-- (any room member) on purpose, matching deal_hand's own first-hand
-- branch and sortear_reparto_inicial: like those, this is a "any session
-- can independently trigger the shared next step" action, not a role-
-- specific one like close_hand/deal_hand's per-hand gates — there's no
-- natural "captain of the whole match" to single out for it, and a race
-- between two sessions calling it back-to-back is harmless (the second
-- call's guard just no-ops, see phase check below).
--
-- Leaves the actual dealing to the EXISTING deal_hand flow: this RPC only
-- resets state to exactly what deal_hand's first-hand branch expects
-- (phase='dealing', dealer_seat from the room's original sorteo — reused
-- rather than re-running the sorteo screen, since the task only asked to
-- reset hand_number/scores, not repeat the draw), so hand 0 of the
-- rematch deals through the same code path — and same "DAR" button gate
-- — as hand 0 of the original match did.
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

  -- Locking convention (per deal_hand/close_hand): rooms before game_state.
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

  -- Wipes ALL match history for this room, not just hand 0's — the whole
  -- match restarts, so no earlier hand's cards/results should linger
  -- (and hand 0 specifically MUST be cleared: played_cards/hand_results
  -- are keyed by hand_number, which the rematch reuses starting at 0).
  delete from played_cards where room_id = p_room_id;
  delete from hand_results where room_id = p_room_id;
  update players set tricks_won = 0 where room_id = p_room_id;

  if v_room.sorteo_inicial is not null and v_room.sorteo_inicial ? 'ganador_seat' then
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
    -- deal_hand's own upsert only re-initializes kamikazes_remaining on
    -- the INSERT path (a brand-new room) — its ON CONFLICT UPDATE branch
    -- (which is what every hand after the room's very first ever runs
    -- through, including hand 0 of a rematch) deliberately leaves it
    -- alone, since it's a match-level counter that's meant to persist
    -- and only decrease across hands within ONE match. A rematch is a
    -- new match, so it has to be reset here — deal_hand will never do it
    -- for us on this path.
    kamikazes_remaining = coalesce((v_room.config->>'kamikazes')::int, 0),
    kamikaze_declared = false,
    pending_action = null,
    clock = null,
    end_cause = null,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
