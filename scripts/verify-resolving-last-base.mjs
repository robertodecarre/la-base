// Verifies piece AA's behavior end-to-end against the real linked
// Supabase project: completing a hand's LAST base goes DIRECTLY to
// 'closing' (turn_seat handed to the winner, same as resolve_resolving
// used to do) — no "Llevar base"/resolve_resolving step for the last
// base. Every other (non-last) base is unchanged: still lands on
// 'resolving' and needs the winner to call resolve_resolving.
//
// This supersedes piece T's fix (20260706240000): piece T made the last
// base land on 'resolving' too, specifically so its cards wouldn't vanish
// before a confirmation click — at the time the only way to reach
// 'closing' without an unconfirmed base was through the manual Llevar-base
// step. Piece AA (20260706250000) removes that step for the last base
// specifically (per product spec: no "Llevar base" for the last base, only
// "Cerrar mano") and instead fixes cards-vanishing client-side (the
// 'closing' render in PantallaPartidaOnline.jsx now shows the last base's
// played cards + winner instead of clearing the table) — so resolve_trick
// can go straight to 'closing' again for the last base without
// reintroducing piece T's original bug.
//
// estructura=[2,2]: 2 bases in hand 0 — base 0 exercises the unchanged
// "not the last base" path, base 1 is the one piece AA targets. A second
// hand [2] is only there so close_hand's "not the last hand" branch
// lands on phase='dealing' instead of 'finished', so this script can
// assert close_hand succeeds right after the state resolve_trick now
// leaves the last base in. ases all off to avoid any copas_menu/oros_menu
// detour.
//
// Usage: node --env-file=.env scripts/verify-resolving-last-base.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const N_JUG = 4;
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [2, 2],
  ases: { espadas: false, copas: false, oros: false },
  kamikazes: 0,
};

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ok: ${label} (${JSON.stringify(actual)})`);
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

async function playTrick(sessions, room, gs) {
  const startBase = gs.base_num;
  while (gs.phase === "playing" && gs.base_num === startBase) {
    const seat = gs.turn_seat;
    const cards = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cards[0].uid });
  }
  return gs;
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  const room = await rpc(sessions[0], "create_room", { p_config: CONFIG });
  for (let i = 0; i < N_JUG; i++) {
    await rpc(sessions[i], "join_room", { p_code: room.code, p_name: `J${i}` });
  }
  const players = [];
  for (let i = 0; i < N_JUG; i++) {
    players.push(await rpc(sessions[i], "choose_team", { p_room_id: room.id, p_team: i % 2 }));
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });
  const teamMano = gs.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);
  await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 1, p_kamikaze: false });
  gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: 0, p_kamikaze: false });

  console.log("\n=== Base 0 of 2 (not the last base — unchanged behavior) ===");
  gs = await playTrick(sessions, room, gs);
  assertEq(gs.phase, "resolving", "phase after base 0 completes");
  assertEq(gs.base_num, 1, "base_num advanced to 1");
  const winner0 = gs.last_trick_winner_seat;
  const trick0Cards = await playedCardsForTrick(sessions[0], room.id, gs.hand_number, 0);
  assertEq(trick0Cards.length, N_JUG, "base 0's played_cards are all still there for resolving to show");

  gs = await rpc(sessions[winner0], "resolve_resolving", { p_room_id: room.id });
  assertEq(gs.phase, "playing", "phase after resolve_resolving on a non-last base");
  assertEq(gs.turn_seat, winner0, "turn_seat handed to base 0's winner");

  console.log("\n=== Base 1 of 2 (THE LAST BASE — piece AA) ===");
  gs = await playTrick(sessions, room, gs);
  assertEq(gs.phase, "closing", "phase after the LAST base completes — direct to 'closing', no 'resolving'/Llevar-base step");
  assertEq(gs.base_num, 2, "base_num advanced to 2 (== total_bases)");
  const winner1 = gs.last_trick_winner_seat;
  assertEq(gs.turn_seat, winner1, "turn_seat handed to the last base's winner, same as resolve_resolving used to do");
  const trick1Cards = await playedCardsForTrick(sessions[0], room.id, gs.hand_number, 1);
  assertEq(trick1Cards.length, N_JUG, "the last base's played_cards are queryable while already in 'closing' — this is what the client now renders instead of an empty table");

  // resolve_resolving is no longer the way to leave the last base's
  // 'resolving' — it's never reached, so calling it here must fail
  // (phase is already 'closing', not 'resolving').
  const { error: staleResolvingErr } = await sessions[winner1].rpc("resolve_resolving", { p_room_id: room.id });
  if (!staleResolvingErr) throw new Error("FAIL: resolve_resolving succeeded after the last base, but phase should already be 'closing'");
  console.log(`  ok: resolve_resolving correctly rejected post-last-base (${staleResolvingErr.message})`);

  // Only a captain can close the hand — unchanged gate, now reachable
  // straight from the last base's trick resolution with no extra step.
  const nonCaptainSeat = players.find((p) => !p.is_captain).seat;
  const { error: nonCaptainErr } = await sessions[nonCaptainSeat].rpc("close_hand", { p_room_id: room.id });
  if (!nonCaptainErr) throw new Error("FAIL: a non-captain was able to close the hand");
  console.log(`  ok: close_hand still rejects a non-captain (${nonCaptainErr.message})`);

  // Piece LL: close_hand now needs a captain of EACH team to confirm —
  // the first call marks only that captain's team and leaves phase
  // untouched at 'closing'; only the second (the other team's captain)
  // actually runs the transition.
  const captains = players.filter((p) => p.is_captain);
  assertEq(captains.length, 2, "exactly 2 captains (one per team)");
  gs = await rpc(sessions[captains[0].seat], "close_hand", { p_room_id: room.id });
  assertEq(gs.phase, "closing", "phase stays 'closing' after only one captain confirms");
  gs = await rpc(sessions[captains[1].seat], "close_hand", { p_room_id: room.id });
  assertEq(gs.phase, "dealing", "close_hand succeeds once BOTH captains confirm, directly from the state left by the last base's trick resolution");

  console.log("\nALL CHECKS PASSED against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
