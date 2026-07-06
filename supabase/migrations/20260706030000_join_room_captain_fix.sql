-- La Base — phase B, piece 2 prerequisite: captain auto-assignment.
--
-- submit_bid (next migration) needs to check players.is_captain, but
-- join_room always inserted is_captain = false — nobody could ever be a
-- captain. Fix: since seats are assigned sequentially by join order and
-- team = seat % 2, seat 0 is always the first player to join team 0 and
-- seat 1 is always the first to join team 1. So "first player of each
-- team becomes that team's captain" falls out of the existing seat
-- assignment for free, no separate action/RPC needed.
--
-- Full function body is repeated (CREATE OR REPLACE requires it) — the
-- only change from the phase-B-piece-0 version is the literal `false` on
-- the players insert becoming `v_seat < 2`.
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
  v_seat int;
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
  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
  end if;

  select * into v_existing from players where room_id = v_room.id and user_id = auth.uid();
  if found then
    return v_existing;
  end if;

  select count(*) into v_count from players where room_id = v_room.id;
  v_n_jug := (v_room.config->>'nJug')::int;
  if v_count >= v_n_jug then
    raise exception 'room_full';
  end if;

  v_seat := v_count;

  insert into players (room_id, user_id, seat, team, name, is_captain)
  values (v_room.id, auth.uid(), v_seat, v_seat % 2, v_name, v_seat < 2)
  returning * into v_player;

  return v_player;
end;
$$;
