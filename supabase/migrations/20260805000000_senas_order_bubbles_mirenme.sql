-- La Base — rediseño de barra de señas: orden de cards por drag (Señas),
-- viñetas de texto en gestos largos (Gestos), y el mecanismo real de
-- Mírenme (pedido de contacto visual por equipo, request/watch por
-- asiento — reemplaza el toggle global simplificado del mockup de diseño).
--
-- ════════════════════════════════════════════════════════════
-- ORDEN Y VIÑETAS — mismo jsonb que ya existe (rooms.senas_mapping,
-- 20260803000000_senas_appearance_rpcs.sql), no una tabla/columna
-- paralela. senas_mapping.team{N} es hoy un objeto plano {gestureKey:
-- label}; se agregan dos claves reservadas dentro de ESE mismo objeto —
-- "_order" (array de gestureKeys) y "_bubbles" ({gestureKey: {on, text}})
-- — seguro porque ningún GESTURE_KEYS real empieza con "_"
-- (src/components/ReactionFace.jsx). set_senas_order/set_senas_bubble
-- hacen jsonb_set puntual en su propia sub-clave, nunca tocan las
-- entradas de significado (`v_key`/label) que set_senas_mapping ya
-- escribe con jsonb_set(..., array[v_key], p_mapping, true) — las tres
-- RPCs pueden correr en cualquier orden sin pisarse entre sí.
--
-- A diferencia de set_senas_mapping (bloqueado a room.status='waiting' a
-- propósito — el significado de una seña es el código secreto del
-- equipo), orden y viñetas quedan SIN ese gate: son puramente de
-- presentación (cómo se ve la card, no qué significa), y la barra donde
-- se usan vive en la mesa real — el gate de set_senas_mapping haría
-- inservible arrastrar/editar viñetas durante la partida, que es
-- exactamente el punto de tenerlas ahí.
-- ════════════════════════════════════════════════════════════
create function set_senas_order(p_room_id uuid, p_order jsonb)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if v_player.team is null then
    raise exception 'no_team_chosen';
  end if;

  v_key := 'team' || v_player.team::text;

  update rooms
  set senas_mapping = jsonb_set(
    coalesce(senas_mapping, '{}'::jsonb),
    array[v_key],
    coalesce(senas_mapping->v_key, '{}'::jsonb) || jsonb_build_object('_order', p_order),
    true
  )
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

create function set_senas_bubble(p_room_id uuid, p_gesture_key text, p_on boolean, p_text text)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
  v_team_key text;
  v_team_obj jsonb;
  v_bubbles jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if v_player.team is null then
    raise exception 'no_team_chosen';
  end if;

  v_team_key := 'team' || v_player.team::text;
  v_team_obj := coalesce(v_room.senas_mapping->v_team_key, '{}'::jsonb);
  v_bubbles := coalesce(v_team_obj->'_bubbles', '{}'::jsonb);
  v_bubbles := jsonb_set(v_bubbles, array[p_gesture_key], jsonb_build_object('on', p_on, 'text', p_text), true);
  v_team_obj := v_team_obj || jsonb_build_object('_bubbles', v_bubbles);

  update rooms
  set senas_mapping = jsonb_set(coalesce(senas_mapping, '{}'::jsonb), array[v_team_key], v_team_obj, true)
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- MÍRENME — pedido de contacto visual por equipo. game_state.mirenme:
-- { "team0": { "<requesterSeat>": [watchingSeat, ...] }, "team1": {...} }.
-- La sola PRESENCIA de una clave de asiento (aunque su array esté vacío)
-- significa "ese pedido sigue activo" — es lo que permite volver a
-- apretar "Te miro" sobre el mismo pedido después de "dejar de ver", sin
-- que el pedido en sí haya desaparecido. Solo mirenme_request (cancelación
-- manual del propio dueño) borra la clave del todo. Vive en game_state
-- (no en rooms) porque el spec es explícito: el círculo rojo también
-- termina "cuando termina la mano" — mismo lugar/momento que
-- tricks_won se resetea, ver el on-conflict de deal_hand más abajo.
--
-- Visibilidad: NUNCA se expone al equipo rival — pero, igual que
-- senas_mapping hoy (confirmado leyendo la política RLS "room members can
-- see game state" en 20260706000000_online_multiplayer_schema.sql: toda
-- la fila de game_state ya es legible por cualquier miembro de la sala),
-- eso es una garantía de CLIENTE (cada sesión solo lee/renderiza
-- mirenme?.[su propio teamKey]), no una restricción server-side nueva —
-- mismo modelo de confianza que ya existe en este código para señas, no
-- un precedente distinto.
-- ════════════════════════════════════════════════════════════
alter table game_state add column mirenme jsonb not null default '{}'::jsonb;

