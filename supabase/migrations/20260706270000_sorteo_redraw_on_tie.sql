-- La Base — piece CC (batch overnight post-5r): on a tie for highest
-- jerarquía in the sorteo inicial (dealer draw), redraw the ENTIRE table
-- — everyone gets a new card, not just the tied seats — instead of
-- resolving the tie by lowest seat number. Repeats until there's a
-- single strict winner, looped WITHIN this same call (no extra client
-- round-trips): the final cartas/ganador_seat written to
-- rooms.sorteo_inicial is always already tie-free, same contract as
-- before — SorteoAnimado.jsx (the client) never sees an intermediate
-- tied draw or knows a redraw happened at all.
--
-- Full body repeated (CREATE OR REPLACE requires it) — only the single
-- SELECT that used to run once now runs inside a LOOP with an exit
-- condition on a unique max, replacing the old "lowest seat wins ties"
-- tiebreak (`(array_agg(seat order by jer desc, seat asc))[1]` used to be
-- reached directly with ties still present; now it's only ever reached
-- once v_top_count = 1, at which point that same expression trivially
-- resolves to the lone winner — no other change to how the winner is
-- picked once there IS one).
create or replace function sortear_reparto_inicial(p_room_id uuid)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_n_jug int;
  v_dos_mazos boolean;
  v_cartas jsonb;
  v_ganador_seat int;
  v_top_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not is_room_member(p_room_id) then
    raise exception 'not_room_member';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  if v_room.sorteo_inicial is not null then
    return v_room;
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_dos_mazos := coalesce((v_room.config->>'dosMazos')::boolean, false);

  loop
    -- Mismo mazo que deal_hand (ver 20260706020000_deal_hand_rpc.sql):
    -- construirlo completo y barajarlo con order by random() en CADA
    -- vuelta del loop, aunque acá solo se usan las primeras v_n_jug
    -- cartas del barajo, una por asiento — un redraw real, no un ajuste
    -- parcial sobre la tirada anterior.
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
    barajado as (
      select carta, (row_number() over (order by random()) - 1) as seat
      from todas
    ),
    sorteo as (
      select seat, carta,
        -- misma jerarquía que src/engine/hierarchy.js: As de Bastos > todo,
        -- el resto ordena por valor.
        case when (carta->>'valor')::int = 1 and carta->'palo'->>'n' = 'Bastos'
          then 100 else (carta->>'valor')::int end as jer
      from barajado
      where seat < v_n_jug
    )
    select
      jsonb_agg(jsonb_build_object('seat', seat, 'carta', carta) order by seat),
      count(*) filter (where jer = (select max(s2.jer) from sorteo s2)),
      (array_agg(seat order by jer desc, seat asc))[1]
    into v_cartas, v_top_count, v_ganador_seat
    from sorteo;

    exit when v_top_count = 1;
  end loop;

  update rooms
  set sorteo_inicial = jsonb_build_object('cartas', v_cartas, 'ganador_seat', v_ganador_seat)
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;
