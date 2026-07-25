// Verifies piece 4c (resolve_copas_menu) end-to-end against the real
// linked Supabase project — same standard as pieces 4a/4b, but this time
// committed instead of thrown away, since 4a/4b's runs left no reusable
// artifact.
//
// Usage: node --env-file=.env scripts/verify-copas-resolution.mjs
// (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, same as the app)
//
// Room config uses a single 10-card base with nJug=4 and one deck (exactly
// 40 cards): every card, including the As de Copas, is dealt somewhere on
// every attempt. The only randomness left is *which* seat holds it and
// where the dealer/mano_seat lands (both uniform over 4 seats,
// independent of the shuffle) — so a handful of fresh-room retries reaches
// each target scenario with overwhelming probability (~1/4 per attempt,
// P(40 misses) ~ 1e-5), the same "retry until observed" approach
// tests/as-de-copas.spec.js already uses for the offline client.
//
// Scenario A (trick_complete=false): arranged by requiring the Copas
// holder to be mano_seat, so playing it is literally the trick's first
// card. Resolves with direction=-1 (reversal) specifically to exercise
// the seat-skip walk (resolve_copas_menu's non-trivial branch) rather
// than a case a naive turn_seat-1 formula would also get right.
//
// Scenario B (trick_complete=true): arranged by requiring the Copas
// holder to be the *last* seat to act in the trick ((mano_seat+1)%nJug
// under the default direction=1 turn order), driving the other 3 seats'
// plays first via play_card. Resolves with direction=1, and the expected
// winner/Oros-trigger is computed independently by importing the actual
// src/engine/trick.js functions (not re-deriving the SQL's logic by
// hand) and comparing against what resolve_trick produced.
import { createClient } from "@supabase/supabase-js";
import { resolverBase, detectarTriggerOros } from "../src/engine/trick.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-copas-resolution.mjs");
  process.exit(1);
}

const N_JUG = 4;
const MAX_ATTEMPTS = 40;
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [10],
  ases: { espadas: true, copas: true, oros: true },
  kamikazes: 0,
};

function isCopas(card) {
  return card.valor === 1 && card.palo.n === "Copas";
}

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

async function playersForRoom(client, roomId) {
  const { data, error } = await client.from("players").select("id, seat, team").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

async function trickWonFor(client, playerId) {
  const { data, error } = await client.from("players").select("tricks_won").eq("id", playerId).single();
  if (error) throw error;
  return data.tricks_won;
}

// Fresh room, 4 players, hand 0 dealt, bidding resolved -> phase 'playing'.
async function setupRoom(sessions) {
  const room = await rpc(sessions[0], "create_room", { p_config: CONFIG });

  const players = [];
  for (let seat = 0; seat < N_JUG; seat++) {
    const p = await rpc(sessions[seat], "join_room", { p_code: room.code, p_name: `J${seat}` });
    players.push(p);
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });

  const teamMano = gs.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);
  const bidMano = 0;
  // pie's bid isn't free-form: submit_bid requires it to equal exactly
  // total-1-mano or total+1-mano. total+1-mano (11) exceeds the 0..total
  // bound, so total-1-mano (9) is the only legal value here.
  const bidPie = CONFIG.estructura[gs.hand_number] - 1 - bidMano;
  await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });

  return { room, players, gs };
}

async function findCopasHolder(sessions, roomId, handNumber) {
  for (let seat = 0; seat < N_JUG; seat++) {
    const cards = await myHand(sessions[seat], roomId, handNumber);
    const card = cards.find(isCopas);
    if (card) return { seat, card };
    if (cards.length === 10 && seat === N_JUG - 1) {
      // Full 40-card deck dealt across 4 seats and nobody had it: impossible.
      throw new Error("As de Copas missing from every hand — full-deck assumption broken");
    }
  }
  return null;
}

