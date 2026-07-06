-- La Base — phase B, piece 2: bidding.
--
-- Edge-Function-fronted like create-room/join-room: the Edge Function
-- reads state, validates using the real src/engine/bidding.js
-- (opcionesValidas), then calls this RPC with the already-validated bid.
--
-- Unlike trick resolution (later piece), this RPC does NOT just trust the
-- Edge Function blindly — it re-derives "whose turn is it to bid" itself
-- (cheap: just which side of `bids` is still null, not a rule) and also
-- re-checks the bid's legality with the same 2-line formula opcionesValidas
-- uses. That formula is simple and unlikely to ever change shape, unlike
-- trick resolution's multi-branch tie-break/ace-power logic — duplicating
-- it here as a defense-in-depth backstop against a direct RPC call
-- bypassing the Edge Function is low-risk, whereas duplicating trick
-- resolution would not be.
create function submit_bid(p_room_id uuid, p_value int, p_kamikaze boolean default false)
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

  v_key := 'team' || v_required_team;
  update game_state
  set
    bids = jsonb_set(bids, array[v_key], to_jsonb(p_value)),
    kamikaze_declared = kamikaze_declared or p_kamikaze,
    kamikazes_remaining = case when p_kamikaze then kamikazes_remaining - 1 else kamikazes_remaining end,
    phase = case when v_required_team = v_team_pie then 'playing' else phase end,
    turn_seat = case when v_required_team = v_team_pie then mano_seat else turn_seat end,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
