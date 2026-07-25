-- La Base — phase B, piece 4f: close_hand.
--
-- 'closing' (set inside resolve_trick when a hand's last base resolves,
-- piece 4b) is the third dead-end phase, same shape problem as
-- 'resolving' (piece 4e): entered, nothing reads it back out. Unlike
-- 'resolving' though, this isn't a pure state-advance — it's the actual
-- hand-scoring step, and depending on the outcome it can end the whole
-- match. deal_hand's own comment already named and anticipated this exact
-- piece: "Mano siguiente: hand_number/dealer_seat ya los dejó close_hand
-- (fase futura, todavía no construida)".
--
-- Ported directly from PantallaPartida.jsx's cerrarMano + src/engine/
-- hand.js's evaluarCierreMano + src/engine/scoring.js's calcularPuntos —
-- same precedence, same formulas, no redesign:
--   1. Tally bid vs. tricks won per team, insert into hand_results
--      (already scaffolded for exactly this — the "Tablero" — in the
--      phase-A schema).
--   2. Check the kamikaze-loss condition FIRST, unconditionally: if the
--      mano team's delta this hand is <= -2 and they hadn't declared
--      kamikaze, the match ends immediately, mano team loses — regardless
--      of how many hands remain. This is deliberately NOT gated on
--      kamikaze having even been available that hand (submit_bid disables
--      kamikaze bidding when total_bases <= 2); porting the offline
--      client's behavior exactly, not redesigning the rule.
--   3. Otherwise, if this was the match's last hand, it ends normally.
--   4. Otherwise, roll hand_number/dealer_seat forward into 'dealing' —
--      deal_hand's next-hand branch already resets bids/direction/
--      kamikaze_declared/pending_action/base_num/last_trick_winner_seat/
--      players.tricks_won on every call regardless of branch, so nothing
--      else needs resetting here. dealer_seat rotates +1 (mirrors
--      offline's pieIdx = (pieIdx+1) % nJugTotal — the two are the same
--      seat, confirmed by mano_seat's formula matching manoJugIdx's
--      exactly for dealer_seat ≡ pieIdx). kamikazes_remaining is a
--      whole-match budget and is deliberately left untouched (it's not in
--      deal_hand's reset list either).
--
-- No new columns: "who won" is SUM(hand_results.delta_team0/1) across the
-- room, "who lost via kamikaze" is end_cause='kamikaze' + the frozen
-- game_state.mano_seat % 2 — both already derivable, matching how the
-- rest of the schema avoids storing computed values.
--
-- Caller authorization: any room member, matching the offline client's
-- ungated "CERRAR MANO" button (one local device controls every seat
-- there, so there's no distinguished actor to mirror) — no captain or
-- trick-winner restriction, unlike the carrier-gated Copas/Oros RPCs.
create function close_hand(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
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
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
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

  -- Mirrors src/engine/scoring.js's calcularPuntos exactly: whichever team
  -- hit its bid exactly gets 10+hecho, the other gets -abs(hecho-pedido).
  -- If neither hits, or both hit, both fall through to -abs(...) each
  -- (both hitting nets 0-0 — an existing quirk of the formula, not
  -- something to special-case here).
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
    set phase = 'finished', end_cause = 'kamikaze', pending_action = null, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  elsif v_gs.hand_number + 1 >= v_estructura_len then
    update rooms set status = 'finished' where id = p_room_id;
    update game_state
    set phase = 'finished', end_cause = 'normal', pending_action = null, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      hand_number = v_gs.hand_number + 1,
      dealer_seat = (v_gs.dealer_seat + 1) % v_n_jug,
      phase = 'dealing',
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;
