// Verifies the deportivo-mode grace period + auto-loss
// (20260804020000_deportivo_grace_timeout.sql, claim_deportivo_timeout)
// end-to-end against the real linked Supabase project, same approach as
// verify-clock-expired.mjs (the muerte-mode equivalent this mirrors).
//
// Usage: node --env-file=.env scripts/verify-deportivo-timeout.mjs
//
// No new game_state column: the grace deadline is derived on demand from
// running_since + teamTime[running] + 10s, same "claim" model as
// claim_timeout — nothing here polls or schedules anything.
//
// Scenarios:
//   A. claim_deportivo_timeout rejected the instant the main budget hits
//      zero (minutos=0) — the 10s grace hasn't elapsed yet, proving the
//      grace period is actually honored and not just "main budget only".
//   B. A team whose main budget hit zero still successfully submits a bid
//      DURING the grace window — submit_bid has no expiry guard of its
//      own (same "claim" framing as muerte), and the match continues
//      normally, never ended.
//   C. A team that never bids, past main budget (0) + grace (10s) —
//      claim_deportivo_timeout succeeds: phase='finished',
//      end_cause='clock_expired', clock left frozen on the losing team.
//   D. claim_deportivo_timeout rejected in "muerte" mode (inverse of
//      claim_timeout's own deportivo-rejection check).
//   E. claim_deportivo_timeout rejected when the room has no clock at all.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-deportivo-timeout.mjs");
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

// pie's bid must equal exactly total-1-mano or total+1-mano.
function pieBidFor(total, bidMano) {
  const a = total - 1 - bidMano;
  if (a >= 0 && a <= total) return a;
  return total + 1 - bidMano;
}

async function setupRoom(sessions, config) {
  const room = await rpc(sessions[0], "create_room", { p_config: config });

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
  console.log("\n=== Scenario A: rejected the instant the main budget hits zero (grace not elapsed) ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "deportivo" } };
  const { room, gs: gs0, teamMano } = await setupRoom(sessions, config);
  assertEq(gs0.clock.teamTime[teamMano], 0, "mano's main budget is 0 from the start");

  await assertRpcFails(
    sessions[0].rpc("claim_deportivo_timeout", { p_room_id: room.id }),
    "claim_deportivo_timeout rejects a claim before the 10s grace elapses"
  );

  console.log("  scenario A passed");
}

async function scenarioB(sessions) {
  console.log("\n=== Scenario B: bidding DURING the grace window succeeds, match continues ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "deportivo" } };
  const { room, teamMano, teamPie, captainMano, captainPie } = await setupRoom(sessions, config);

  await sleep(3000); // well inside the 10s grace, past the (already-zero) main budget

  await assertRpcFails(
    sessions[0].rpc("claim_deportivo_timeout", { p_room_id: room.id }),
    "still rejected 3s into the grace window"
  );

  // submit_bid has no expiry guard of its own (same "claim" framing as
  // muerte mode) — mano can still bid successfully mid-grace.
  const gsAfterMano = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 1, p_kamikaze: false });
  assertEq(gsAfterMano.phase, "bidding", "still bidding (pie has 2 legal options with total_bases=3, bidMano=1)");
  assertEq(gsAfterMano.end_cause, null, "match not ended by bidding during the grace window");

  const bidPie = pieBidFor(3, 1);
  const gsAfterPie = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });
  assertEq(gsAfterPie.phase, "playing", "hand proceeds normally once both bids land");

  // Now that bidding is over (phase='playing'), claim_deportivo_timeout's
  // own phase gate rejects it — confirms the grace window genuinely
  // closed once the team actually bid, nothing left to claim.
  await assertRpcFails(
    sessions[0].rpc("claim_deportivo_timeout", { p_room_id: room.id }),
    "claim_deportivo_timeout rejects once bidding is over"
  );

  console.log("  scenario B passed");
}

async function scenarioC(sessions) {
  console.log("\n=== Scenario C: never bids past main budget + 10s grace -> match ends ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "deportivo" } };
  const { room, gs: gs0, teamMano } = await setupRoom(sessions, config);
  assertEq(gs0.clock.teamTime[teamMano], 0, "mano's main budget is 0 from the start");

  await sleep(11000); // past 0 (main) + 10s (grace)

  const impostorSeat = teamMano === 0 ? 1 : 0; // any member of the other team
  const after = await rpc(sessions[impostorSeat], "claim_deportivo_timeout", { p_room_id: room.id });

  assertEq(after.phase, "finished", "phase after a successful claim");
  assertEq(after.end_cause, "clock_expired", "end_cause (same cause muerte uses — no mode-specific value needed)");
  assertEq(after.clock.running, teamMano, "clock.running left frozen on the losing team (the 'who lost' record)");

  const { data: roomAfter, error } = await sessions[0].from("rooms").select("status").eq("id", room.id).single();
  if (error) throw error;
  assertEq(roomAfter.status, "finished", "rooms.status");

  console.log("  scenario C passed");
}

async function scenarioD(sessions) {
  console.log("\n=== Scenario D: rejected in muerte mode ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0, clock: { minutos: 0, modo: "muerte" } };
  const { room, gs: gs0 } = await setupRoom(sessions, config);
  assertEq(gs0.clock.teamTime[gs0.clock.running], 0, "budget genuinely 0 (muerte's own claim_timeout is what applies here, not this one)");

  await assertRpcFails(
    sessions[0].rpc("claim_deportivo_timeout", { p_room_id: room.id }),
    "claim_deportivo_timeout rejects muerte-mode rooms regardless of expiry"
  );

  console.log("  scenario D passed");
}

async function scenarioE(sessions) {
  console.log("\n=== Scenario E: rejected when the room has no clock ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3], ases: ASES, kamikazes: 0 };
  const { room, gs: gs0 } = await setupRoom(sessions, config);
  assertEq(gs0.clock, null, "clock column stays null when the room config has no clock at all");

  await assertRpcFails(
    sessions[0].rpc("claim_deportivo_timeout", { p_room_id: room.id }),
    "claim_deportivo_timeout rejects rooms with no clock configured"
  );

  console.log("  scenario E passed");
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

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
