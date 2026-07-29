// Verifies piece E's server-side role gates (batch overnight post-5r) end-
// to-end against the real linked Supabase project — direct .rpc() calls,
// same pattern as every other verify-*.mjs script here.
//
// Usage: node --env-file=.env scripts/verify-captain-dealer-gates.mjs
//
// close_hand: only a captain (either team) may call it — a non-captain
// room member is rejected with close_hand_captain_only.
// deal_hand (next-hand branch only): only the player whose seat equals
// game_state.dealer_seat may call it — anyone else is rejected with
// deal_hand_dealer_only. The first-hand branch stays ungated (untouched by
// this piece, verified elsewhere).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-captain-dealer-gates.mjs");
  process.exit(1);
}

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
async function rpcExpectError(client, fn, args, expectedMessage) {
  const { data, error } = await client.rpc(fn, args);
  if (!error) throw new Error(`FAIL ${fn}: expected error "${expectedMessage}", got success ${JSON.stringify(data)}`);
  assertEq(error.message, expectedMessage, `${fn} -> ${expectedMessage}`);
}
async function myHand(client, roomId, handNumber) {
  const { data, error } = await client.from("hands").select("cards").eq("room_id", roomId).eq("hand_number", handNumber).single();
  if (error) throw error;
  return data.cards;
}
async function playersForRoom(client, roomId) {
  const { data, error } = await client.from("players").select("*").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

async function playOneTrick(clients, seatOf, room, gs0) {
  let gs = gs0;
  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const client = seatOf[seat];
    const hand = await myHand(client, room.id, gs.hand_number);
    gs = await rpc(client, "play_card", { p_room_id: room.id, p_card_uid: hand[0].uid });
  }
  return gs;
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const clients = [];
  for (let i = 0; i < 4; i++) { clients.push(await newSession()); await sleep(300); }

  const room = await rpc(clients[0], "create_room", { p_config: { nJug: 4, estructura: [1, 1] } });
  for (let i = 0; i < 4; i++) await rpc(clients[i], "join_room", { p_code: room.code, p_name: `P${i}` });
  for (let i = 0; i < 4; i++) await rpc(clients[i], "choose_team", { p_room_id: room.id, p_team: i % 2 });
  const players = await playersForRoom(clients[0], room.id);
  const seatOf = {};
  for (const p of players) seatOf[p.seat] = clients[players.findIndex((x) => x.id === p.id)];
  // seatOf built via findIndex against `players` (order matches join order
  // == seat, per choose_team's invariant) — but clients[] is also in that
  // same order, so simplest is just clients[seat] directly.
  const clientOfSeat = (seat) => clients[seat];

  let gs = await rpc(clients[0], "deal_hand", { p_room_id: room.id });
  const manoTeam = gs.mano_seat % 2;
  const manoCaptainSeat = players.find((p) => p.team === manoTeam && p.is_captain).seat;
  gs = await rpc(clientOfSeat(manoCaptainSeat), "submit_bid", { p_room_id: room.id, p_value: 0 });
  assertEq(gs.phase, "playing", "1-card hand auto-resolved pie's bid (piece D), phase is playing");

  gs = await playOneTrick(clients, { [0]: clientOfSeat(0), [1]: clientOfSeat(1), [2]: clientOfSeat(2), [3]: clientOfSeat(3) }, room, gs);
  assertEq(gs.phase, "closing", "phase after the hand's only trick");

  console.log("\nclose_hand: non-captain rejected, captain succeeds");
  const players2 = await playersForRoom(clients[0], room.id);
  const nonCaptainSeat = players2.find((p) => !p.is_captain).seat;
  const someCaptainSeat = players2.find((p) => p.is_captain).seat;
  await rpcExpectError(clientOfSeat(nonCaptainSeat), "close_hand", { p_room_id: room.id }, "close_hand_captain_only");
  const afterClose = await rpc(clientOfSeat(someCaptainSeat), "close_hand", { p_room_id: room.id });
  assertEq(afterClose.phase, "dealing", "close_hand succeeded for a captain, phase is dealing for hand 2");

  console.log("\ndeal_hand (next-hand branch): non-dealer rejected, the actual next dealer succeeds");
  const nextDealerSeat = afterClose.dealer_seat;
  const impostorSeat = (nextDealerSeat + 1) % 4;
  await rpcExpectError(clientOfSeat(impostorSeat), "deal_hand", { p_room_id: room.id }, "deal_hand_dealer_only");
  const afterDeal = await rpc(clientOfSeat(nextDealerSeat), "deal_hand", { p_room_id: room.id });
  assertEq(afterDeal.phase, "bidding", "deal_hand succeeded for the actual next dealer");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
