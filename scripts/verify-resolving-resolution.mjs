// Verifies piece 4e (resolve_resolving) end-to-end against the real linked
// Supabase project, same approach as verify-copas-resolution.mjs (4c) and
// verify-oros-resolution.mjs (4d).
//
// Usage: node --env-file=.env scripts/verify-resolving-resolution.mjs
//
// Confirmed by reading resolve_trick directly before implementing: the
// plain path (no Copas mid-trick trigger, no Oros post-trick trigger)
// sets phase='resolving' and last_trick_winner_seat, but pending_action
// stays null (no decision was ever stored) and turn_seat is left stale at
// whoever played the trick's last card. So unlike 4c/4d there's no
// pending_action shape to drive scenarios off of and no decision for the
// caller to make — resolve_resolving just needs turn_seat pushed to
// last_trick_winner_seat and phase back to 'playing', callable only by
// the trick winner (per the caller-authorization decision confirmed for
// piece 4e, matching the carrier-only pattern already used for
// resolve_copas_menu/resolve_oros_menu).
//
// ases.{espadas,copas,oros} are all off here — this script isn't
// exercising any ace superpower, just the plain resolution path, and
// disabling them removes any chance of an incidental copas_menu/
// oros_menu detour. With all three off, every attempt's first trick lands
// in 'resolving' deterministically (no retry loop needed, unlike the
// Copas/Oros scripts).
import { createClient } from "@supabase/supabase-js";
import { resolverBase } from "../src/engine/trick.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-resolving-resolution.mjs");
  process.exit(1);
}

const N_JUG = 4;
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [10],
  ases: { espadas: false, copas: false, oros: false },
  kamikazes: 0,
};

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ok: ${label} (${JSON.stringify(actual)})`);
}

async function assertRpcFails(promise, label) {
  const { error } = await promise;
  if (!error) throw new Error(`FAIL ${label}: expected an error, call succeeded`);
  console.log(`  ok: ${label} (${error.message})`);
}

async function newSession() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}

async function myHand(client, roomId, handNumber) {
  const { data, error } = await client
    .from("hands")
    .select("cards")
    .eq("room_id", roomId)
    .eq("hand_number", handNumber)
    .single();
  if (error) throw error;
  return data.cards;
}

async function playedCardsForTrick(client, roomId, handNumber, trickNumber) {
  const { data, error } = await client
    .from("played_cards")
    .select("seq_in_trick, card, player_id")
    .eq("room_id", roomId)
    .eq("hand_number", handNumber)
    .eq("trick_number", trickNumber)
    .order("seq_in_trick", { ascending: true });
  if (error) throw error;
  return data;
}

async function playersForRoom(client, roomId) {
  const { data, error } = await client.from("players").select("id, seat, team").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

async function setupRoom(sessions) {
  const room = await rpc(sessions[0], "create_room", { p_config: CONFIG });

  const players = [];
  for (let seat = 0; seat < N_JUG; seat++) {
    const p = await rpc(sessions[seat], "join_room", { p_code: room.code, p_name: `J${seat}` });
    players.push(p);
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });

  const teamMano = gs.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);
  const bidMano = 0;
  const bidPie = CONFIG.estructura[gs.hand_number] - 1 - bidMano;
  await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });

  return { room, players, gs };
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  console.log("\n=== Scenario: resolve_resolving after a plain (no-trigger) trick ===");
  const { room, players, gs: gs0 } = await setupRoom(sessions);

  let gs = gs0;
  const lastPlayerSeat = (() => {
    // direction=1 sequence from mano_seat decrements; the 4th/last seat to
    // act is mano_seat+1 mod n_jug (same derivation used in the Copas
    // script) — captured up front just to sanity-check turn_seat staleness.
    return (gs0.mano_seat + 1) % N_JUG;
  })();

  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const cards = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cards[0].uid });
  }

  assertEq(gs.phase, "resolving", "phase after a plain trick completion");
  assertEq(gs.pending_action, null, "pending_action stays null (no decision was ever stored)");
  assertEq(gs.turn_seat, lastPlayerSeat, "turn_seat left stale at the trick's last player (confirms the gap)");

  const trickCards = await playedCardsForTrick(sessions[0], room.id, gs0.hand_number, gs0.base_num);
  const allPlayers = await playersForRoom(sessions[0], room.id);
  const seatById = Object.fromEntries(allPlayers.map((p) => [p.id, p.seat]));
  const ronda = trickCards.map((pc) => ({ carta: pc.card, jugadorIdx: seatById[pc.player_id], orden: pc.seq_in_trick }));
  const { ganIdx } = resolverBase(ronda);
  assertEq(gs.last_trick_winner_seat, ganIdx, "last_trick_winner_seat matches independently recomputed resolverBase");

  // Negative paths.
  const impostorSeat = (ganIdx + 1) % N_JUG;
  await assertRpcFails(
    sessions[impostorSeat].rpc("resolve_resolving", { p_room_id: room.id }),
    "resolve_resolving rejects a caller who isn't the trick winner"
  );

  const after = await rpc(sessions[ganIdx], "resolve_resolving", { p_room_id: room.id });
  assertEq(after.phase, "playing", "phase after resolve_resolving");
  assertEq(after.turn_seat, ganIdx, "turn_seat advanced to the trick winner");

  // Calling again (phase is now 'playing', not 'resolving') should fail.
  await assertRpcFails(
    sessions[ganIdx].rpc("resolve_resolving", { p_room_id: room.id }),
    "resolve_resolving rejects a call outside the resolving phase"
  );

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
