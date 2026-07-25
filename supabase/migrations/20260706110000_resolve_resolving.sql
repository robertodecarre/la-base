-- La Base — phase B, piece 4e: resolve_resolving.
--
-- The third dead-end phase resolve_trick can leave a room in, alongside
-- copas_menu (piece 4c) and oros_menu (piece 4d): when a trick completes
-- with no Copas mid-trick trigger and no Oros post-trick trigger,
-- resolve_trick's plain branch (piece 4b, unchanged since) sets
-- phase = 'resolving' and last_trick_winner_seat, but never touches
-- turn_seat — it's left at whoever played the trick's last card, not the
-- winner. play_card requires phase = 'playing', so nothing can resume
-- play from there. Confirmed by reading resolve_trick directly (not
-- assumed): pending_action is already null going into 'resolving' (no
-- decision was ever stored, unlike copas_menu/oros_menu), and
-- last_trick_winner_seat already holds exactly the value that needs to
-- become turn_seat. So unlike 4c/4d, this RPC validates nothing out of
-- pending_action and makes no choice on the caller's behalf — it's a
-- pure "confirm and advance" transition, mirroring
-- PantallaPartida.jsx's "SIGUIENTE BASE →" button (fase==="resolver" ->
-- siguienteBase() -> turnoIdx=ganadorBase).
--
-- The offline client's button has no per-player gating (one local device
-- controls every seat), so it can't answer who should be authorized to
-- call the online equivalent. Restricted to the trick winner
-- (last_trick_winner_seat), matching the carrier-only authorization
-- pattern resolve_copas_menu/resolve_oros_menu already use, for a
-- consistent model across all three menu-exit RPCs.
create function resolve_resolving(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
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

  update game_state
  set
    turn_seat = v_gs.last_trick_winner_seat,
    phase = 'playing',
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
