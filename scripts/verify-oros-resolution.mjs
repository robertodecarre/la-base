// Verifies piece 4d (resolve_oros_menu) end-to-end against the real linked
// Supabase project, same standard/approach as
// scripts/verify-copas-resolution.mjs (piece 4c).
//
// Usage: node --env-file=.env scripts/verify-oros-resolution.mjs
//
// oros_menu is a different shape from copas_menu, confirmed by reading
// resolve_trick (20260706080000/090000), detectarTriggerOros
// (src/engine/trick.js) and PantallaPartida.jsx's oros-menu block before
// implementing:
//   - pending_action = { type:'oros_menu', carrier_seat, team } — no
//     trick_complete field, because oros_menu is only ever entered from
//     inside resolve_trick, i.e. strictly *after* a trick has already
//     fully resolved. So unlike the Copas scenarios, there is no
//     "trick_complete=false" case here to construct, and resolve_oros_menu
//     never calls resolve_trick.
//   - the decision is "pick a seat on pending_action.team (including
//     yourself) to open the next base" — a flat choice, not a
//     direction+seat-skip walk. So this script covers the two positive
//     shapes that decision actually has (choose a teammate / choose
//     yourself) plus the negative paths, rather than trick_complete
//     true/false.
//
// Unlike the Copas script (which had to retry rooms until a *randomly
// dealt* seat landed in a specific position), this script has full
// control over which card each of the 4 players plays each turn — the
// deck is still random, but every attempt is self-verified against the
// real src/engine/trick.js functions afterward, and only retried (fresh
// room) on the rare chance the engineered play didn't actually land the
// winning trick on the Oros holder's team.
import { createClient } from "@supabase/supabase-js";
import { resolverBase, detectarTriggerOros } from "../src/engine/trick.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-oros-resolution.mjs");
  process.exit(1);
}

const N_JUG = 4;
const MAX_ATTEMPTS = 20;
// ases.copas is deliberately off: this script only wants to engineer the
// Oros trigger, and a coincidentally-dealt-and-played As de Copas would
// divert the room into copas_menu instead of resolving the trick.
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [10],
  ases: { espadas: false, copas: false, oros: true },
  kamikazes: 0,
};

function isOros(card) {
  return card.valor === 1 && card.palo.n === "Oros";
}
function isBastosAce(card) {
  return card.valor === 1 && card.palo.n === "Bastos";
}
function isEspadasAce(card) {
  return card.valor === 1 && card.palo.n === "Espadas";
}
function jerarquia(card) {
  return isBastosAce(card) ? 100 : card.valor;
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
  // submit_bid requires pie's bid to equal exactly total-1-mano or
  // total+1-mano; total+1-mano (11) is out of the 0..total bound.
  const bidPie = CONFIG.estructura[gs.hand_number] - 1 - bidMano;
  await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });

  return { room, players, gs };
}

// Plays out the first trick so that: the As de Oros holder plays it (Oros
// requires the card to actually be in the trick, not just dealt), their
// teammate plays their own highest-jerarquia card, and the two opponents
// play their lowest-jerarquia card (skipping the Bastos/Espadas aces,
// which have special overrides unrelated to raw valor) — engineered so
// the Oros holder's team wins and the trigger fires. Returns null (caller
// retries with a fresh room) if the engineered trick didn't actually
// land in oros_menu, which independently confirms nothing but bad luck
// happened (e.g. an opponent's forced-low card still had a higher valor
// than the partner's forced-high card — vanishingly unlikely with 10-card
// hands but not proven impossible by construction).
async function engineerOrosTrigger(sessions) {
  const { room, players, gs: gs0 } = await setupRoom(sessions);

  const hands = [];
  for (let seat = 0; seat < N_JUG; seat++) {
    hands.push(await myHand(sessions[seat], room.id, gs0.hand_number));
  }

  const orosSeat = hands.findIndex((h) => h.some(isOros));
  const orosTeam = players.find((p) => p.seat === orosSeat).team;
  const partnerSeat = players.find((p) => p.team === orosTeam && p.seat !== orosSeat).seat;
  const opponentSeats = players.filter((p) => p.team !== orosTeam).map((p) => p.seat);

  const cardToPlay = new Array(N_JUG);
  cardToPlay[orosSeat] = hands[orosSeat].find(isOros);
  const partnerHand = hands[partnerSeat];
  cardToPlay[partnerSeat] = partnerHand.reduce((best, c) => (jerarquia(c) > jerarquia(best) ? c : best), partnerHand[0]);
  for (const seat of opponentSeats) {
    const candidates = hands[seat].filter((c) => !isBastosAce(c) && !isEspadasAce(c));
    cardToPlay[seat] = candidates.reduce((worst, c) => (jerarquia(c) < jerarquia(worst) ? c : worst), candidates[0]);
  }

  let gs = gs0;
  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cardToPlay[seat].uid });
  }

  if (gs.phase !== "oros_menu") return null; // engineered trick didn't trigger Oros, retry fresh

  return { room, players, gs0, gs, orosSeat, partnerSeat };
}

