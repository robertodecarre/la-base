-- La Base — piece E (batch overnight post-5r): role-gated room-control
-- actions, server-authoritative (matching this project's core rule — see
-- the carrier-gated Copas/Oros RPCs and resolve_resolving's
-- not_trick_winner for the established defense-in-depth pattern: the
-- client hides/disables the button for ineligible players, and the RPC
-- independently enforces the same restriction, so a direct RPC call can't
-- bypass it).
--
-- close_hand: was intentionally ungated ("any room member", see its own
-- 20260706120000 comment — mirrored the offline client's single shared
-- device with no distinguished actor). Now captain-only, either team.
--
-- deal_hand: only the "next hand" branch (v_gs found, phase='dealing')
-- gets a caller restriction — the caller's seat must equal
-- game_state.dealer_seat, i.e. only the player who will deal (and whose
-- seat the table already labels "PIE", pieIdx=dealer_seat in
-- MesaCircular.jsx) can trigger their own deal. The FIRST hand's branch
-- (v_gs not found) stays ungated on purpose: dealer_seat for hand 0 comes
-- from the sorteo, a separate flow this batch is explicitly not allowed to
-- touch, and every session already independently races to call deal_hand
-- there by existing design (PantallaOnlineSala.jsx's post-sorteo timer).
create or replace function close_hand(p_room_id uuid)
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
  v_total_bases int;
  v_estructura_len int;
  v_ped_team0 int;
  v_ped_team1 int;
  v_hecho_team0 int;
  v_hecho_team1 int;
  v_delta_team0 int;
  v_delta_team1 int;
  v_mano_team smallint;
  v_delta_mano int;
  v_no_declarado boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_room_member';
  end if;
  if not v_player.is_captain then
    raise exception 'close_hand_captain_only';
  end if;

  -- Locking convention (per deal_hand): rooms before game_state, since
  -- this RPC, like deal_hand, may update both.
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select * into v_gs from game_state where room_id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_gs.phase <> 'closing' then
    raise exception 'not_closing_phase';
  end if;

  v_n_jug := (v_room.config->>'nJug')::int;
  v_total_bases := (v_room.config->'estructura'->>v_gs.hand_number)::int;
  v_estructura_len := jsonb_array_length(v_room.config->'estructura');

  v_ped_team0 := (v_gs.bids->>'team0')::int;
  v_ped_team1 := (v_gs.bids->>'team1')::int;

  select
    coalesce(sum(tricks_won) filter (where team = 0), 0),
    coalesce(sum(tricks_won) filter (where team = 1), 0)
    into v_hecho_team0, v_hecho_team1
    from players where room_id = p_room_id;

  if v_hecho_team0 = v_ped_team0 and v_hecho_team1 <> v_ped_team1 then
    v_delta_team0 := 10 + v_hecho_team0;
    v_delta_team1 := -abs(v_hecho_team1 - v_ped_team1);
  elsif v_hecho_team1 = v_ped_team1 and v_hecho_team0 <> v_ped_team0 then
    v_delta_team0 := -abs(v_hecho_team0 - v_ped_team0);
    v_delta_team1 := 10 + v_hecho_team1;
  else
    v_delta_team0 := -abs(v_hecho_team0 - v_ped_team0);
    v_delta_team1 := -abs(v_hecho_team1 - v_ped_team1);
  end if;

  insert into hand_results (
    room_id, hand_number, cards_dealt, bid_team0, bid_team1, tricks_team0, tricks_team1, delta_team0, delta_team1
  ) values (
    p_room_id, v_gs.hand_number, v_total_bases, v_ped_team0, v_ped_team1, v_hecho_team0, v_hecho_team1, v_delta_team0, v_delta_team1
  );

  v_mano_team := v_gs.mano_seat % 2;
  v_delta_mano := case when v_mano_team = 0 then v_delta_team0 else v_delta_team1 end;
  v_no_declarado := (not v_gs.kamikaze_declared) and v_delta_mano <= -2;

  if v_no_declarado then
    update rooms set status = 'finished' where id = p_room_id;
    update game_state
    set phase = 'finished', end_cause = 'kamikaze', pending_action = null, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  elsif v_gs.hand_number + 1 >= v_estructura_len then
    update rooms set status = 'finished' where id = p_room_id;
    update game_state
    set phase = 'finished', end_cause = 'normal', pending_action = null, updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  else
    update game_state
    set
      hand_number = v_gs.hand_number + 1,
      dealer_seat = (v_gs.dealer_seat + 1) % v_n_jug,
      phase = 'dealing',
      updated_at = now()
    where room_id = p_room_id
    returning * into v_gs;
  end if;

  return v_gs;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- DEAL_HAND — adds the dealer-only gate on the next-hand branch. Full body
-- repeated (CREATE OR REPLACE requires it) on top of 20260706180000 —
-- diff against THAT migration, not an older one, if this needs to change
-- again (see the "why" comment in 20260706180000 about deal_hand's history
-- of losing logic across replacements written from a stale copy).
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
    room_id, hand_number, phase, dealer_seat, mano_seat, turn_seat,
    base_num, last_trick_winner_seat, bids, direction,
    kamikazes_remaining, kamikaze_declared, pending_action, end_cause, clock
  ) values (
    p_room_id, v_hand_number, 'bidding', v_dealer_seat, v_mano_seat, v_mano_seat,
    0, null, jsonb_build_object('team0', null, 'team1', null), 1,
    coalesce((v_room.config->>'kamikazes')::int, 0), false, null, null, v_clock_insert
  )
  on conflict (room_id) do update set
    hand_number = excluded.hand_number,
    phase = excluded.phase,
    dealer_seat = excluded.dealer_seat,
    mano_seat = excluded.mano_seat,
    turn_seat = excluded.turn_seat,
    base_num = 0,
    last_trick_winner_seat = null,
    bids = jsonb_build_object('team0', null, 'team1', null),
    direction = 1,
    kamikaze_declared = false,
    pending_action = null,
    end_cause = null,
    clock = v_clock_update,
    updated_at = now()
  returning * into v_gs;

  return v_gs;
end;
$$;