-- Togglea MI PROPIO pedido. Si ya tengo uno activo: lo cancelo (manual,
-- tiene prioridad sobre quién me esté mirando en ese momento — spec: "at
-- any point if the original requester presses their own Mírenme button
-- again"). Si no: primero me saco de cualquier OTRO pedido que estuviera
-- mirando (exclusión mutua — no puedo tener pedido propio Y estar
-- mirando el de otro a la vez) y recién ahí abro el mío.
create function mirenme_request(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_team_key text;
  v_seat_key text;
  v_team_obj jsonb;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found or v_player.seat is null or v_player.team is null then
    raise exception 'not_room_member';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  v_team_key := 'team' || v_player.team::text;
  v_seat_key := v_player.seat::text;
  v_team_obj := coalesce(v_gs.mirenme->v_team_key, '{}'::jsonb);

  if v_team_obj ? v_seat_key then
    v_team_obj := v_team_obj - v_seat_key;
  else
    for v_key in select jsonb_object_keys(v_team_obj) loop
      v_team_obj := jsonb_set(v_team_obj, array[v_key], (
        select coalesce(jsonb_agg(w), '[]'::jsonb)
        from jsonb_array_elements_text(v_team_obj->v_key) w
        where w <> v_seat_key
      ));
    end loop;
    v_team_obj := v_team_obj || jsonb_build_object(v_seat_key, '[]'::jsonb);
  end if;

  update game_state
  set mirenme = jsonb_set(coalesce(mirenme, '{}'::jsonb), array[v_team_key], v_team_obj, true), updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;

-- "Te miro" sobre el pedido de un compañero. Un jugador puede mirar
-- varios pedidos distintos a la vez (el spec solo restringe pedido propio
-- + mirar a la vez, nunca mirar-múltiples) — sin límite acá a propósito.
create function mirenme_watch(p_room_id uuid, p_requester_seat int)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_team_key text;
  v_seat_key text;
  v_requester_key text;
  v_team_obj jsonb;
  v_watchers jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found or v_player.seat is null or v_player.team is null then
    raise exception 'not_room_member';
  end if;
  if p_requester_seat % 2 <> v_player.team or p_requester_seat = v_player.seat then
    raise exception 'invalid_requester_seat';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  v_team_key := 'team' || v_player.team::text;
  v_seat_key := v_player.seat::text;
  v_requester_key := p_requester_seat::text;
  v_team_obj := coalesce(v_gs.mirenme->v_team_key, '{}'::jsonb);

  if not (v_team_obj ? v_requester_key) then
    raise exception 'request_not_active';
  end if;

  -- exclusión mutua: mirar el pedido de otro cancela el mío propio, si tenía
  v_team_obj := v_team_obj - v_seat_key;

  v_watchers := coalesce(v_team_obj->v_requester_key, '[]'::jsonb);
  if not (select coalesce(bool_or(w = v_seat_key), false) from jsonb_array_elements_text(v_watchers) w) then
    v_watchers := v_watchers || to_jsonb(v_seat_key);
  end if;
  v_team_obj := jsonb_set(v_team_obj, array[v_requester_key], v_watchers);

  update game_state
  set mirenme = jsonb_set(coalesce(mirenme, '{}'::jsonb), array[v_team_key], v_team_obj, true), updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;

-- "Dejar de ver" un pedido puntual. Idempotente (no error si ya no lo
-- estaba mirando). A propósito NO borra la clave del pedido aunque el
-- array quede vacío — el dueño sigue pudiendo recibir más "Te miro"
-- después, y este mismo jugador puede volver a mirarlo (spec: "press Te
-- miro again on the same request"). Solo mirenme_request borra la clave.
create function mirenme_unwatch(p_room_id uuid, p_requester_seat int)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs game_state;
  v_player players;
  v_team_key text;
  v_seat_key text;
  v_requester_key text;
  v_team_obj jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found or v_player.seat is null or v_player.team is null then
    raise exception 'not_room_member';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  v_team_key := 'team' || v_player.team::text;
  v_seat_key := v_player.seat::text;
  v_requester_key := p_requester_seat::text;
  v_team_obj := coalesce(v_gs.mirenme->v_team_key, '{}'::jsonb);

  if v_team_obj ? v_requester_key then
    v_team_obj := jsonb_set(v_team_obj, array[v_requester_key], (
      select coalesce(jsonb_agg(w), '[]'::jsonb)
      from jsonb_array_elements_text(v_team_obj->v_requester_key) w
      where w <> v_seat_key
    ));
  end if;

  update game_state
  set mirenme = jsonb_set(coalesce(mirenme, '{}'::jsonb), array[v_team_key], v_team_obj, true), updated_at = now()
  where room_id = p_room_id
  returning * into v_gs;

  return v_gs;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- DEAL_HAND — full body repeated, diffed from 20260804000000_bid_mano_
-- seat_split.sql (confirmed live via grep across all migrations before
-- editing, per standing project convention — nothing newer touches this
-- function). ONLY change: the on-conflict-update clause now also resets
-- mirenme to '{}' at the start of every hand (the insert branch needs no
-- change, the column default already covers a brand-new game_state row).
-- Every other line is byte-for-byte the live body.
-- ════════════════════════════════════════════════════════════
create or replace function deal_hand(p_room_id uuid)
returns game_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_gs game_state;
  v_player players;
  v_n_jug int;
  v_dos_mazos boolean;
  v_hand_number int;
  v_dealer_seat int;
  v_mano_seat int;
  v_cards_dealt int;
  v_mazo jsonb;
  v_seat int;
  v_hand jsonb;
  v_player_count int;
  v_clock_enabled boolean;
  v_clock_seconds int;
  v_clock_insert jsonb;
  v_clock_update jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_dos_mazos := coalesce((v_room.config->>'dosMazos')::boolean, false);

  select * into v_gs from game_state where room_id = p_room_id for update;

  if not found then
    -- Primera mano de la partida: todavía no hay fila en game_state.
    -- Ungated a propósito (ver comentario de esta migración) — el dealer
    -- de la mano 0 sale del sorteo, no de una rotación previa.
    if v_room.status <> 'waiting' then
      raise exception 'room_not_open';
    end if;
    select count(*) into v_player_count from players where room_id = p_room_id and seat is not null;
    if v_player_count <> v_n_jug then
      raise exception 'room_not_full';
    end if;
    v_hand_number := 0;
    if v_room.sorteo_inicial is not null and v_room.sorteo_inicial ? 'ganador_seat' then
      v_dealer_seat := (v_room.sorteo_inicial->>'ganador_seat')::int;
    else
      v_dealer_seat := floor(random() * v_n_jug)::int;
    end if;
    update rooms set status = 'playing' where id = p_room_id;
  else
    -- Mano siguiente: hand_number/dealer_seat ya los dejó close_hand al
    -- terminar la mano anterior. Solo quien va a repartir (el asiento que
    -- la mesa ya etiqueta "PIE" para la mano que viene) puede disparar
    -- esto — piece E.
    if v_gs.phase <> 'dealing' then
      raise exception 'not_dealing_phase';
    end if;
    if v_player.seat <> v_gs.dealer_seat then
      raise exception 'deal_hand_dealer_only';
    end if;
    v_hand_number := v_gs.hand_number;
    v_dealer_seat := v_gs.dealer_seat;
  end if;

  -- Runs for both branches above: first-hand players all start at 0 anyway
  -- (redundant but harmless there), next-hand players get their per-hand
  -- counter cleared.
  update players set tricks_won = 0 where room_id = p_room_id;

  v_mano_seat := (v_dealer_seat + v_n_jug - 1) % v_n_jug;
  v_cards_dealt := (v_room.config->'estructura'->>v_hand_number)::int;

  v_clock_enabled := coalesce(jsonb_typeof(v_room.config->'clock'), '') = 'object';
  if v_clock_enabled then
    v_clock_seconds := coalesce((v_room.config->'clock'->>'minutos')::int, 0) * 60;
    v_clock_insert := jsonb_build_object(
      'teamTime', jsonb_build_array(v_clock_seconds, v_clock_seconds),
      'running', v_mano_seat % 2,
      'running_since', now(),
      'expired', jsonb_build_array(false, false)
    );
    v_clock_update := jsonb_build_object(
      'teamTime', coalesce(v_gs.clock->'teamTime', jsonb_build_array(v_clock_seconds, v_clock_seconds)),
      'running', v_mano_seat % 2,
      'running_since', now(),
      'expired', coalesce(v_gs.clock->'expired', jsonb_build_array(false, false))
    );
  else
    v_clock_insert := null;
    v_clock_update := null;
  end if;

  with palos(n, e, col) as (
    values
      ('Oros', '🟡', '#8B6914'),
      ('Copas', '🏆', '#c0392b'),
      ('Espadas', '⚔️', '#1a1a2e'),
      ('Bastos', '🪵', '#2d4a1e')
  ),
  valores1 as (select unnest(array[1,2,3,4,5,6,7,10,11,12]) as v),
  valores2 as (select unnest(array[2,3,4,5,6,7,10,11,12]) as v),
  mazo1 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 1
    ) as carta
    from palos p cross join valores1 v
  ),
  mazo2 as (
    select jsonb_build_object(
      'palo', jsonb_build_object('n', p.n, 'e', p.e, 'col', p.col),
      'valor', v.v, 'mazo', 2
    ) as carta
    from palos p cross join valores2 v
  ),
  todas as (
    select carta from mazo1
    union all
    select carta from mazo2 where v_dos_mazos
  ),
  numeradas as (
    select (row_number() over () - 1) as uid, carta from todas
  )
  select jsonb_agg(jsonb_set(carta, '{uid}', to_jsonb(uid)) order by random())
  into v_mazo
  from numeradas;

  if v_cards_dealt * v_n_jug > jsonb_array_length(v_mazo) then
    raise exception 'not_enough_cards';
  end if;

  for v_seat in 0 .. v_n_jug - 1 loop
    select jsonb_agg(elem) into v_hand
    from jsonb_array_elements(v_mazo) with ordinality as t(elem, ord)
    where ord > v_seat * v_cards_dealt and ord <= (v_seat + 1) * v_cards_dealt;

    insert into hands (room_id, player_id, user_id, hand_number, cards)
    select v_room.id, p.id, p.user_id, v_hand_number, coalesce(v_hand, '[]'::jsonb)
    from players p where p.room_id = v_room.id and p.seat = v_seat
    on conflict (room_id, player_id, hand_number) do update set cards = excluded.cards;
  end loop;

  insert into game_state (
    room_id, hand_number, phase, dealer_seat, mano_seat, bid_mano_seat, turn_seat,
    base_num, last_trick_winner_seat, bids, direction,
    kamikazes_remaining, kamikaze_declared, pending_action, end_cause, clock
  ) values (
    p_room_id, v_hand_number, 'bidding', v_dealer_seat, v_mano_seat, v_mano_seat, v_mano_seat,
    0, null, jsonb_build_object('team0', null, 'team1', null), 1,
    coalesce((v_room.config->>'kamikazes')::int, 0), false, null, null, v_clock_insert
  )
  on conflict (room_id) do update set
    hand_number = excluded.hand_number,
    phase = excluded.phase,
    dealer_seat = excluded.dealer_seat,
    mano_seat = excluded.mano_seat,
    bid_mano_seat = excluded.bid_mano_seat,
    turn_seat = excluded.turn_seat,
    base_num = 0,
    last_trick_winner_seat = null,
    bids = jsonb_build_object('team0', null, 'team1', null),
    direction = 1,
    kamikaze_declared = false,
    pending_action = null,
    end_cause = null,
    clock = v_clock_update,
    mirenme = '{}'::jsonb,
    updated_at = now()
  returning * into v_gs;

  return v_gs;
end;
$$;
