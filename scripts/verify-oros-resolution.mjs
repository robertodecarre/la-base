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
// resolverBase/detectarTriggerOros used to live in src/engine/trick.js and
// powered this script's independent JS-side cross-check of the server's
// oros_menu trigger — removed from the engine when hotseat mode (the only
// caller of full client-side trick resolution) was deleted in piece 5q,
// well after this script was first written. Found stale while re-running
// this script for batch fix #4 (mano_seat) below; the cross-check itself
// is gone for good (there is no client-side trick engine left to compare
// against, server-authoritative resolve_trick is the only source of
// truth now) so it's removed here rather than resurrected — the server's
// own `gs.phase === 'oros_menu'` plus the RPC-level assertions below are
// still a real end-to-end check against the live project, just without
// the extra belt-and-suspenders recomputation.

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

async function playersForRoom(client, roomId) {
  const { data, error } = await client.from("players").select("id, seat, team").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

// Fresh room, 4 players, hand 0 dealt, bidding resolved -> phase 'playing'.
//
// join_room only reserves a headcount since piece 5r (team selection
// rework) — it no longer assigns seat/team, choose_team does that. Found
// this script still calling join_room alone (pre-5r shape) while fixing
// it to re-run for batch fix #4; alternates LOCAL/VISITANTE by join
// index, same convention tests/helpers.js uses, so seat 0/2=team0,
// 1/3=team1 exactly as choose_team_rpc.sql guarantees.
async function setupRoom(sessions) {
  const room = await rpc(sessions[0], "create_room", { p_config: CONFIG });

  const players = [];
  for (let i = 0; i < N_JUG; i++) {
    await rpc(sessions[i], "join_room", { p_code: room.code, p_name: `J${i}` });
    const p = await rpc(sessions[i], "choose_team", { p_room_id: room.id, p_team: i % 2 });
    players.push(p);
  }

  let gs = await rpc(sessions[0], "deal_hand", { p_room_id: room.id });

  const teamMano = gs.mano_seat % 2;
  const teamPie = 1 - teamMano;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  const captainPie = players.find((p) => p.team === teamPie && p.is_captain);
  const bidMano = 0;
  // With bidMano=0 and total=10, pie's only legal option is total-1-mano=9
  // (total+1-mano=11 is out of the 0..total bound) — a single-option pie
  // bid is auto-resolved by submit_bid itself in the SAME call as mano's
  // (pie_forced_bid_auto_resolve, 20260706190000, added after this script
  // was first written), landing phase straight on 'playing'. Found this
  // while re-running the script for batch fix #4: the second submit_bid
  // call below used to be load-bearing and no longer is — only fire it if
  // mano's bid didn't already resolve the hand.
  const bidPie = CONFIG.estructura[gs.hand_number] - 1 - bidMano;
  gs = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  if (gs.phase === "bidding") {
    gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });
  }

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
  // Batch fix #4 (post-pieza-J): mano_seat now follows the Oros transfer
  // too, not just turn_seat — this is what drives the "MANO" badge in
  // MesaCircular (manoIdx=gameState.mano_seat), which used to stay stuck
  // on the original dealt mano even after using the power.
  assertEq(after.mano_seat, partnerSeat, "mano_seat also transferred to the chosen teammate");
  // mano_seat/bid_mano_seat split (batch fix post-pieza-J): bid_mano_seat
  // stays frozen at the hand's original bidding-time mano regardless of
  // Oros — this is exactly what close_hand's kamikaze check and
  // revancha_partida's rematch-dealer seed now read instead of mano_seat.
  assertEq(after.bid_mano_seat, gs0.bid_mano_seat, "bid_mano_seat untouched by the Oros transfer");

  return true;
}

async function scenarioChooseSelf(sessions) {
  const setup = await engineerOrosTrigger(sessions);
  if (!setup) return null;
  const { room, players, gs0, gs, orosSeat } = setup;

  console.log(`  orosSeat=${orosSeat} room=${room.code}`);

  const after = await rpc(sessions[orosSeat], "resolve_oros_menu", { p_room_id: room.id, p_seat: orosSeat });
  assertEq(after.phase, "playing", "phase after choosing self");
  assertEq(after.pending_action, null, "pending_action cleared");
  assertEq(after.turn_seat, orosSeat, "turn_seat set to the carrier's own seat");
  assertEq(after.mano_seat, orosSeat, "mano_seat also transferred to the carrier's own seat");
  assertEq(after.bid_mano_seat, gs0.bid_mano_seat, "bid_mano_seat untouched by the Oros transfer");

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
