-- La Base — phase B, piece 4a: As de Copas play-time trigger.
--
-- Isolated fix for a gap in piece 3: As de Copas must pause play the
-- instant it's played (PantallaPartida.jsx's tirarCarta checks it
-- immediately, before the trick-completion check), independent of whether
-- that card also happens to complete the trick — unlike As de Oros, which
-- is only ever evaluated once a trick is already fully resolved. This
-- piece does NOT resolve the trick when Copas happens to be the
-- completing card: it only transitions to 'copas_menu' and records
-- trick_complete in pending_action so a later piece's resolve-copas-menu
-- RPC knows whether choosing a direction should just advance turn or fall
-- through into full trick resolution (winner via resolverBase, Oros
-- trigger) — that resolution logic is still out of scope here, same as
-- the still-unimplemented trick_complete_not_implemented path for
-- non-Copas plays.
--
-- pending_action uses `trick_complete` (boolean) rather than the schema
-- comment's pending_trick/pending_hands — no server-side snapshot is
-- needed since played_cards already persists the trick by trick_number;
-- a later RPC can just re-read it.
--
-- Full function body repeated (CREATE OR REPLACE requires it) — the only
-- changes from the piece-3 version are the v_is_copas computation (placed
-- after card-ownership validation, so it only ever reads the already
-- validated v_card) and branching the final game_state update on it.
create or replace function play_card(p_room_id uuid, p_card_uid int)
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
  v_is_copas boolean;
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

  v_is_copas := coalesce((v_room.config->'ases'->>'copas')::boolean, false)
    and (v_card->>'valor')::int = 1
    and (v_card->'palo'->>'n') = 'Copas';

  select count(*) into v_seq from played_cards
    where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num;

  if not v_is_copas and v_seq + 1 >= v_n_jug then
    raise exception 'trick_complete_not_implemented';
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_cards
    from jsonb_array_elements(v_hand.cards) elem
    where (elem->>'uid')::int <> p_card_uid;
  update hands set cards = v_new_cards where id = v_hand.id;

  insert into played_cards (room_id, player_id, hand_number, trick_number, seq_in_trick, card)
  values (p_room_id, v_player.id, v_gs.hand_number, v_gs.base_num, v_seq, v_card);

  if v_is_copas then
    update game_state
    set
      phase = 'copas_menu',
      pending_action = jsonb_build_object(
        'type', 'copas_menu',
        'carrier_seat', v_player.seat,
        'trick_complete', (v_seq + 1 >= v_n_jug)
      ),
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      turn_seat = case when direction = 1 then (turn_seat + v_n_jug - 1) % v_n_jug
                       else (turn_seat + 1) % v_n_jug end,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;
