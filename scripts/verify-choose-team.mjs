// Verifies piece 5r (choose_team RPC, supabase/migrations/20260706160000_choose_team_rpc.sql)
// end-to-end against the real linked Supabase project — same approach as
// the other verify-*.mjs scripts in this repo (direct .rpc() calls, no
// Edge Function, no mocking).
//
// Usage: node --env-file=.env scripts/verify-choose-team.mjs
//
// Scenarios:
//   A. join_room no longer assigns seat/team — fresh players rows come
//      back with both null.
//   B. Two sessions call choose_team(0) (LOCAL) CONCURRENTLY (Promise.all,
//      not sequential) — this is the exact race the review flagged: both
//      RPC invocations start before either commits. Confirms the FOR
//      UPDATE lock on `rooms` actually serializes them: exactly one ends
//      up is_captain=true, and they land on distinct even seats (0 and 2),
//      never the same seat and never both captain.
//   C. A third session tries choose_team(0) on a now-full LOCAL (nJug=4 ->
//      cupo 2) -> team_full.
//   D. Two sessions call choose_team(1) (VISITANTE) concurrently -> same
//      seat/captain guarantees as B, on odd seats (1 and 3).
//   E. A player who already has a team calls choose_team again ->
//      already_chose_team. Invalid team index -> invalid_team.
//   F. deal_hand with only 3/4 players seated -> room_not_full (the
//      updated gate: row count alone isn't enough anymore, seat IS NOT
//      NULL is required). After the 4th seats in, deal_hand succeeds.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-choose-team.mjs");
  process.exit(1);
}

const N_JUG = 4;

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`    ok: ${label}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const clients = [];
  for (let i = 0; i < N_JUG; i++) {
    clients.push(await newSession());
    await sleep(300);
  }

  console.log("\nA. create_room + join_room x4 — seat/team should come back null");
  const room = await rpc(clients[0], "create_room", {
    p_config: { nJug: N_JUG, estructura: [1, 2, 3] },
  });
  const players = [];
  for (let i = 0; i < N_JUG; i++) {
    const p = await rpc(clients[i], "join_room", { p_code: room.code, p_name: `P${i}` });
    players.push(p);
    assertEq(p.seat, null, `P${i}.seat null after join`);
    assertEq(p.team, null, `P${i}.team null after join`);
    assertEq(p.is_captain, false, `P${i}.is_captain false after join`);
  }

  console.log("\nB. two sessions choose LOCAL (team 0) CONCURRENTLY");
  const [r0, r1] = await Promise.all([
    rpc(clients[0], "choose_team", { p_room_id: room.id, p_team: 0 }),
    rpc(clients[1], "choose_team", { p_room_id: room.id, p_team: 0 }),
  ]);
  const seatsLocal = [r0.seat, r1.seat].sort((a, b) => a - b);
  const captainsLocal = [r0.is_captain, r1.is_captain].filter(Boolean).length;
  assertEq(seatsLocal, [0, 2], "concurrent LOCAL picks land on distinct even seats {0,2}");
  assertEq(captainsLocal, 1, "concurrent LOCAL picks produce exactly one captain");

  console.log("\nC. third session tries LOCAL on a full team (cupo 2 for nJug=4)");
  await rpcExpectError(clients[2], "choose_team", { p_room_id: room.id, p_team: 0 }, "team_full");

  console.log("\nD. two sessions choose VISITANTE (team 1) CONCURRENTLY");
  const [r2, r3] = await Promise.all([
    rpc(clients[2], "choose_team", { p_room_id: room.id, p_team: 1 }),
    rpc(clients[3], "choose_team", { p_room_id: room.id, p_team: 1 }),
  ]);
  const seatsVisitante = [r2.seat, r3.seat].sort((a, b) => a - b);
  const captainsVisitante = [r2.is_captain, r3.is_captain].filter(Boolean).length;
  assertEq(seatsVisitante, [1, 3], "concurrent VISITANTE picks land on distinct odd seats {1,3}");
  assertEq(captainsVisitante, 1, "concurrent VISITANTE picks produce exactly one captain");

  console.log("\nE. already_chose_team / invalid_team");
  await rpcExpectError(clients[0], "choose_team", { p_room_id: room.id, p_team: 1 }, "already_chose_team");
  await rpcExpectError(clients[0], "choose_team", { p_room_id: room.id, p_team: 2 }, "invalid_team");

  console.log("\nF. deal_hand gate now requires seat assigned, not just a row");
  // Build a second room, seat only 3 of 4 players, confirm deal_hand still
  // refuses even though players count == nJug.
  const room2 = await rpc(clients[0], "create_room", {
    p_config: { nJug: N_JUG, estructura: [1, 2, 3] },
  });
  const clients2 = [];
  for (let i = 0; i < N_JUG; i++) {
    clients2.push(await newSession());
    await sleep(300);
  }
  for (let i = 0; i < N_JUG; i++) {
    await rpc(clients2[i], "join_room", { p_code: room2.code, p_name: `Q${i}` });
  }
  await rpc(clients2[0], "choose_team", { p_room_id: room2.id, p_team: 0 });
  await rpc(clients2[1], "choose_team", { p_room_id: room2.id, p_team: 1 });
  await rpc(clients2[2], "choose_team", { p_room_id: room2.id, p_team: 0 });
  // clients2[3] deliberately left unassigned — 4 players rows exist, only
  // 3 have a seat.
  await rpcExpectError(clients2[0], "deal_hand", { p_room_id: room2.id }, "room_not_full");
  await rpc(clients2[3], "choose_team", { p_room_id: room2.id, p_team: 1 });
  const gs = await rpc(clients2[0], "deal_hand", { p_room_id: room2.id });
  assert(gs.phase === "bidding", "deal_hand succeeds once all 4 seats are assigned");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
