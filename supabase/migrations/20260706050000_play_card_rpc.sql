-- La Base — phase B, piece 3: playing a card, mid-trick case only.
--
-- Scope deliberately stops short of trick completion: if the card being
-- played would be the nJug-th card of the trick, this raises
-- 'trick_complete_not_implemented' and changes nothing (checked before any
-- mutation, so a rejected call is a true no-op). Winner resolution
-- (resolverBase's hierarchy + As de Espadas), the As de Oros/Copas trigger
-- checks, and the phase transitions to 'resolving'/'oros_menu'/
-- 'copas_menu'/'closing' are later pieces.
--
-- Card ownership is never trusted from the client: p_card_uid is looked up
-- inside the caller's own `hands` row (locked for update, same as
-- game_state) and the RPC fails closed if it isn't there. Like submit_bid,
-- only `game_state` is locked (never `rooms`), preserving the lock-order
-- convention from deal_hand's header comment.
create function play_card(p_room_id uuid, p_card_uid int)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_room rooms;
  v_player players;
  v_hand hands;
  v_card jsonb;
  v_new_cards jsonb;
  v_n_jug int;
  v_seq int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'playing' then
    raise exception 'not_playing_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if v_player.seat <> v_gs.turn_seat then
    raise exception 'not_your_turn';
  end if;

  select * into v_hand from hands
    where room_id = p_room_id and player_id = v_player.id and hand_number = v_gs.hand_number
    for update;
  if not found then
    raise exception 'hand_not_found';
  end if;

  select elem into v_card
    from jsonb_array_elements(v_hand.cards) elem
    where (elem->>'uid')::int = p_card_uid
    limit 1;
  if v_card is null then
    raise exception 'card_not_in_hand';
  end if;

  select * into v_room from rooms where id = p_room_id;
  v_n_jug := (v_room.config->>'nJug')::int;

  select count(*) into v_seq from played_cards
    where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num;

  if v_seq + 1 >= v_n_jug then
    raise exception 'trick_complete_not_implemented';
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_cards
    from jsonb_array_elements(v_hand.cards) elem
    where (elem->>'uid')::int <> p_card_uid;
  update hands set cards = v_new_cards where id = v_hand.id;

  insert into played_cards (room_id, player_id, hand_number, trick_number, seq_in_trick, card)
  values (p_room_id, v_player.id, v_gs.hand_number, v_gs.base_num, v_seq, v_card);

  update game_state
  set
    turn_seat = case when direction = 1 then (turn_seat + v_n_jug - 1) % v_n_jug
                     else (turn_seat + 1) % v_n_jug end,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
