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
//
// Repaired while re-running for the mano_seat/bid_mano_seat split batch
// (2026-08-04) — found stale in three unrelated ways, same drift as
// verify-oros-resolution.mjs before it was fixed: `resolverBase` no
// longer exists in src/engine/trick.js (removed with hotseat, piece 5q —
// this script now trusts the server's own last_trick_winner_seat instead
// of cross-checking against a client engine that no longer exists);
// `join_room` alone no longer assigns seat/team since piece 5r
// (choose_team does); and bidMano=0 against a 10-card hand always forces
// pie's bid to a single option (pie_forced_bid_auto_resolve,
// 20260706190000), auto-resolving both bids in mano's own submit_bid
// call, making the old second/pie submit_bid call redundant.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-resolving-resolution.mjs");
  process.exit(1);
}

const N_JUG = 4;
const ASES_OFF = { espadas: false, copas: false, oros: false };

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

// setupRoom(sessions, estructura) — bidMano=0 always forces pie's bid to a
// single option (total-1-mano) regardless of totalBases, so this works
// unchanged for both the multi-trick scenario (estructura=[10]) and the
// single-trick/last-base scenario (estructura=[1]).
async function setupRoom(sessions, estructura) {
  const config = { nJug: N_JUG, dosMazos: false, estructura, ases: ASES_OFF, kamikazes: 0 };
  const room = await rpc(sessions[0], "create_room", { p_config: config });

  const players = [];
  for (let i = 0; i < N_JUG; i++) {
    await rpc(sessions[i], "join_room", { p_code: room.code, p_name: `J${i}` });
    players.push(await rpc(sessions[i], "choose_team", { p_room_id: room.id, p_team: i % 2 }));
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });

  const teamMano = gs.mano_seat % 2;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team !== teamMano && p.is_captain);
  const bidMano = 0;
  const bidPie = estructura[gs.hand_number] - 1 - bidMano;
  gs = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  if (gs.phase === "bidding") {
    gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });
  }

  return { room, players, gs };
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  console.log("\n=== Scenario A: resolve_resolving after a plain (non-last-base) trick ===");
  const { room, gs: gs0 } = await setupRoom(sessions, [10]);

  let gs = gs0;
  const lastPlayerSeat = (gs0.mano_seat + 1) % N_JUG;

  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const cards = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cards[0].uid });
  }

  assertEq(gs.phase, "resolving", "phase after a plain trick completion");
  assertEq(gs.pending_action, null, "pending_action stays null (no decision was ever stored)");
  assertEq(gs.turn_seat, lastPlayerSeat, "turn_seat left stale at the trick's last player (confirms the gap)");

  const ganIdx = gs.last_trick_winner_seat;

  // Negative paths.
  const impostorSeat = (ganIdx + 1) % N_JUG;
  await assertRpcFails(
    sessions[impostorSeat].rpc("resolve_resolving", { p_room_id: room.id }),
    "resolve_resolving rejects a caller who isn't the trick winner"
  );

  const after = await rpc(sessions[ganIdx], "resolve_resolving", { p_room_id: room.id });
  assertEq(after.phase, "playing", "phase after resolve_resolving");
  assertEq(after.turn_seat, ganIdx, "turn_seat advanced to the trick winner");
  // mano_seat/bid_mano_seat split (batch fix post-pieza-J): mano_seat now
  // follows the ACTUAL trick winner too — regardless of team, this is the
  // exact "a normal base win should move MANO" bug Roberto reported.
  // bid_mano_seat stays exactly where deal_hand froze it, untouched by
  // any of this.
  assertEq(after.mano_seat, ganIdx, "mano_seat also follows the trick winner (job #3)");
  assertEq(after.bid_mano_seat, gs0.bid_mano_seat, "bid_mano_seat stays frozen at the hand's original bidding-time mano");

  // Calling again (phase is now 'playing', not 'resolving') should fail.
  await assertRpcFails(
    sessions[ganIdx].rpc("resolve_resolving", { p_room_id: room.id }),
    "resolve_resolving rejects a call outside the resolving phase"
  );

  console.log("\n=== Scenario B: the hand's LAST base skips 'resolving' (piece AA) — mano_seat must still move ===");
  // Found while auditing which file is live for resolve_trick (not the
  // original request, see 20260804010000_resolve_trick_last_base_mano_
  // seat.sql's header): a 1-card hand's only trick is also the hand's
  // LAST base, so resolve_trick routes it straight to 'closing' without
  // ever calling resolve_resolving — that branch needed its own mano_seat
  // fix, verified here directly rather than through Scenario A's path.
  const { room: room2, gs: gs0b } = await setupRoom(sessions, [1]);

  let gsB = gs0b;
  while (gsB.phase === "playing") {
    const seat = gsB.turn_seat;
    const cards = await myHand(sessions[seat], room2.id, gsB.hand_number);
    gsB = await rpc(sessions[seat], "play_card", { p_room_id: room2.id, p_card_uid: cards[0].uid });
  }

  assertEq(gsB.phase, "closing", "phase after the hand's only/last trick — direct to 'closing', no 'resolving' step");
  const ganIdxB = gsB.last_trick_winner_seat;
  assertEq(gsB.turn_seat, ganIdxB, "turn_seat set to the last trick's winner (unchanged behavior)");
  assertEq(gsB.mano_seat, ganIdxB, "mano_seat ALSO set to the last trick's winner (the fix)");
  assertEq(gsB.bid_mano_seat, gs0b.bid_mano_seat, "bid_mano_seat still frozen at hand start, even on the last-base path");
  // The whole point of the split: prove these two can genuinely differ.
  // Not guaranteed every run (the winner could coincidentally be the
  // original bid_mano_seat), so this is informational, not a hard assert.
  if (gsB.mano_seat !== gsB.bid_mano_seat) {
    console.log(`  info: mano_seat (${gsB.mano_seat}) diverged from bid_mano_seat (${gsB.bid_mano_seat}) this run — direct confirmation the two columns are truly independent now.`);
  }

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
