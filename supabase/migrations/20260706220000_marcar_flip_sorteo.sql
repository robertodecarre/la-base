-- La Base — piece H (batch overnight post-5r): revela-a-tu-ritmo del
-- sorteo inicial. sortear_reparto_inicial ya resuelve cartas+ganador en
-- una sola pasada — esa lógica NO cambia acá. Lo que faltaba es un lugar
-- para que cada sesión avise "ya di vuelta mi carta", sincronizado por
-- Realtime para que el resto vea el progreso (no necesita posición/gesto
-- continuo, alcanza un boolean on/off por asiento — la sync continua es
-- la pieza J, todavía diferida).
--
-- Se apoya en rooms.sorteo_inicial (misma fila, ya viaja por la
-- suscripción a `rooms` que useSala ya tiene) en vez de una tabla/columna
-- nueva: cero plumbing de Realtime adicional. sorteo_inicial arranca sin
-- clave "flipped" (sortear_reparto_inicial no la escribe — no se le tocó
-- el cuerpo); esta RPC la crea sola en el primer flip de la sala vía el
-- `|| jsonb_build_object(...)` de abajo, así que un `flipped` ausente y un
-- `flipped` vacío son equivalentes desde el cliente (?? {}).
create or replace function marcar_flip_sorteo(p_room_id uuid)
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

  -- El asiento sale de la propia fila de players, no de un parámetro: así
  -- es estructuralmente imposible marcar el flip de otro asiento.
  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found or v_player.seat is null then
    raise exception 'not_room_member';
  end if;

  update rooms
  set sorteo_inicial = jsonb_set(
    v_room.sorteo_inicial || jsonb_build_object('flipped', coalesce(v_room.sorteo_inicial->'flipped', '{}'::jsonb)),
    array['flipped', v_player.seat::text],
    'true'::jsonb
  )
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;
