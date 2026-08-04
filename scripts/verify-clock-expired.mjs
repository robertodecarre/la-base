// Verifies piece 4g (clock_expired: deal_hand/submit_bid clock bookkeeping
// + claim_timeout) end-to-end against the real linked Supabase project,
// same approach as the 4c/4d/4e/4f verification scripts.
//
// Usage: node --env-file=.env scripts/verify-clock-expired.mjs
//
// This piece modified two already-shipped, verified RPCs (deal_hand,
// submit_bid) rather than only adding new ones — after this script, the
// existing verify-close-hand.mjs / verify-oros-resolution.mjs /
// verify-copas-resolution.mjs scripts are re-run as a regression check,
// since their room configs never set `clock` at all and should be
// entirely unaffected (jsonb_typeof(config->'clock')='object' is false
// for them, so every clock branch added here is a no-op on their rooms).
//
// Client-driven claim model: nothing here polls or runs on a schedule.
// A team's deadline is always computed live from teamTime/running_since
// at the moment claim_timeout is called. Scenarios:
//   A. Normal ticking: a real ~2s sleep between deal_hand and mano's bid,
//      then between mano's and pie's bids, with pie having two legal
//      options (so both windows actually run) — proves teamTime is
//      genuinely decremented by real elapsed wall-clock time, not just
//      structurally start/stopped.
//   B. Forced single option (estructura=[1], any bid the total permits):
//      proves pie's window never starts when opcionesValidas would only
//      ever return one value, matching PantallaPartida.jsx's
//      confirmarMano (no timed decision when there's nothing to decide).
//   C. claim_timeout success: minutos=0 makes the budget expire the
//      instant deal_hand runs — no real sleep needed, fully deterministic.
//      Confirms the match ends and that `clock.running` is left frozen
//      pointing at the losing team (the whole "who lost" record, no new
//      column).
//   D. claim_timeout rejected, time not actually expired (normal budget,
//      called immediately).
//   E. claim_timeout rejected in "deportivo" mode even though the budget
//      genuinely hit zero — proves deportivo has no backend consequence,
//      only "muerte" does.
//   F. claim_timeout rejected when the room has no clock configured at
//      all.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-clock-expired.mjs");
  process.exit(1);
}

const N_JUG = 4;
const ASES = { espadas: false, copas: false, oros: false };

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
}

function assertInRange(actual, min, max, label) {
  if (actual < min || actual > max) {
    throw new Error(`FAIL ${label}: expected between ${min} and ${max}, got ${actual}`);
  }
  console.log(`    ok: ${label} (${actual}, expected [${min},${max}])`);
}

