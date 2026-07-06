-- La Base — online multiplayer schema (phase A: schema + RLS only, no game logic yet)
--
-- Identity model: every client calls supabase.auth.signInAnonymously() once on
-- first load (no signup/login UI). That gives a stable auth.uid() which
-- supabase-js persists in localStorage for reconnect. All RLS below reduces
-- to comparisons against auth.uid() — this is what makes hand-hiding actually
-- enforceable, including over Realtime (custom headers are not forwarded
-- per-message by Realtime, only a connection-level JWT is).

-- ════════════════════════════════════════════════════════════
-- ROOMS
-- ════════════════════════════════════════════════════════════
create table rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  status      text not null default 'waiting'
                check (status in ('waiting', 'playing', 'finished')),
  -- Mirrors the exact shape PantallaInicio already produces, so phase B can
  -- feed this straight into the existing engine functions unchanged:
  -- { nJug, dosMazos, estructura: number[], ases: {espadas,copas,oros},
  --   kamikazes, clock: { habilitado, minutos, modo } }
  config      jsonb not null,
  created_at  timestamptz not null default now(),

  constraint rooms_code_format check (code ~ '^[A-Z2-9]{4,6}$')
);

comment on column rooms.code is 'Short human-typeable join code, uppercase letters/digits (ambiguous chars like 0/O/1/I excluded at generation time in app code).';

-- ════════════════════════════════════════════════════════════
-- PLAYERS
-- ════════════════════════════════════════════════════════════
create table players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  seat          int not null,
  team          smallint not null check (team in (0, 1)),
  name          text not null,
  is_captain    boolean not null default false,
  created_at    timestamptz not null default now(),

  unique (room_id, seat),
  unique (room_id, user_id)
);

-- At most one captain per team per room.
create unique index players_one_captain_per_team
  on players (room_id, team)
  where is_captain;

-- ════════════════════════════════════════════════════════════
-- MEMBERSHIP HELPER
-- SECURITY DEFINER so it can read `players` from inside a `players` RLS
-- policy without recursing into that same policy. Owned by the migration
-- role (table owner), which bypasses RLS by default — the standard
-- Supabase pattern for membership checks.
-- ════════════════════════════════════════════════════════════
create function is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- ════════════════════════════════════════════════════════════
-- GAME_STATE — one row per room; authoritative PUBLIC state.
-- Deliberately holds zero card data — only "whose turn / what phase".
-- ════════════════════════════════════════════════════════════
create table game_state (
  room_id                 uuid primary key references rooms(id) on delete cascade,
  hand_number             int not null default 0,
  phase                   text not null default 'dealing'
                            check (phase in (
                              'dealing', 'bidding', 'playing', 'resolving',
                              'closing', 'oros_menu', 'copas_menu',
                              'clock_expired', 'finished'
                            )),
  dealer_seat             int not null default 0,
  mano_seat               int not null default 0,
  turn_seat               int not null default 0,
  base_num                int not null default 0,
  last_trick_winner_seat  int,
  bids                    jsonb,               -- { team0: int, team1: int } | null
  direction               smallint not null default 1 check (direction in (1, -1)),
  kamikazes_remaining     int not null default 0,
  kamikaze_declared       boolean not null default false,
  -- Generalizes the As de Oros / As de Copas pending-decision menus, e.g.
  -- { type: 'oros_menu', carrier_seat, team } or
  -- { type: 'copas_menu', carrier_seat, pending_trick, pending_hands }
  pending_action          jsonb,
  clock                   jsonb,               -- { teamTime: [n0,n1], running: 0|1|null, expired: [bool,bool], slowMode }
  end_cause               text check (end_cause in ('normal', 'kamikaze')),
  updated_at              timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════
-- HAND_RESULTS — one row per hand once closed. Public (the "Tablero").
-- ════════════════════════════════════════════════════════════
create table hand_results (
  room_id       uuid not null references rooms(id) on delete cascade,
  hand_number   int not null,
  cards_dealt   int not null,
  bid_team0     int not null,
  bid_team1     int not null,
  tricks_team0  int not null,
  tricks_team1  int not null,
  delta_team0   int not null,
  delta_team1   int not null,

  primary key (room_id, hand_number)
);

-- ════════════════════════════════════════════════════════════
-- PLAYED_CARDS — trick history. Public once a card is played (the mesa).
-- ════════════════════════════════════════════════════════════
create table played_cards (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  hand_number   int not null,
  trick_number  int not null,
  seq_in_trick  int not null,
  card          jsonb not null,   -- { palo: {n,...}, valor, uid, mazo }
  played_at     timestamptz not null default now(),

  unique (room_id, hand_number, trick_number, seq_in_trick)
);

-- ════════════════════════════════════════════════════════════
-- HANDS — the sensitive table. A player's current cards.
-- user_id is denormalized (vs. joining through players) so the RLS
-- policy below is a single equality check — the whole security
-- guarantee should be readable at a glance.
-- ════════════════════════════════════════════════════════════
create table hands (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  hand_number   int not null,
  cards         jsonb not null,   -- array of { palo, valor, uid, mazo }, mutated as cards are played

  unique (room_id, player_id, hand_number)
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
alter table rooms         enable row level security;
alter table players       enable row level security;
alter table game_state    enable row level security;
alter table hand_results  enable row level security;
alter table played_cards  enable row level security;
alter table hands         enable row level security;

-- rooms: must be readable pre-join (to look up a room by code), and a
-- room code/config isn't sensitive — knowing the code already lets you
-- join. No UPDATE/DELETE policy: status transitions require server-side
-- validation and belong in phase B's RPCs.
create policy "rooms are publicly readable"
  on rooms for select
  using (true);

create policy "anyone can create a room"
  on rooms for insert
  with check (true);

-- players: room membership required to see the lobby/seating; a player
-- may only insert or update their own row.
create policy "room members can see all players in their room"
  on players for select
  using (is_room_member(room_id));

create policy "a player can join a room as themselves"
  on players for insert
  with check (user_id = auth.uid());

create policy "a player can update their own row"
  on players for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- game_state: public within the room, no client writes (phase B: RPCs only).
create policy "room members can see game state"
  on game_state for select
  using (is_room_member(room_id));

-- hand_results: public within the room, no client writes.
create policy "room members can see hand results"
  on hand_results for select
  using (is_room_member(room_id));

-- played_cards: public within the room, no client writes — inserting a
-- played card requires server-side validation (turn order, card ownership)
-- that belongs in a phase B RPC, not a raw client insert.
create policy "room members can see played cards"
  on played_cards for select
  using (is_room_member(room_id));

-- hands: THE core guarantee — a player can only ever see their own hand.
-- No insert/update policy: dealing and removing played cards happens only
-- through a future SECURITY DEFINER RPC.
create policy "a player can see only their own hand"
  on hands for select
  using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- REALTIME
-- Publish the public tables so clients can subscribe to postgres_changes.
-- `hands` is deliberately NOT added — even though Realtime would still
-- apply the SELECT policy per-subscriber, keeping it off the publication
-- means a player's hand can only ever be fetched by an explicit query,
-- never streamed, which removes an entire class of "did I subscribe
-- correctly" mistakes for the most sensitive table.
-- ════════════════════════════════════════════════════════════
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table game_state;
alter publication supabase_realtime add table hand_results;
alter publication supabase_realtime add table played_cards;
