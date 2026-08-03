-- La Base — pieza J: apariencia de cara (customización en pantalla de
-- selección de equipo) + mapeo de señas por equipo (remapeo pre-partida).
--
-- appearance: { hairStyle, hairColor, glasses } — ver HAIR_STYLES/
-- HAIR_COLOR_KEYS en src/components/ReactionFace.jsx. Default 'pelado'/
-- 'castano'/false cuando la columna es null (ningún jugador la seteó
-- todavía), coherente con el estado inicial del selector en el cliente.
--
-- senas_mapping: { team0: {gestureKey: label, ...}, team1: {...} } —
-- guardado una sola vez por equipo, igual patrón que rooms.sorteo_inicial
-- (un jsonb en `rooms`, sin tabla nueva). Solo se puede escribir mientras
-- la sala sigue en 'waiting' (remapeo mid-partida está fuera de alcance a
-- propósito, ver spec de pieza J) — deal_hand pone status='playing' en la
-- primera mano, así que ese mismo flag alcanza para "todavía no arrancó".

alter table players add column appearance jsonb;
alter table rooms add column senas_mapping jsonb;

-- ════════════════════════════════════════════════════════════
-- SET_APPEARANCE — guarda la apariencia elegida para el propio jugador.
-- Sin gate de fase: es puramente cosmético (cómo se dibuja la cara en la
-- mesa), no afecta ninguna regla de juego, así que no hay ganancia en
-- restringir cuándo se puede cambiar.
-- ════════════════════════════════════════════════════════════
create function set_appearance(p_room_id uuid, p_appearance jsonb)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
  end if;

  update players
  set appearance = p_appearance
  where room_id = p_room_id and user_id = auth.uid()
  returning * into v_player;

  if not found then
    raise exception 'not_room_member';
  end if;

  return v_player;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- SET_SENAS_MAPPING — remapeo de señas, compartido por todo el equipo
-- (nunca por jugador). Solo el propio equipo del caller se toca (jsonb_set
-- puntual en 'team0'/'team1'), y solo mientras la sala sigue en 'waiting'.
-- ════════════════════════════════════════════════════════════
create function set_senas_mapping(p_room_id uuid, p_mapping jsonb)
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
  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
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
  set senas_mapping = jsonb_set(coalesce(senas_mapping, '{}'::jsonb), array[v_key], p_mapping, true)
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;
