-- La Base — piece T (batch overnight post-5r): fix real, pre-existente
-- desde piece 4b/4c (2026-07-06), recién notado ahora — root-caused
-- leyendo resolve_trick/resolve_resolving directo, no asumido.
--
-- resolve_trick (compartido por play_card y resolve_copas_menu) saltaba
-- derecho a phase='closing' cuando la base que se acaba de completar era
-- la última de la mano (`v_nueva_base >= v_total_bases`), en vez de pasar
-- por 'resolving' como hace CUALQUIER otra base. Consecuencia visible: el
-- render de 'closing' en PantallaPartidaOnline.jsx siempre manda
-- `cartasMesa={[]}` a MesaCircular (esa fase muestra el resumen final de
-- la mano, no la mesa) — así que las cartas de esa última base
-- desaparecían apenas se completaba, sin la ventana de "Llevar base" que
-- toda base anterior sí tiene. Confirmado que esto NO es una regresión de
-- piece P (quitó un cuadro *redundante* de abajo de la mesa, sin tocar
-- esta lógica) ni de piece Q (animación de reparto, fase 'bidding', no
-- toca 'resolving'/'closing' para nada) — ambas piezas son de días
-- después de que este comportamiento ya existía.
--
-- Fix: resolve_trick SIEMPRE deja phase='resolving' al completar una base
-- (salvo que dispare oros_menu, sin cambios ahí). resolve_resolving —
-- hasta ahora solo alcanzable con más bases por jugar, así que asumía
-- ciegamente "hay una próxima" y volvía a phase='playing' — ahora sí
-- puede ser la última base de la mano (ya que resolve_trick ya no la
-- saltea), así que chequea total_bases y decide 'playing' vs 'closing'
-- igual que resolve_trick hacía antes.
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
  else
    -- Piece T: ya no hay un salto directo a 'closing' acá — toda base,
    -- incluida la última de la mano, pasa por 'resolving' primero.
    -- resolve_resolving decide de acá en más si la próxima fase es
    -- 'playing' (queda base) o 'closing' (era la última).
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

create or replace function resolve_resolving(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_room rooms;
  v_total_bases int;
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

  select * into v_room from rooms where id = p_room_id;
  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;

  update game_state
  set
    turn_seat = v_gs.last_trick_winner_seat,
    -- Piece T: antes esta rama era inalcanzable en la última base (resolve_
    -- trick nunca dejaba 'resolving' ahí) así que asumía sin chequear que
    -- siempre había una base siguiente. Ahora sí puede ser la última —
    -- mismo criterio (`base_num >= total_bases`) que resolve_trick usaba
    -- antes para decidir 'closing'.
    phase = case when v_gs.base_num >= v_total_bases then 'closing' else 'playing' end,
    updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;
