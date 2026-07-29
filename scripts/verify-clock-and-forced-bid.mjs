// Verifies piece C+D (batch overnight post-5r) end-to-end against the real
// linked Supabase project — direct .rpc() calls, same pattern as every
// other verify-*.mjs script here.
//
// Usage: node --env-file=.env scripts/verify-clock-and-forced-bid.mjs
//
// C: deal_hand must start the mano team's clock window (game_state.clock
//    non-null, running=mano_seat%2, running_since set) when the room has a
//    clock configured — this regressed silently starting at
//    20260706150000_sorteo_inicial_rpc.sql and was carried forward by this
//    batch's own earlier migrations until 20260706180000 restored it.
// D: when mano's bid leaves pie exactly one legal value (always true for a
//    1-card hand), submit_bid must resolve BOTH bids in that same call,
//    jump straight to phase='playing', and never start pie's clock window
//    — no second submit_bid from pie's captain.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-clock-and-forced-bid.mjs");
  process.exit(1);
}

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

async function setUpRoom({ nJug, estructura, clock }) {
  const clients = [];
  for (let i = 0; i < nJug; i++) {
    clients.push(await newSession());
    await sleep(300);
  }
  const config = { nJug, estructura };
  if (clock) config.clock = clock;
  const room = await rpc(clients[0], "create_room", { p_config: config });
  const players = [];
  for (let i = 0; i < nJug; i++) {
    players.push(await rpc(clients[i], "join_room", { p_code: room.code, p_name: `P${i}` }));
  }
  // Alternate LOCAL/VISITANTE by join order — same seat%2==team invariant
  // choose_team enforces.
  for (let i = 0; i < nJug; i++) {
    await rpc(clients[i], "choose_team", { p_room_id: room.id, p_team: i % 2 });
  }
  return { clients, room };
}

async function main() {
  console.log("\nC: deal_hand starts the clock (1-carta hand, modo muerte, 5 min)");
  {
    const { clients, room } = await setUpRoom({
      nJug: 4,
      estructura: [1, 1],
      clock: { minutos: 5, modo: "muerte" },
    });
    const gs = await rpc(clients[0], "deal_hand", { p_room_id: room.id });
    assert(gs.clock !== null, "game_state.clock is non-null after deal_hand");
    assertEq(gs.clock.teamTime, [300, 300], "teamTime starts at 5min=300s for both teams");
    assertEq(gs.clock.running, gs.mano_seat % 2, "running == mano team (mano_seat % 2)");
    assert(!!gs.clock.running_since, "running_since is set");
    assertEq(gs.clock.expired, [false, false], "expired starts [false,false]");

    console.log("\nD: pie has exactly one legal value (1-carta hand) -> auto-resolved, no second submit_bid, no pie clock window");
    const manoSeat = gs.mano_seat;
    const manoTeam = manoSeat % 2;
    const pieTeam = 1 - manoTeam;
    const manoCaptain = clients.find((_, i) => i % 2 === manoTeam); // seat parity == team, captain is seat 0/1 of each team (first joiner)
    // mano bids 0 (only two possible values 0/1 for a 1-card hand; either
    // forces exactly one pie option).
    const gs2 = await rpc(manoCaptain, "submit_bid", { p_room_id: room.id, p_value: 0 });
    assertEq(gs2.phase, "playing", "phase jumps straight to playing after mano's single bid");
    assertEq(gs2.bids[`team${manoTeam}`], 0, "mano's own bid recorded");
    assert(gs2.bids[`team${pieTeam}`] !== null, "pie's bid was auto-filled, not left null");
    assertEq(gs2.clock.running, null, "clock is NOT running for pie's forced turn");
    assertEq(gs2.clock.running_since, null, "running_since cleared, nothing left to time");

    // Confirm pie's captain calling submit_bid now correctly fails
    // (already resolved, phase is no longer 'bidding') — proving there is
    // genuinely no second action expected/possible.
    const pieCaptain = clients.find((_, i) => i % 2 === pieTeam);
    await rpcExpectError(pieCaptain, "submit_bid", { p_room_id: room.id, p_value: gs2.bids[`team${pieTeam}`] }, "not_bidding_phase");
  }

  console.log("\nD (edge case): pie DOES have a real choice (e.g. a 3-card hand) -> still requires pie's own submit_bid, clock still starts for pie if enabled");
  {
    const { clients, room } = await setUpRoom({
      nJug: 4,
      estructura: [3, 3],
      clock: { minutos: 5, modo: "muerte" },
    });
    const gs = await rpc(clients[0], "deal_hand", { p_room_id: room.id });
    const manoTeam = gs.mano_seat % 2;
    const pieTeam = 1 - manoTeam;
    const manoCaptain = clients.find((_, i) => i % 2 === manoTeam);
    const pieCaptain = clients.find((_, i) => i % 2 === pieTeam);
    // mano bids 1 of 3 -> pie's valid set is {total-1-1, total+1-1} = {1,3}, two options.
    const gs2 = await rpc(manoCaptain, "submit_bid", { p_room_id: room.id, p_value: 1 });
    assertEq(gs2.phase, "bidding", "phase stays bidding — pie still has a real choice");
    assert(gs2.bids[`team${pieTeam}`] === null, "pie's bid is NOT auto-filled when there's a real choice");
    assertEq(gs2.clock.running, pieTeam, "clock DOES start running for pie when they have a real choice");
    // pie now bids for real.
    const gs3 = await rpc(pieCaptain, "submit_bid", { p_room_id: room.id, p_value: 1 });
    assertEq(gs3.phase, "playing", "phase moves to playing once pie actually bids");
  }

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
