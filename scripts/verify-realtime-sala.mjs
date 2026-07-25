// Verifies piece 5a (src/hooks/useSala.js) end-to-end against the real
// linked Supabase project, same approach as the piece 4 verification
// scripts.
//
// Usage: node --env-file=.env scripts/verify-realtime-sala.mjs
//
// useSala is a React hook (useState/useEffect/useCallback) — there's no
// DOM or React renderer here to mount it in, so this script can't call
// useSala() directly. What actually needs verifying isn't React glue, it's
// the underlying Supabase behavior the hook is built on: does
// supabase.channel(...).on('postgres_changes', ...) really deliver
// rooms/players/game_state changes made by one session to a channel opened
// by a different session, and does `hands` really stay silent over
// Realtime the way the schema migration's publication comment promises.
// So this script exercises that subscription logic by hand, with the same
// filter shapes (`room_id=eq.${roomId}`) and event handling
// (INSERT/UPDATE/DELETE -> upsert/remove by key) the hook uses internally.
//
// Also unlike lib/rooms.js's crearSala()/unirseASala(), which go through
// the create-room/join-room Edge Functions using the src/lib/supabase.js
// singleton client (which reads import.meta.env, a Vite-only construct —
// it throws under plain `node`), this script calls create_room/join_room
// directly via supabase-js .rpc(), same as every other verify-*.mjs script
// in this repo. The Edge Functions are thin wrappers around those same
// RPCs (see supabase/functions/create-room|join-room/index.ts) plus
// config validation, so calling the RPCs directly exercises the same
// database-side behavior this script cares about.
//
// IMPORTANT discovery this script encodes, found while writing it: a
// channel that subscribes postgres_changes on a table NOT included in the
// `supabase_realtime` publication (`hands`) doesn't just silently omit
// that table's events — it silently kills delivery for every OTHER
// listener on the same channel too (status still reports SUBSCRIBED, no
// error is ever surfaced). Confirmed by hand: players+game_state alone on
// one channel delivered every event; adding a third `.on(..., 'hands', ...)`
// to that same channel made ALL THREE listeners go silent, while a
// dedicated channel with only the `hands` listener reported SUBSCRIBED and
// correctly received zero events without affecting anything else. This is
// exactly why useSala.js's single channel never subscribes to `hands` at
// all — it isn't just unnecessary (fetchMyHand() covers it), it would be
// actively harmful to every other table on that channel. Scenario C below
// uses a second, separate channel for this reason — not for tidiness, but
// because putting it on the main channel would invalidate scenarios A/B.
//
// Scenarios:
//   A. Room + player-join propagation: session 0 creates the room and
//      subscribes (main channel: rooms/players/game_state/played_cards,
//      same tables + filter shapes as useSala.js) BEFORE anyone joins;
//      sessions 0-3 then join_room in turn. Confirms session 0's channel
//      receives an INSERT for every players row (including its own),
//      matching the hook's aplicarCambio(prev, payload, ['id'])
//      upsert-by-id behavior.
//   B. game_state propagation: deal_hand (called by session 1, not the
//      subscriber) produces a game_state row session 0's main channel
//      observes.
//   C. `hands` stays off Realtime: on a SEPARATE, dedicated channel
//      (see above), the same deal_hand call that just inserted 4 rows into
//      `hands` produces zero events — proving the exclusion from
//      `supabase_realtime` actually holds, not just that nobody happened
//      to wire up a listener for it.
//   D. RLS backs fetchMyHand()'s single-row assumption: each session's own
//      unfiltered `select cards from hands where room_id=... and
//      hand_number=...` returns exactly one row (their own), never any
//      other seat's — the same query shape fetchMyHand() runs.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-realtime-sala.mjs");
  process.exit(1);
}

const N_JUG = 4;

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Anonymous sign-in is rate-limited per-project; four sessions signing in
// back-to-back (as every verify-*.mjs script here does) occasionally trips
// it, so retry with backoff rather than failing the whole run over it.
async function newSession(retries = 6) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { error } = await client.auth.signInAnonymously();
    if (!error) return client;
    if (error.status !== 429 || attempt === retries) throw error;
    await sleep(5000 * attempt);
  }
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}

// Waits until getCount() reaches minCount, or throws after timeoutMs —
// used for the positive propagation checks (A, B).
async function esperarHasta(getCount, minCount, timeoutMs, label) {
  const start = Date.now();
  while (getCount() < minCount) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`FAIL ${label}: expected >= ${minCount} events, got ${getCount()} after ${timeoutMs}ms`);
    }
    await sleep(100);
  }
  console.log(`    ok: ${label} (${getCount()} event(s) within ${Date.now() - start}ms)`);
}

