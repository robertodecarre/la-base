-- La Base — piece R (batch overnight post-5r): el sorteo ya no avanza solo
-- con un timer fijo apenas aparece rooms.sorteo_inicial (ver comentario en
-- PantallaOnlineSala.jsx sobre el timeout de 3s que existía). Ahora la
-- mano recién se reparte cuando los nJug asientos confirmaron
-- "ARRANCAMOS" a propósito, mismo patrón que marcar_flip_sorteo (piece H):
-- boolean on/off por asiento adentro de rooms.sorteo_inicial, sin tabla ni
-- columna nueva, sincronizado por la misma suscripción a `rooms` que
-- useSala ya tiene. El asiento sale de la propia fila de players, no de un
-- parámetro — estructuralmente imposible confirmar el arranque de otro
-- asiento.
create or replace function marcar_arrancamos_sorteo(p_room_id uuid)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.sorteo_inicial is null then
    raise exception 'sorteo_not_ready';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found or v_player.seat is null then
    raise exception 'not_room_member';
  end if;

  update rooms
  set sorteo_inicial = jsonb_set(
    v_room.sorteo_inicial || jsonb_build_object('arrancamos', coalesce(v_room.sorteo_inicial->'arrancamos', '{}'::jsonb)),
    array['arrancamos', v_player.seat::text],
    'true'::jsonb
  )
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;
