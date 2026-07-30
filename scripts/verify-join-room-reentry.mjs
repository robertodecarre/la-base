// Verifies piece M's join_room fix end-to-end against the real linked
// Supabase project — direct .rpc() calls, same pattern as every other
// verify-*.mjs script here.
//
// Usage: node --env-file=.env scripts/verify-join-room-reentry.mjs
//
// Root cause: join_room checked v_room.status <> 'waiting' BEFORE checking
// whether the caller already had a players row. A returning member of a
// room that had left 'waiting' (game in progress or finished) was rejected
// with room_not_open even though they already had a valid seat. Fix
// reordered the checks so an existing member always gets their row back
// regardless of room status; only brand-new joiners are still subject to
// room_not_open/room_full.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-join-room-reentry.mjs");
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
async function playersForRoom(client, roomId) {
  const { data, error } = await client.from("players").select("*").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

async function main() {
  console.log("Signing in 6 anonymous sessions (4 players + 1 new joiner + 1 spare)...");
  const clients = [];
  for (let i = 0; i < 6; i++) { clients.push(await newSession()); await sleep(300); }
  const [p0, p1, p2, p3, newcomer, extra] = clients;

  const room = await rpc(p0, "create_room", { p_config: { nJug: 4, estructura: [1, 1] } });
  for (const c of [p0, p1, p2, p3]) await rpc(c, "join_room", { p_code: room.code, p_name: "P" });
  for (let i = 0; i < 4; i++) await rpc(clients[i], "choose_team", { p_room_id: room.id, p_team: i % 2 });

  console.log("\n1) room still 'waiting': a returning member's join_room still just returns their row");
  const before = await rpc(p0, "join_room", { p_code: room.code, p_name: "P" });
  assertEq(before.user_id, (await playersForRoom(p0, room.id)).find((x) => x.seat === 0).user_id, "returning member while waiting gets same row");

  console.log("\n2) room_full still blocks a brand-new joiner while waiting");
  await rpcExpectError(extra, "join_room", { p_code: room.code, p_name: "Extra" }, "room_full");

  let gs = await rpc(p0, "deal_hand", { p_room_id: room.id });
  assertEq(gs.phase, "bidding", "game started, room.status is now 'playing'");

  console.log("\n3) THE FIX: a returning member can still join_room after the room left 'waiting'");
  const rejoin = await rpc(p1, "join_room", { p_code: room.code, p_name: "P" });
  assertEq(rejoin.seat, 1, "existing member's row returned unchanged, mid-game");

  console.log("\n4) a genuinely new user is still rejected with room_not_open once the room isn't waiting");
  await rpcExpectError(extra, "join_room", { p_code: room.code, p_name: "Extra" }, "room_not_open");

  console.log("\n5) finish the game, then confirm a returning member can still 'rejoin' a finished room...");
  const manoTeam = gs.mano_seat % 2;
  const manoCaptainSeat = (await playersForRoom(p0, room.id)).find((p) => p.team === manoTeam && p.is_captain).seat;
  gs = await rpc(clients[manoCaptainSeat], "submit_bid", { p_room_id: room.id, p_value: 0 });
  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const { data: hand } = await clients[seat].from("hands").select("cards").eq("room_id", room.id).eq("hand_number", gs.hand_number).single();
    gs = await rpc(clients[seat], "play_card", { p_room_id: room.id, p_card_uid: hand.cards[0].uid });
  }
  const captainSeat = (await playersForRoom(p0, room.id)).find((p) => p.is_captain).seat;
  gs = await rpc(clients[captainSeat], "close_hand", { p_room_id: room.id });
  const dealerSeat = gs.dealer_seat;
  gs = await rpc(clients[dealerSeat], "deal_hand", { p_room_id: room.id });
  const manoTeam2 = gs.mano_seat % 2;
  const manoCaptainSeat2 = (await playersForRoom(p0, room.id)).find((p) => p.team === manoTeam2 && p.is_captain).seat;
  gs = await rpc(clients[manoCaptainSeat2], "submit_bid", { p_room_id: room.id, p_value: 0 });
  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const { data: hand } = await clients[seat].from("hands").select("cards").eq("room_id", room.id).eq("hand_number", gs.hand_number).single();
    gs = await rpc(clients[seat], "play_card", { p_room_id: room.id, p_card_uid: hand.cards[0].uid });
  }
  const captainSeat2 = (await playersForRoom(p0, room.id)).find((p) => p.is_captain).seat;
  gs = await rpc(clients[captainSeat2], "close_hand", { p_room_id: room.id });
  assertEq(gs.phase, "finished", "2-hand structure exhausted, game finished");

  const rejoinFinished = await rpc(p2, "join_room", { p_code: room.code, p_name: "P" });
  assertEq(rejoinFinished.seat, 2, "returning member can still join_room a finished room (harmless no-op)");

  console.log("    checking no meaningful RPC lets them do anything on a finished room...");
  await rpcExpectError(clients[dealerSeat], "deal_hand", { p_room_id: room.id }, "not_dealing_phase");
  await rpcExpectError(clients[captainSeat2], "close_hand", { p_room_id: room.id }, "not_closing_phase");
  await rpcExpectError(p2, "submit_bid", { p_room_id: room.id, p_value: 0 }, "not_bidding_phase");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
