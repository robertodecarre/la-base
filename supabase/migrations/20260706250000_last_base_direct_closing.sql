-- La Base — piece AA (batch overnight post-5r): on the hand's LAST base,
-- don't show "Llevar base" at all — only "Cerrar mano" (captain-only)
-- should be actionable, and the last base's cards must stay visible until
-- the hand actually closes.
--
-- Piece T (20260706240000) made resolve_trick always land on 'resolving'
-- for every base, including the last, specifically so the last base's
-- cards wouldn't vanish before a confirmation step — at the time, the only
-- way to reach 'closing' without an intermediate visible base was through
-- resolve_resolving's phase-clearing render (cartasMesa=[]). This migration
-- undoes that specific phase-graph shape now that the actual fix ships
-- client-side instead (PantallaPartidaOnline.jsx's 'closing' render now
-- shows the last base's played cards + winner, rather than clearing the
-- table) — so there is no longer a reason to force a manual "Llevar base"
-- click before the hand's very last base can close. resolve_trick again
-- routes the last base directly to 'closing' (v_nueva_base >= v_total_bases),
-- performing the same turn_seat handoff resolve_resolving would have done,
-- while every non-last base keeps going through 'resolving' exactly as
-- piece T left it (unchanged below).
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
    update game_state
    set
      base_num = v_nueva_base,
      last_trick_winner_seat = v_winner_seat,
      turn_seat = v_winner_seat,
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
