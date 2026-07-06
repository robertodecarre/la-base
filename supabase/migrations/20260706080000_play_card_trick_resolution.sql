-- La Base — phase B, piece 4b: full trick resolution.
--
-- Replaces piece 3's trick_complete_not_implemented guard (for non-Copas
-- plays) with real resolution: winner via hierarchy + the As de Espadas
-- superpower, then the As de Oros post-resolution trigger check.
--
-- No Edge Function: unlike submit_bid, there is no partial cross-check
-- that's meaningfully cheaper than the full computation here (the
-- interesting case — Espadas-kills-Bastos — is exactly what a partial
-- check would need to detect anyway). But resolverBase/detectarTriggerOros
-- are small, deterministic, and their inputs (card, seq_in_trick) are
-- already persisted server-authoritative facts in played_cards by the time
-- a trick completes — there's no client input to distrust. So this
-- recomputes them natively as the actual source of truth, same
-- small-stable-formula category as opcionesValidas in submit_bid, not the
-- "multi-branch mess" that comment assumed of trick resolution. This does
-- reintroduce the same-rule-two-languages drift risk the engine/
-- extraction aimed to avoid — see the SYNC RISK comments on resolverBase/
-- detectarTriggerOros in src/engine/trick.js, which point back here.
--
-- Still explicitly out of scope: resolving a copas_menu whose
-- trick_complete is true (that will reuse this same logic from whichever
-- future RPC unsticks copas_menu) — piece 4a only transitions into
-- copas_menu, it doesn't resolve out of it.
--
-- Full function body repeated (CREATE OR REPLACE requires it). Changes
-- from the piece-4a version: v_completes_trick replaces the inline
-- v_seq+1>=v_n_jug check (now used in two places), the mutation
-- (hand/played_cards) now always happens before branching (since the
-- completing-trick case is no longer rejected), and the final update
-- becomes a three-way branch: copas / trick-complete-resolution / normal
-- turn advance.
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
    -- Mirrors src/engine/trick.js's resolverBase, variable for variable
    -- (see the SYNC RISK comment there): find the Ancho de Bastos and As
    -- de Espadas in this trick, override to Espadas if it was played after
    -- Bastos (unconditionally — ases.espadas does not gate this, matching
    -- resolverBase's documented quirk vs. ganadorParcial), else fall back
    -- to max-jerarquia-with-tiebreak-by-seq_in_trick.
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

    -- Oros only triggers a menu if there's a next base for it to matter
    -- for (mirrors PantallaPartida.jsx's `nuevaBase<estructura[manoActual]`
    -- gate) — on the hand's last base, always fall through to 'closing'.
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