async function attemptNotComplete(sessions) {
  const { room, gs } = await setupRoom(sessions);
  const holder = await findCopasHolder(sessions, room.id, gs.hand_number);
  if (holder.seat !== gs.mano_seat) return null; // wrong deal for this scenario, retry

  console.log(`  holder=seat${holder.seat} (=mano_seat), room=${room.code}`);

  const before = await rpc(sessions[holder.seat], "play_card", { p_room_id: room.id, p_card_uid: holder.card.uid });
  assertEq(before.phase, "copas_menu", "phase after playing As de Copas as first card");
  assertEq(before.pending_action.carrier_seat, holder.seat, "pending_action.carrier_seat");
  assertEq(before.pending_action.trick_complete, false, "pending_action.trick_complete");

  // Negative paths, hard-asserted against the real project.
  const impostorSeat = (holder.seat + 1) % N_JUG;
  await assertRpcFails(
    sessions[impostorSeat].rpc("resolve_copas_menu", { p_room_id: room.id, p_direction: 1 }),
    "resolve_copas_menu rejects a non-carrier caller"
  );
  await assertRpcFails(
    sessions[holder.seat].rpc("resolve_copas_menu", { p_room_id: room.id, p_direction: 0 }),
    "resolve_copas_menu rejects an invalid direction"
  );
  await assertRpcFails(
    sessions[holder.seat].rpc("resolve_trick", { p_room_id: room.id }),
    "resolve_trick is not directly callable (EXECUTE revoked)"
  );

  const direction = -1; // reversal: exercises the seat-skip walk, not just turn_seat-1
  const after = await rpc(sessions[holder.seat], "resolve_copas_menu", { p_room_id: room.id, p_direction: direction });

  assertEq(after.phase, "playing", "phase after non-completing resolution");
  assertEq(after.pending_action, null, "pending_action cleared");
  assertEq(after.direction, direction, "direction persisted");
  const expectedNext = (holder.seat + 1) % N_JUG; // only the holder has played so far
  assertEq(after.turn_seat, expectedNext, "turn_seat via seat-skip walk (direction=-1)");

  // Confirm the persisted direction actually takes effect on the *next*
  // play_card call, not just that the column got written.
  const nextCards = await myHand(sessions[expectedNext], room.id, gs.hand_number);
  const followUp = await rpc(sessions[expectedNext], "play_card", {
    p_room_id: room.id,
    p_card_uid: nextCards[0].uid,
  });
  assertEq(followUp.phase, "playing", "phase stays playing (trick still incomplete)");
  assertEq(followUp.turn_seat, (expectedNext + 1) % N_JUG, "turn_seat advances per persisted direction=-1");

  return true;
}

async function attemptComplete(sessions) {
  const { room, gs: gs0 } = await setupRoom(sessions);
  const holder = await findCopasHolder(sessions, room.id, gs0.hand_number);
  const expectedLast = (gs0.mano_seat + 1) % N_JUG;
  if (holder.seat !== expectedLast) return null; // wrong deal for this scenario, retry

  console.log(`  holder=seat${holder.seat} (=last to act), room=${room.code}`);

  let gs = gs0;
  while (gs.turn_seat !== holder.seat) {
    const seat = gs.turn_seat;
    const cards = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cards[0].uid });
  }

  const before = await rpc(sessions[holder.seat], "play_card", { p_room_id: room.id, p_card_uid: holder.card.uid });
  assertEq(before.phase, "copas_menu", "phase after playing As de Copas as last card");
  assertEq(before.pending_action.trick_complete, true, "pending_action.trick_complete");

  // Expected winner/Oros-trigger, computed independently via the actual
  // src/engine/trick.js functions against the real persisted trick.
  const trickCards = await playedCardsForTrick(sessions[0], room.id, gs0.hand_number, gs0.base_num);
  const allPlayers = await playersForRoom(sessions[0], room.id);
  const seatById = Object.fromEntries(allPlayers.map((p) => [p.id, p.seat]));
  const ronda = trickCards.map((pc) => ({
    carta: pc.card,
    jugadorIdx: seatById[pc.player_id],
    orden: pc.seq_in_trick,
  }));
  const jActuales = allPlayers
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ eq: p.team }));
  const { ganIdx } = resolverBase(ronda);
  const orosTrigger = detectarTriggerOros(ronda, jActuales, ganIdx, CONFIG.ases);
  const winnerPlayerId = allPlayers.find((p) => p.seat === ganIdx).id;
  const winnerTricksBefore = await trickWonFor(sessions[0], winnerPlayerId);

  const direction = 1; // continue — must not affect the resolution outcome
  const after = await rpc(sessions[holder.seat], "resolve_copas_menu", { p_room_id: room.id, p_direction: direction });

  assertEq(after.direction, direction, "direction persisted on the trick-complete branch");
  assertEq(after.last_trick_winner_seat, ganIdx, "trick winner matches independently recomputed resolverBase");
  assertEq(after.base_num, gs0.base_num + 1, "base_num advanced");

  const expectedPhase = orosTrigger
    ? "oros_menu"
    : gs0.base_num + 1 >= CONFIG.estructura[0]
      ? "closing"
      : "resolving";
  assertEq(after.phase, expectedPhase, "phase transition matches detectarTriggerOros");

  const winnerTricksAfter = await trickWonFor(sessions[0], winnerPlayerId);
  assertEq(winnerTricksAfter, winnerTricksBefore + 1, "tricks_won incremented for the winner");

  return true;
}

async function retryUntil(fn, sessions, label) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await fn(sessions);
    if (result) {
      console.log(`  matched on attempt ${attempt}/${MAX_ATTEMPTS}`);
      return;
    }
  }
  throw new Error(`${label}: target scenario not observed in ${MAX_ATTEMPTS} attempts`);
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  console.log("\n=== Scenario A: resolve_copas_menu, trick_complete=false ===");
  await retryUntil(attemptNotComplete, sessions, "not-complete scenario");

  console.log("\n=== Scenario B: resolve_copas_menu, trick_complete=true ===");
  await retryUntil(attemptComplete, sessions, "complete scenario");

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