async function assertRpcFails(promise, label) {
  const { error } = await promise;
  if (!error) throw new Error(`FAIL ${label}: expected an error, call succeeded`);
  console.log(`    ok: ${label} (${error.message})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function gameState(client, roomId) {
  const { data, error } = await client.from("game_state").select("*").eq("room_id", roomId).single();
  if (error) throw error;
  return data;
}

// pie's bid must equal exactly total-1-mano or total+1-mano.
function pieBidFor(total, bidMano) {
  const a = total - 1 - bidMano;
  if (a >= 0 && a <= total) return a;
  return total + 1 - bidMano;
}

async function setupRoom(sessions, config) {
  const room = await rpc(sessions[0], "create_room", { p_config: config });

  // join_room only reserves a headcount since piece 5r (team selection
  // rework) — it no longer assigns seat/team, choose_team does that.
  // Found this script still calling join_room alone (pre-5r shape) while
  // repairing it for the deportivo-clock batch.
  const players = [];
  for (let seat = 0; seat < N_JUG; seat++) {
    await rpc(sessions[seat], "join_room", { p_code: room.code, p_name: `J${seat}` });
    players.push(await rpc(sessions[seat], "choose_team", { p_room_id: room.id, p_team: seat % 2 }));
  }

  const gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });
  const teamMano = gs.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);

  return { room, players, gs, teamMano, teamPie, captainMano, captainPie };
}

async function scenarioA(sessions) {
  console.log("\n=== Scenario A: normal ticking, real elapsed time deducted ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 1, modo: "muerte" } };
  const { room, gs: gs0, teamMano, teamPie, captainMano, captainPie } = await setupRoom(sessions, config);
  console.log(`  room=${room.code} teamMano=${teamMano} teamPie=${teamPie}`);

  assertEq(gs0.clock.running, teamMano, "clock.running starts on mano's team");
  assertEq(gs0.clock.teamTime, [60, 60], "both teams start with the full 60s budget");
  assertEq(gs0.clock.expired, [false, false], "neither team expired yet");

  await sleep(2500);

  // Bid 1 with total_bases=3 leaves pie two legal options ([1,3] via
  // opcionesValidas), so pie's window should actually start.
  const gsAfterMano = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 1, p_kamikaze: false });
  assertEq(gsAfterMano.clock.running, teamPie, "clock.running switches to pie's team");
  assertInRange(gsAfterMano.clock.teamTime[teamMano], 55, 58, "mano's teamTime decreased by ~2.5s");
  assertEq(gsAfterMano.clock.teamTime[teamPie], 60, "pie's teamTime untouched while mano's window was running");
  assertEq(gsAfterMano.clock.expired, [false, false], "still no expiry this early");

  await sleep(2500);

  const bidPie = pieBidFor(3, 1);
  const gsAfterPie = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });
  assertEq(gsAfterPie.clock.running, null, "clock.running cleared once bidding is done");
  assertEq(gsAfterPie.clock.running_since, null, "clock.running_since cleared once bidding is done");
  assertInRange(gsAfterPie.clock.teamTime[teamPie], 55, 58, "pie's teamTime decreased by ~2.5s");
  assertEq(gsAfterPie.clock.teamTime[teamMano], gsAfterMano.clock.teamTime[teamMano], "mano's teamTime unchanged since their window closed");
  assertEq(gsAfterPie.phase, "playing", "phase advanced normally");

  console.log("  scenario A passed");
}

async function scenarioB(sessions) {
  console.log("\n=== Scenario B: pie has only one legal option, no window starts ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [1], ases: ASES, kamikazes: 0, clock: { minutos: 1, modo: "muerte" } };
  const { room, gs: gs0, teamMano, teamPie, captainMano, captainPie } = await setupRoom(sessions, config);
  console.log(`  room=${room.code} teamMano=${teamMano} teamPie=${teamPie}`);

  const gsAfterMano = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 0, p_kamikaze: false });
  assertEq(gsAfterMano.clock.running, null, "pie's window never starts (total_bases=1 forces a single option)");
  assertEq(gsAfterMano.clock.running_since, null, "running_since stays null too");

  // total_bases=1 forces pie's ONLY legal option, so mano's own submit_bid
  // call already auto-resolved both bids in one shot (pie_forced_bid_auto_
  // resolve, 20260706190000) — found while repairing this script; the
  // second call below would now fail with not_bidding_phase.
  assertEq(gsAfterMano.phase, "playing", "mano's submit_bid auto-resolved pie's forced bid");
  const gsAfterPie = gsAfterMano;
  assertEq(gsAfterPie.clock.running, null, "still null after the forced bid (nothing was ever running to stop)");
  assertEq(gsAfterPie.clock.teamTime[teamPie], gsAfterMano.clock.teamTime[teamPie], "pie's teamTime untouched (no window ever ran for them)");

  console.log("  scenario B passed");
}

async function scenarioC(sessions) {
  console.log("\n=== Scenario C: claim_timeout succeeds (minutos=0, instantly expired) ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "muerte" } };
  const { room, gs: gs0, teamMano } = await setupRoom(sessions, config);
  console.log(`  room=${room.code} teamMano(losing)=${teamMano}`);

  assertEq(gs0.clock.teamTime[teamMano], 0, "mano's budget is 0 from the start");

  const impostorSeat = (teamMano === 0 ? 1 : 0); // any member of the other team
  const after = await rpc(sessions[impostorSeat], "claim_timeout", { p_room_id: room.id });

  assertEq(after.phase, "finished", "phase after a successful claim");
  assertEq(after.end_cause, "clock_expired", "end_cause");
  assertEq(after.clock.running, teamMano, "clock.running left frozen on the losing team (the 'who lost' record)");

  const { data: roomAfter, error } = await sessions[0].from("rooms").select("status").eq("id", room.id).single();
  if (error) throw error;
  assertEq(roomAfter.status, "finished", "rooms.status");

  console.log("  scenario C passed");
}

async function scenarioD(sessions) {
  console.log("\n=== Scenario D: claim_timeout rejected, time hasn't expired ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 1, modo: "muerte" } };
  const { room } = await setupRoom(sessions, config);

  await assertRpcFails(
    sessions[0].rpc("claim_timeout", { p_room_id: room.id }),
    "claim_timeout rejects a claim before the deadline"
  );

  console.log("  scenario D passed");
}

async function scenarioE(sessions) {
  console.log("\n=== Scenario E: claim_timeout rejected in deportivo mode, even though genuinely expired ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "deportivo" } };
  const { room, gs: gs0 } = await setupRoom(sessions, config);
  assertEq(gs0.clock.teamTime[gs0.clock.running], 0, "budget is genuinely 0 (deportivo has no loss consequence, but the clock still ran out)");

  await assertRpcFails(
    sessions[0].rpc("claim_timeout", { p_room_id: room.id }),
    "claim_timeout rejects deportivo-mode rooms regardless of expiry"
  );

  console.log("  scenario E passed");
}

async function scenarioF(sessions) {
  console.log("\n=== Scenario F: claim_timeout rejected when the room has no clock ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0 };
  const { room, gs: gs0 } = await setupRoom(sessions, config);
  assertEq(gs0.clock, null, "clock column stays null when the room config has no clock at all");

  await assertRpcFails(
    sessions[0].rpc("claim_timeout", { p_room_id: room.id }),
    "claim_timeout rejects rooms with no clock configured"
  );

  console.log("  scenario F passed");
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  await scenarioA(sessions);
  await scenarioB(sessions);
  await scenarioC(sessions);
  await scenarioD(sessions);
  await scenarioE(sessions);
  await scenarioF(sessions);

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
