-- La Base — phase B, piece 4c: resolve_copas_menu.
--
-- copas_menu (piece 4a) has been a dead end: play_card transitions into it
-- but nothing ever reads it back out. This RPC is that exit.
--
-- Two branches, mirroring PantallaPartida.jsx's `elegir(nuevoSentido)`:
--   - trick_complete = false: the copas card didn't finish the trick, so
--     this just picks who plays next. That is NOT the same one-step
--     turn_seat +/-1 formula play_card's normal branch uses — a direction
--     *reversal* can walk straight back into a seat that already played
--     this trick, so this ports PantallaPartida's sigNormal/sigInvertido:
--     walk from carrier_seat in the chosen direction, skipping any seat
--     already present in played_cards for this trick.
--   - trick_complete = true: falls through into the exact same winner/
--     Oros-trigger/base-advance resolution play_card already runs in
--     piece 4b. Rather than a third copy of that logic (SQL already
--     duplicates it once against src/engine/trick.js — see the SYNC RISK
--     comments there and in piece 4b's migration), it's extracted here
--     into resolve_trick(), called from both play_card and
--     resolve_copas_menu. This is a refactor of piece 4b's logic, not a
--     rewrite — the resolution rules are unchanged.
--
-- direction is persisted in both branches: play_card's normal-advance
-- branch reads game_state.direction for the rest of the hand, so the
-- carrier's choice has to stick even when trick_complete = true and this
-- RPC otherwise has nothing turn_seat-related to do (resolve_trick doesn't
-- touch turn_seat at all — same as piece 4b, opening the next trick is
-- still out of scope, deferred to whichever future piece builds the
-- 'resolving' phase).
--
-- resolve_trick is intentionally NOT exposed as a public RPC: it re-checks
-- nothing about whose turn it is or what phase the room is in (that's the
-- caller's job, already done by play_card/resolve_copas_menu before they
-- call it) — a direct supabase.rpc('resolve_trick', ...) call would let
-- any room member force-resolve the current trick out of turn. Postgres
-- grants EXECUTE to PUBLIC by default on function creation, so this has to
-- be revoked explicitly.

-- ════════════════════════════════════════════════════════════
-- SHARED: trick winner resolution (extracted from piece 4b's play_card)
-- ════════════════════════════════════════════════════════════
create function resolve_trick(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_room rooms;
  v_ancho_seq int;
  v_ancho_player uuid;
  v_espada_seq int;
  v_espada_player uuid;
  v_winner_player_id uuid;
  v_winner_seat int;
  v_winner_team smallint;
  v_ases_oros boolean;
  v_oros_player uuid;
  v_oros_seat int;
  v_oros_team smallint;
  v_oros_trigger boolean;
  v_total_bases int;
  v_nueva_base int;
begin
  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_room from rooms where id = p_room_id;

  -- Mirrors src/engine/trick.js's resolverBase, variable for variable (see
  -- the SYNC RISK comment there): find the Ancho de Bastos and As de
  -- Espadas in this trick, override to Espadas if it was played after
  -- Bastos (unconditionally — ases.espadas does not gate this, matching
  -- resolverBase's documented quirk vs. ganadorParcial), else fall back to
  -- max-jerarquia-with-tiebreak-by-seq_in_trick.
  select seq_in_trick, player_id into v_ancho_seq, v_ancho_player
    from played_cards
    where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num
      and (card->>'valor')::int = 1 and (card->'palo'->>'n') = 'Bastos'
    limit 1;

  select seq_in_trick, player_id into v_espada_seq, v_espada_player
    from played_cards
    where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num
      and (card->>'valor')::int = 1 and (card->'palo'->>'n') = 'Espadas'
    limit 1;

  if v_ancho_player is not null and v_espada_player is not null and v_espada_seq > v_ancho_seq then
    v_winner_player_id := v_espada_player;
  else
    select player_id into v_winner_player_id
      from played_cards
      where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num
      order by
        (case when (card->>'valor')::int = 1 and (card->'palo'->>'n') = 'Bastos' then 100 else (card->>'valor')::int end) desc,
        seq_in_trick asc
      limit 1;
  end if;

  select seat, team into v_winner_seat, v_winner_team from players where id = v_winner_player_id;

  -- Mirrors detectarTriggerOros: only relevant if ases.oros is on, the As
  -- de Oros is in this trick, and its owner's team is the winning team.
  v_ases_oros := coalesce((v_room.config->'ases'->>'oros')::boolean, false);
  v_oros_player := null;
  if v_ases_oros then
    select player_id into v_oros_player
      from played_cards
      where room_id = p_room_id and hand_number = v_gs.hand_number and trick_number = v_gs.base_num
        and (card->>'valor')::int = 1 and (card->'palo'->>'n') = 'Oros'
      limit 1;
  end if;

  v_oros_trigger := false;
  if v_oros_player is not null then
    select seat, team into v_oros_seat, v_oros_team from players where id = v_oros_player;
    if v_oros_team = v_winner_team then
      v_oros_trigger := true;
    end if;
  end if;

  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;
  v_nueva_base := v_gs.base_num + 1;

  update players set tricks_won = tricks_won + 1 where id = v_winner_player_id;

  -- Oros only triggers a menu if there's a next base for it to matter for
  -- (mirrors PantallaPartida.jsx's `nuevaBase<estructura[manoActual]` gate)
  -- — on the hand's last base, always fall through to 'closing'.
  if v_oros_trigger and v_nueva_base < v_total_bases then
    update game_state
    set
      base_num = v_nueva_base,
      last_trick_winner_seat = v_winner_seat,
      phase = 'oros_menu',
      pending_action = jsonb_build_object('type', 'oros_menu', 'carrier_seat', v_oros_seat, 'team', v_winner_team),
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      base_num = v_nueva_base,
      last_trick_winner_seat = v_winner_seat,
      phase = case when v_nueva_base >= v_total_bases then 'closing' else 'resolving' end,
      pending_action = null,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;

revoke execute on function resolve_trick(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- PLAY_CARD — unchanged behavior, trick-complete branch now delegates to
-- resolve_trick() instead of inlining it a second time.
-- ════════════════════════════════════════════════════════════
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
  v_completes_trick boolean;
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

  v_completes_trick := (v_seq + 1 >= v_n_jug);

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
        'trick_complete', v_completes_trick
      ),
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;

  elsif v_completes_trick then
    v_gs := resolve_trick(p_room_id);

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

-- ════════════════════════════════════════════════════════════
-- RESOLVE_COPAS_MENU — piece 4c: the actual exit from copas_menu.
-- ════════════════════════════════════════════════════════════
create function resolve_copas_menu(p_room_id uuid, p_direction smallint)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_room rooms;
  v_n_jug int;
  v_carrier_seat int;
  v_trick_complete boolean;
  v_played_seats int[];
  v_sig int;
  v_i int;
  v_cand int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_direction not in (1, -1) then
    raise exception 'invalid_direction';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'copas_menu' then
    raise exception 'not_copas_menu_phase';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  v_carrier_seat := (v_gs.pending_action->>'carrier_seat')::int;
  if v_player.seat <> v_carrier_seat then
    raise exception 'not_copas_carrier';
  end if;

  v_trick_complete := (v_gs.pending_action->>'trick_complete')::boolean;

  if v_trick_complete then
    -- Direction still needs to land before falling through: resolve_trick
    -- doesn't touch turn_seat/direction at all (same as piece 4b — opening
    -- the next trick is deferred to a future piece), but play_card's
    -- normal-advance branch reads game_state.direction for the rest of
    -- the hand, so the carrier's choice has to be persisted regardless.
    update game_state set direction = p_direction where room_id = p_room_id;
    v_gs := resolve_trick(p_room_id);
  else
    select * into v_room from rooms where id = p_room_id;
    v_n_jug := (v_room.config->>'nJug')::int;

    select coalesce(array_agg(distinct p.seat), array[]::int[]) into v_played_seats
      from played_cards pc
      join players p on p.id = pc.player_id
      where pc.room_id = p_room_id and pc.hand_number = v_gs.hand_number and pc.trick_number = v_gs.base_num;

    -- Mirrors PantallaPartida.jsx's sigNormal (p_direction = 1, walk
    -- backward from carrier_seat) / sigInvertido (p_direction = -1, walk
    -- forward), skipping seats that already played this trick — a plain
    -- turn_seat +/-1 step isn't enough here because a direction reversal
    -- can land back on someone who already played.
    v_sig := null;
    for v_i in 1 .. v_n_jug loop
      v_cand := case when p_direction = 1
        then (v_carrier_seat - v_i + v_n_jug) % v_n_jug
        else (v_carrier_seat + v_i) % v_n_jug end;
      if not (v_cand = any(v_played_seats)) then
        v_sig := v_cand;
        exit;
      end if;
    end loop;
    if v_sig is null then
      v_sig := v_carrier_seat;
    end if;

    update game_state
    set
      direction = p_direction,
      turn_seat = v_sig,
      phase = 'playing',
      pending_action = null,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;
