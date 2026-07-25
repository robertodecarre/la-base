-- La Base — phase B, piece 4d: resolve_oros_menu.
--
-- oros_menu (set inside resolve_trick, piece 4b) has been the same kind of
-- dead end copas_menu was before piece 4c: entered, never read back out.
-- This RPC is that exit — but oros_menu is NOT the same shape as
-- copas_menu, so this is not a copy of resolve_copas_menu's structure:
--
--   - pending_action here is { type:'oros_menu', carrier_seat, team } —
--     no trick_complete field. That's not an omission: oros_menu is only
--     ever entered from inside resolve_trick, i.e. strictly after a trick
--     has already fully resolved (detectarTriggerOros/the SQL mirror of
--     it only run once a trick is complete — unlike As de Copas, which
--     play_card can enter mid-trick). So by construction the trick behind
--     an oros_menu is always already resolved; there is nothing left to
--     feed back into resolve_trick.
--   - the decision isn't a direction + seat-skip walk. Per
--     PantallaPartida.jsx's oros-menu block (`jugadores.filter(j =>
--     j.eq===orosMenu.eqIdx)`, `onClick={() => siguienteBase(idx)}`), the
--     carrier picks any player on pending_action.team (including
--     themselves) to directly open the next base. resolve_trick already
--     advanced base_num when it set phase='oros_menu', so this RPC only
--     ever needs to set turn_seat to the chosen seat and re-open play —
--     no card resolution of any kind happens here.
create function resolve_oros_menu(p_room_id uuid, p_seat int)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_carrier_seat int;
  v_team smallint;
  v_chosen players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'oros_menu' then
    raise exception 'not_oros_menu_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  v_carrier_seat := (v_gs.pending_action->>'carrier_seat')::int;
  if v_player.seat <> v_carrier_seat then
    raise exception 'not_oros_carrier';
  end if;

  v_team := (v_gs.pending_action->>'team')::smallint;

  select * into v_chosen from players where room_id = p_room_id and seat = p_seat;
  if not found then
    raise exception 'invalid_seat';
  end if;
  if v_chosen.team <> v_team then
    raise exception 'seat_not_on_winning_team';
  end if;

  update game_state
  set
    turn_seat = p_seat,
    phase = 'playing',
    pending_action = null,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
