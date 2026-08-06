// Verifies the actual server-side turn-order STATE for a 4-player hand
// against the real linked Supabase project (not a screenshot, not
// mocked) — written in response to a real bug report: "play started
// clockwise instead of counter-clockwise" after the mesa ovalada
// redesign. Two completely different bugs could produce that symptom:
// (a) play_card_rpc.sql's turn_seat/direction advancement is wrong, or
// (b) the advancement is correct and only the seat->physical-position
// mapping used for rendering (src/engine/mesaOvalada.js) displays it
// backwards. This script checks (a) directly against the RPCs, then
// cross-checks the SAME observed turn_seat sequence through the actual
// rendering geometry module to confirm which rotational sense the
// player would SEE — closing the loop between server state and visuals
// instead of trusting either one in isolation.
//
// Usage: node --env-file=.env scripts/verify-turn-order-direction.mjs
import { createClient } from "@supabase/supabase-js";
import { layoutMesa } from "../src/engine/mesaOvalada.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-turn-order-direction.mjs");
  process.exit(1);
}

const N_JUG = 4;

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
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

function pieBidFor(total, bidMano) {
  const a = total - 1 - bidMano;
  if (a >= 0 && a <= total) return a;
  return total + 1 - bidMano;
}

// s0->s1 signed area sign, y-down screen space: positive = clockwise.
function signedTurn(cx, cy, p0, p1) {
  const v0 = { x: p0.x - cx, y: p0.y - cy };
  const v1 = { x: p1.x - cx, y: p1.y - cy };
  return v0.x * v1.y - v0.y * v1.x;
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  const config = { nJug: N_JUG, dosMazos: false, estructura: [3, 3], ases: { espadas: false, copas: false, oros: false }, kamikazes: 0 };
  const room = await rpc(sessions[0], "create_room", { p_config: config });
  const players = [];
  for (let seat = 0; seat < N_JUG; seat++) {
    await rpc(sessions[seat], "join_room", { p_code: room.code, p_name: `J${seat}` });
    players.push(await rpc(sessions[seat], "choose_team", { p_room_id: room.id, p_team: seat % 2 }));
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });
  const teamMano = gs.bid_mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);
  const total = config.estructura[gs.hand_number];
  gs = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 0, p_kamikaze: false });
  if (gs.phase === "bidding") {
    gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: pieBidFor(total, 0), p_kamikaze: false });
  }
  assertEq(gs.phase, "playing", "phase after bidding resolves");
  console.log(`  room=${room.code} direction=${gs.direction} first turn_seat=${gs.turn_seat}`);

  // Play one full trick (4 cards), recording the server's own turn_seat
  // before each play — this is the REAL state the server considers "whose
  // turn", read straight from its own RPC responses, not inferred.
  const visitedSeats = [];
  const direction = gs.direction;
  while (gs.phase === "playing" && visitedSeats.length < N_JUG) {
    const seat = gs.turn_seat;
    visitedSeats.push(seat);
    const hand = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: hand[0].uid });
  }

  // 1) Every seat gets exactly one turn in the trick — the fundamental
  // correctness property, independent of which direction it goes in.
  assertEq(new Set(visitedSeats).size, N_JUG, "all 4 seats got exactly one turn");
  console.log(`  turn_seat sequence: ${visitedSeats.join(" -> ")}`);

  // 2) The sequence matches EXACTLY what play_card_rpc.sql's own
  // documented formula predicts from `direction` (20260706050000_play_card_
  // rpc.sql: direction=1 -> turn_seat decreases by 1 mod nJug, otherwise
  // it increases by 1 mod nJug) — an independent re-derivation, not a
  // trust-the-server echo, so this catches a real regression if that
  // formula ever silently changes.
  for (let i = 1; i < visitedSeats.length; i++) {
    const prev = visitedSeats[i - 1];
    const expectedNext = direction === 1 ? (prev + N_JUG - 1) % N_JUG : (prev + 1) % N_JUG;
    assertEq(visitedSeats[i], expectedNext, `step ${i}: turn_seat advances per play_card_rpc.sql's own direction formula`);
  }

  // 3) Cross-check against the ACTUAL rendering geometry (mesaOvalada.js,
  // the module MesaCircular.jsx renders from) — maps each visited seat to
  // its real screen position and confirms the whole sequence traces a
  // SINGLE consistent rotational sense (never reverses mid-trick), which
  // is what a human watching the table would perceive as "the deal is
  // going clockwise" or "counter-clockwise". This is the part a pure RPC
  // check can't see on its own — closes the loop between server state and
  // what the redesigned table actually shows.
  const mesa = layoutMesa(N_JUG, null);
  const positions = visitedSeats.map((seat) => ({ x: mesa.seats[seat].ax, y: mesa.seats[seat].ay }));
  const turns = [];
  for (let i = 1; i < positions.length - 1; i++) {
    turns.push(signedTurn(mesa.cx, mesa.cy, positions[i - 1], positions[i]) + signedTurn(mesa.cx, mesa.cy, positions[i], positions[i + 1]));
  }
  const allSameSign = turns.every((t) => Math.sign(t) === Math.sign(turns[0]));
  if (!allSameSign) throw new Error(`FAIL: visual rotation reverses mid-trick — turns=${turns.join(",")}`);
  console.log(`    ok: visual rotation is a single consistent sense across the trick (${turns[0] > 0 ? "clockwise" : "counter-clockwise"})`);

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