async function scenarioChooseTeammate(sessions) {
  const setup = await engineerOrosTrigger(sessions);
  if (!setup) return null;
  const { room, players, gs0, gs, orosSeat, partnerSeat } = setup;

  console.log(`  orosSeat=${orosSeat} partnerSeat=${partnerSeat} room=${room.code}`);
  assertEq(gs.pending_action.carrier_seat, orosSeat, "pending_action.carrier_seat");
  const winningTeam = gs.pending_action.team;

  // Cross-check against the actual engine functions, not a re-derivation.
  const trickCards = await playedCardsForTrick(sessions[0], room.id, gs0.hand_number, gs0.base_num);
  const seatById = Object.fromEntries(players.map((p) => [p.id, p.seat]));
  const ronda = trickCards.map((pc) => ({ carta: pc.card, jugadorIdx: seatById[pc.player_id], orden: pc.seq_in_trick }));
  const jActuales = players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ eq: p.team }));
  const { ganIdx } = resolverBase(ronda);
  const orosTrigger = detectarTriggerOros(ronda, jActuales, ganIdx, CONFIG.ases);
  if (!orosTrigger) {
    // The server already reported phase==='oros_menu' for this trick — if
    // the independent JS recomputation disagrees, that's SQL/JS drift
    // (the exact risk the SYNC RISK comments flag), not bad luck. Fail
    // loudly instead of silently retrying past it.
    throw new Error("server entered oros_menu but detectarTriggerOros disagrees — SQL/JS drift");
  }
  assertEq(winningTeam, jActuales[ganIdx].eq, "pending_action.team matches independently recomputed winner's team");

  // Negative paths.
  const impostorSeat = (orosSeat + 1) % N_JUG;
  await assertRpcFails(
    sessions[impostorSeat].rpc("resolve_oros_menu", { p_room_id: room.id, p_seat: partnerSeat }),
    "resolve_oros_menu rejects a non-carrier caller"
  );
  await assertRpcFails(
    sessions[orosSeat].rpc("resolve_oros_menu", { p_room_id: room.id, p_seat: 999 }),
    "resolve_oros_menu rejects a seat with no player"
  );
  const opponentSeat = players.find((p) => p.team !== winningTeam).seat;
  await assertRpcFails(
    sessions[orosSeat].rpc("resolve_oros_menu", { p_room_id: room.id, p_seat: opponentSeat }),
    "resolve_oros_menu rejects a seat not on the winning team"
  );

  const after = await rpc(sessions[orosSeat], "resolve_oros_menu", { p_room_id: room.id, p_seat: partnerSeat });
  assertEq(after.phase, "playing", "phase after choosing a teammate");
  assertEq(after.pending_action, null, "pending_action cleared");
  assertEq(after.turn_seat, partnerSeat, "turn_seat set to the chosen teammate");

  return true;
}

async function scenarioChooseSelf(sessions) {
  const setup = await engineerOrosTrigger(sessions);
  if (!setup) return null;
  const { room, players, gs0, gs, orosSeat } = setup;

  console.log(`  orosSeat=${orosSeat} room=${room.code}`);

  const trickCards = await playedCardsForTrick(sessions[0], room.id, gs0.hand_number, gs0.base_num);
  const seatById = Object.fromEntries(players.map((p) => [p.id, p.seat]));
  const ronda = trickCards.map((pc) => ({ carta: pc.card, jugadorIdx: seatById[pc.player_id], orden: pc.seq_in_trick }));
  const jActuales = players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ eq: p.team }));
  const { ganIdx } = resolverBase(ronda);
  const orosTrigger = detectarTriggerOros(ronda, jActuales, ganIdx, CONFIG.ases);
  if (!orosTrigger) {
    throw new Error("server entered oros_menu but detectarTriggerOros disagrees — SQL/JS drift");
  }

  const after = await rpc(sessions[orosSeat], "resolve_oros_menu", { p_room_id: room.id, p_seat: orosSeat });
  assertEq(after.phase, "playing", "phase after choosing self");
  assertEq(after.pending_action, null, "pending_action cleared");
  assertEq(after.turn_seat, orosSeat, "turn_seat set to the carrier's own seat");

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

  console.log("\n=== Scenario A: resolve_oros_menu, carrier chooses a teammate ===");
  await retryUntil(scenarioChooseTeammate, sessions, "choose-teammate scenario");

  console.log("\n=== Scenario B: resolve_oros_menu, carrier chooses themselves ===");
  await retryUntil(scenarioChooseSelf, sessions, "choose-self scenario");

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
