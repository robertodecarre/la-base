// Verifies piece J (set_appearance / set_senas_mapping RPCs,
// supabase/migrations/20260803000000_senas_appearance_rpcs.sql) end-to-end
// against the real linked Supabase project — same approach as the other
// verify-*.mjs scripts in this repo (direct .rpc() calls, no Edge
// Function, no mocking).
//
// Usage: node --env-file=.env scripts/verify-senas-appearance.mjs
//
// Scenarios:
//   A. set_appearance persists {hairStyle,hairColor,glasses} on the
//      caller's own players row, visible to a fresh select by any room
//      member.
//   B. set_appearance cannot touch another player's row (nothing to
//      assert via RPC surface — it only ever updates auth.uid()'s own row
//      by construction; confirmed by re-reading P1's row unaffected after
//      P0 calls it).
//   C. set_senas_mapping writes only the caller's own team's key,
//      leaving the other team's key untouched.
//   D. set_senas_mapping refuses once room.status is no longer 'waiting'
//      (room_not_open) — deal_hand flips it.
//   E. set_senas_mapping refuses a player with no team yet (no_team_chosen).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-senas-appearance.mjs");
  process.exit(1);
}

const N_JUG = 4;

// jsonb round-trips don't preserve key order, so compare with keys sorted
// recursively rather than raw JSON.stringify (which is order-sensitive).
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = normalize(v[k]); return acc; }, {});
  }
  return v;
}

function assertEq(actual, expected, label) {
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
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

  console.log("\nSetup: create_room + join_room + choose_team x4");
  const room = await rpc(clients[0], "create_room", {
    p_config: { nJug: N_JUG, estructura: [1, 2, 3] },
  });
  for (let i = 0; i < N_JUG; i++) {
    await rpc(clients[i], "join_room", { p_code: room.code, p_name: `P${i}` });
  }
  await rpc(clients[0], "choose_team", { p_room_id: room.id, p_team: 0 }); // seat 0, LOCAL
  await rpc(clients[1], "choose_team", { p_room_id: room.id, p_team: 1 }); // seat 1, VISITANTE
  await rpc(clients[2], "choose_team", { p_room_id: room.id, p_team: 0 }); // seat 2, LOCAL
  await rpc(clients[3], "choose_team", { p_room_id: room.id, p_team: 1 }); // seat 3, VISITANTE

  console.log("\nA. set_appearance persists on caller's own row");
  const app0 = { hairStyle: "mohawk", hairColor: "rubio", glasses: true };
  const p0 = await rpc(clients[0], "set_appearance", { p_room_id: room.id, p_appearance: app0 });
  assertEq(p0.appearance, app0, "P0.appearance echoed back by RPC");
  const { data: reread0 } = await clients[1].from("players").select("appearance").eq("id", p0.id).single();
  assertEq(reread0.appearance, app0, "P0.appearance visible to a different room member");

  console.log("\nB. set_appearance never touches another player's row");
  const app1 = { hairStyle: "largo", hairColor: "negro", glasses: false };
  await rpc(clients[1], "set_appearance", { p_room_id: room.id, p_appearance: app1 });
  const { data: reread0b } = await clients[1].from("players").select("appearance").eq("id", p0.id).single();
  assertEq(reread0b.appearance, app0, "P0.appearance unaffected by P1's own set_appearance call");

  console.log("\nC. set_senas_mapping writes only the caller's team, leaves the other untouched");
  const mapLocal = { guino: "tengo 7 de oros", beso: "no tengo nada" };
  const roomAfterLocal = await rpc(clients[0], "set_senas_mapping", { p_room_id: room.id, p_mapping: mapLocal });
  assertEq(roomAfterLocal.senas_mapping.team0, mapLocal, "team0 mapping stored");
  assertEq(roomAfterLocal.senas_mapping.team1 ?? null, null, "team1 mapping still absent");

  const mapVisitante = { wow: "arranco kamikaze" };
  const roomAfterVisitante = await rpc(clients[1], "set_senas_mapping", { p_room_id: room.id, p_mapping: mapVisitante });
  assertEq(roomAfterVisitante.senas_mapping.team0, mapLocal, "team0 mapping untouched by team1's write");
  assertEq(roomAfterVisitante.senas_mapping.team1, mapVisitante, "team1 mapping stored");

  console.log("\nD/E setup: a fresh room to check gates without disturbing the mapping above");
  const room2 = await rpc(clients[0], "create_room", { p_config: { nJug: N_JUG, estructura: [1, 2, 3] } });
  const clients2 = [];
  for (let i = 0; i < N_JUG; i++) {
    clients2.push(await newSession());
    await sleep(300);
  }
  for (let i = 0; i < N_JUG; i++) {
    await rpc(clients2[i], "join_room", { p_code: room2.code, p_name: `Q${i}` });
  }

  console.log("\nE. set_senas_mapping refuses a player with no team yet");
  await rpcExpectError(clients2[0], "set_senas_mapping", { p_room_id: room2.id, p_mapping: {} }, "no_team_chosen");

  await rpc(clients2[0], "choose_team", { p_room_id: room2.id, p_team: 0 });
  await rpc(clients2[1], "choose_team", { p_room_id: room2.id, p_team: 1 });
  await rpc(clients2[2], "choose_team", { p_room_id: room2.id, p_team: 0 });
  await rpc(clients2[3], "choose_team", { p_room_id: room2.id, p_team: 1 });

  console.log("\nD. set_senas_mapping refuses once the room is no longer 'waiting'");
  await rpc(clients2[0], "sortear_reparto_inicial", { p_room_id: room2.id });
  await rpc(clients2[0], "deal_hand", { p_room_id: room2.id });
  await rpcExpectError(clients2[0], "set_senas_mapping", { p_room_id: room2.id, p_mapping: { guino: "x" } }, "room_not_open");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
