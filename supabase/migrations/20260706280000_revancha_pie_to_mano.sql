-- La Base — piece II (batch overnight post-EE): revancha_partida's new
-- dealer_seat currently comes from the ORIGINAL match's sorteo winner
-- (v_room.sorteo_inicial->>'ganador_seat'), completely ignoring how the
-- just-finished match actually ended. Confirmed by reading
-- 20260706260000_revancha.sql: there was never any inversion logic —
-- every rematch in a room just resets to the same original dealer,
-- match after match, regardless of who was pie when the previous match
-- closed.
--
-- Fix: the team that was PIE (dealer_seat) in the last hand of the
-- finished match should become MANO in hand 0 of the rematch. Pie/mano
-- are always opposite teams for any given hand (deal_hand computes
-- mano_seat := (dealer_seat + n_jug - 1) % n_jug — a one-seat shift,
-- which always flips even/odd seat parity, and team is fixed by seat
-- parity per choose_team_rpc.sql). So "last match's pie team becomes
-- this match's mano team" reduces to: this match's NEW dealer_seat's
-- team must be last match's MANO team, i.e. the new dealer_seat should
-- be seeded from the OLD mano_seat (still sitting untouched on the
-- game_state row being replaced here — close_hand's 'finished' branch
-- never touches dealer_seat/mano_seat, only phase/end_cause/
-- pending_action), not from the original sorteo winner. deal_hand's
-- unconditional `v_mano_seat := (v_dealer_seat + v_n_jug - 1) % v_n_jug`
-- (run on every hand, including hand 0 of a rematch, since revancha
-- leaves phase='dealing' for deal_hand to pick up) then derives the new
-- match's mano_seat/team correctly off this new dealer_seat — no other
-- change needed downstream.
--
-- v_gs here is still the PRE-reset row (loaded by the SELECT ... FOR
-- UPDATE above, before the UPDATE at the bottom overwrites it), so
-- v_gs.mano_seat is exactly the last hand's mano_seat.
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

  -- Piece II: seed the rematch's dealer from the OLD mano_seat (last
  -- match's mano team becomes pie, which makes last match's PIE team the
  -- new MANO team once deal_hand derives mano_seat from this dealer_seat
  -- below) — falls back to the original sorteo winner only if this row
  -- somehow never played a hand (mano_seat null), which shouldn't happen
  -- for a room that legitimately reached 'finished'.
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
