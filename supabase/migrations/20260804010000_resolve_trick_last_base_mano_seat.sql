-- La Base — follow-up to 20260804000000_bid_mano_seat_split.sql, found
-- while auditing which file is actually live for that migration (not in
-- the original request, flagged rather than silently folded into the
-- other migration since that one had already been pushed to the real
-- Supabase project by the time this was found).
--
-- Live file for resolve_trick: 20260706250000_last_base_direct_closing.sql
-- (piece AA) — LATER than resolve_resolving's own last file
-- (20260706240000). Piece AA made resolve_trick route the hand's LAST
-- base directly to phase='closing', bypassing resolve_resolving entirely
-- (no intermediate 'resolving'/"Llevar base" step for the final base).
-- That means the mano_seat write added to resolve_resolving in
-- 20260804000000 never fires for a hand's very last trick — resolve_
-- resolving simply never runs for it. Since MesaCircular's MANO badge is
-- still driven by mano_seat on the 'closing' screen, that gap would leave
-- the badge stale specifically for whoever wins the LAST base of a hand —
-- the exact bug this whole fix is for, just in the one branch resolve_
-- resolving can't reach.
--
-- Full body repeated (CREATE OR REPLACE requires it), diffed from
-- 20260706250000. Only change: the direct-to-'closing' branch also sets
-- mano_seat = v_winner_seat now, alongside the existing turn_seat write —
-- same rule as everywhere else ("whoever wins a base becomes mano"),
-- applied to the one branch that was missing it. bid_mano_seat is
-- untouched here, same as resolve_resolving — it stays frozen all hand.
create or replace function resolve_trick(p_room_id uuid)
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

  -- Oros sigue sin disparar menú si no queda una próxima base (nada que
  -- elegir quién la abre) — sin cambios acá.
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
  elsif v_nueva_base >= v_total_bases then
    -- Piece AA: última base de la mano — directo a 'closing', sin pasar
    -- por 'resolving' (no hay "Llevar base" que mostrar). turn_seat se
    -- deja igual que resolve_resolving lo dejaba (el ganador de la última
    -- base), aunque no se vuelva a jugar esta mano, para no dejarlo
    -- desactualizado.
    --
    -- Batch fix (mano_seat/bid_mano_seat split, follow-up): también
    -- mano_seat, no solo turn_seat — el ganador de la ÚLTIMA base también
    -- pasa a ser mano (mismo criterio que cualquier otra base), y esta
    -- rama es la ÚNICA que resuelve la última base — resolve_resolving
    -- nunca corre para ella.
    update game_state
    set
      base_num = v_nueva_base,
      last_trick_winner_seat = v_winner_seat,
      turn_seat = v_winner_seat,
      mano_seat = v_winner_seat,
      phase = 'closing',
      pending_action = null,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      base_num = v_nueva_base,
      last_trick_winner_seat = v_winner_seat,
      phase = 'resolving',
      pending_action = null,
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;