// Confirms getCount() stays at 0 for the full window — used for the
// negative check (C), where "no event ever arrives" is the thing under
// test, so there's nothing to poll toward.
async function confirmarSilencio(getCount, windowMs, label) {
  await sleep(windowMs);
  assertEq(getCount(), 0, label);
}

function suscribirse(client, channelName, listeners) {
  return new Promise((resolve, reject) => {
    let builder = client.channel(channelName);
    for (const { table, filter, onEvent } of listeners) {
      builder = builder.on("postgres_changes", { event: "*", schema: "public", table, filter }, onEvent);
    }
    builder.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve(builder);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(err ?? new Error(status));
    });
  });
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  console.log("\n=== Scenario A/B/C/D: realtime propagation + hands exclusion + RLS ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: { espadas: false, copas: false, oros: false }, kamikazes: 0 };
  const room = await rpc(sessions[0], "create_room", { p_config: config });
  console.log(`  room=${room.code}`);

  // Main channel: exactly the tables useSala.js subscribes to (minus
  // `hands`, deliberately — see the header comment on why mixing it in
  // here would break this too).
  const principal = { players: [], game_state: [] };
  await suscribirse(sessions[0], `verify-sala:${room.id}`, [
    { table: "players", filter: `room_id=eq.${room.id}`, onEvent: (p) => principal.players.push(p) },
    { table: "game_state", filter: `room_id=eq.${room.id}`, onEvent: (p) => principal.game_state.push(p) },
  ]);
  console.log("  session 0 subscribed to the main channel (players + game_state), status SUBSCRIBED");

  // Dedicated channel, hands only — see header comment.
  const soloHands = { hands: [] };
  await suscribirse(sessions[0], `verify-sala-hands:${room.id}`, [
    { table: "hands", filter: `room_id=eq.${room.id}`, onEvent: (p) => soloHands.hands.push(p) },
  ]);
  console.log("  session 0 subscribed to a separate, hands-only channel, status SUBSCRIBED");

  // --- Scenario A ---
  for (let seat = 0; seat < N_JUG; seat++) {
    await rpc(sessions[seat], "join_room", { p_code: room.code, p_name: `J${seat}` });
  }
  await esperarHasta(() => principal.players.length, N_JUG, 8000, "session 0 observes an INSERT for every players row, including its own");
  const seatsSeen = principal.players.map((p) => p.new.seat).sort();
  assertEq(seatsSeen, [0, 1, 2, 3], "the INSERTs observed cover every seat exactly once");
  assertEq(principal.players.every((p) => p.eventType === "INSERT"), true, "all four are INSERT events (no unexpected UPDATE/DELETE noise)");

  // --- Scenario B ---
  const gs = await rpc(sessions[1], "deal_hand", { p_room_id: room.id }); // called by a non-subscriber session
  await esperarHasta(() => principal.game_state.length, 1, 8000, "session 0 observes deal_hand's game_state row, dealt by session 1");
  assertEq(principal.game_state[principal.game_state.length - 1].new.phase, "bidding", "the observed game_state row already reflects phase='bidding'");
  assertEq(gs.phase, "bidding", "sanity: deal_hand's own return value agrees");

  // --- Scenario C ---
  // deal_hand (just above) inserted 4 rows into `hands` in the same
  // transaction that produced the game_state row scenario B just confirmed
  // arrived. Reusing that same call as the trigger proves the *absence* of
  // hands events isn't just "we never triggered an insert" — the insert
  // for game_state that came out of the very same RPC call did arrive, on
  // the other channel.
  await confirmarSilencio(() => soloHands.hands.length, 3000, "no `hands` event arrived even though deal_hand just inserted into it (excluded from supabase_realtime, per schema migration)");

  // --- Scenario D ---
  for (let seat = 0; seat < N_JUG; seat++) {
    const { data, error } = await sessions[seat].from("hands").select("cards").eq("room_id", room.id).eq("hand_number", gs.hand_number);
    if (error) throw error;
    assertEq(data.length, 1, `seat ${seat}'s unfiltered select against hands returns exactly its own row (RLS), same query shape as fetchMyHand()`);
    assertEq(data[0].cards.length, config.estructura[0], `seat ${seat}'s hand has the dealt card count`);
  }

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
