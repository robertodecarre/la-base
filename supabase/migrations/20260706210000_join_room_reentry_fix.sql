-- La Base — piece M (batch overnight post-5r): join_room checked
-- v_room.status <> 'waiting' BEFORE checking whether the caller already
-- has a players row for this room. A returning member (reconnecting or
-- re-entering after "Salir de la sala" mid-game) was rejected with
-- room_not_open even though they already have a valid seat, purely
-- because the room had moved past 'waiting' — the exact case join_room's
-- own existing-membership branch exists to handle. Reordered so an
-- existing member always gets their row back regardless of room status;
-- only a brand-new joiner is subject to room_not_open (and, once past
-- that, room_full). Repeated whole (CREATE OR REPLACE requires the full
-- body) from the 20260706160000 version — no other change.
create or replace function join_room(p_code text, p_name text)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_existing players;
  v_count int;
  v_n_jug int;
  v_name text;
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_name := trim(p_name);
  if v_name = '' or char_length(v_name) > 20 then
    raise exception 'invalid_name';
  end if;

  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_existing from players where room_id = v_room.id and user_id = auth.uid();
  if found then
    return v_existing;
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
  end if;

  select count(*) into v_count from players where room_id = v_room.id;
  v_n_jug := (v_room.config->>'nJug')::int;
  if v_count >= v_n_jug then
    raise exception 'room_full';
  end if;

  insert into players (room_id, user_id, seat, team, name, is_captain)
  values (v_room.id, auth.uid(), null, null, v_name, false)
  returning * into v_player;

  return v_player;
end;
$$;
