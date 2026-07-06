-- La Base — phase B, step 1: room creation and joining.
--
-- Both actions are exposed only through SECURITY DEFINER functions, called
-- by Edge Functions on the caller's behalf (forwarding their JWT, so
-- auth.uid() inside these functions is the real joining player). The blanket
-- "anyone can insert" policies from phase A are removed: rooms/players rows
-- can now only be created through create_room/join_room, which is where the
-- actual business-rule validation lives (shared with the client's engine/
-- code, in the Edge Functions — see supabase/functions/*/index.ts).
--
-- The checks in these functions are deliberately light (shape/bounds
-- sanity, not the full maxCartas/ESTRUCTURAS rules) — that full validation
-- runs once, in TypeScript, in the Edge Function, reusing the same
-- src/engine/structures.js the client and the hotseat mode use. Re-deriving
-- it here in SQL would recreate the exact "same rule in two languages"
-- duplication risk the engine/ extraction was meant to avoid. These are a
-- defense-in-depth backstop against something reaching the RPC without
-- going through that validation, not the source of truth for the rules.

-- ════════════════════════════════════════════════════════════
-- ROOM CODE GENERATION
-- ════════════════════════════════════════════════════════════
create function generate_room_code()
returns text
language sql
volatile
as $$
  -- Alfabeto sin ambiguos: sin 0/O, 1/I/L.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random()*31)::int + 1, 1), '')
  from generate_series(1, 5);
$$;

-- ════════════════════════════════════════════════════════════
-- CREATE ROOM
-- ════════════════════════════════════════════════════════════
create function create_room(p_config jsonb)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_room rooms;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid_config';
  end if;
  if not (p_config ? 'nJug') or not ((p_config->>'nJug')::int in (4, 6, 8)) then
    raise exception 'invalid_config';
  end if;
  if not (p_config ? 'estructura') or jsonb_typeof(p_config->'estructura') <> 'array'
     or jsonb_array_length(p_config->'estructura') = 0 then
    raise exception 'invalid_config';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := generate_room_code();
    begin
      insert into rooms (code, status, config)
      values (v_code, 'waiting', p_config)
      returning * into v_room;
      return v_room;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'could_not_allocate_code';
      end if;
      -- colisión de código: reintenta con uno nuevo
    end;
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- JOIN ROOM
-- ════════════════════════════════════════════════════════════
create function join_room(p_code text, p_name text)
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

  -- Bloquea la fila de la sala para serializar joins concurrentes a la
  -- misma sala (asignación de asiento) sin afectar a otras salas.
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'room_not_open';
  end if;

  -- Reconexión: si este dispositivo (auth.uid()) ya tiene un asiento acá,
  -- se lo devuelve tal cual en vez de crear uno nuevo.
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
  values (v_room.id, auth.uid(), v_seat, v_seat % 2, v_name, false)
  returning * into v_player;

  return v_player;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- RLS: las policies de insert directo quedan reemplazadas por las RPCs.
-- ════════════════════════════════════════════════════════════
drop policy "anyone can create a room" on rooms;
drop policy "a player can join a room as themselves" on players;
