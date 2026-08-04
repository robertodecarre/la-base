// Verifies piece 4f (close_hand) end-to-end against the real linked
// Supabase project, same approach as the 4c/4d/4e verification scripts.
//
// Usage: node --env-file=.env scripts/verify-close-hand.mjs
//
// Bigger than the 4c/4d/4e scripts: reaching 'closing' needs a full hand
// (every base played out, not just one trick), and the kamikaze-loss
// scenario needs a specific bid/outcome mismatch engineered on top of
// that. ases.{espadas,copas,oros} are all off throughout — this script
// tests hand-close, not trick-resolution triggers (already covered by
// verify-copas/oros-resolution.mjs), and disabling them removes any
// chance of a menu detour changing the trick count.
//
// Three scenarios:
//   A. A normal hand-close (no kamikaze failure) that isn't the match's
//      last hand -> phase='dealing', hand_number/dealer_seat rolled
//      forward, and (bonus check) deal_hand accepts the resulting state
//      and actually starts hand 1 cleanly. Called by seat 2, a non-
//      captain, non-trick-winner room member, to prove the "any room
//      member" authorization decision, not just that some caller works.
//      Also carries the not_room_member negative check (a 5th, unjoined
//      session) since the room is conveniently sitting in 'closing'.
//   B. A normal hand-close that IS the match's last hand ->
//      phase='finished', end_cause='normal'.
//   C. A kamikaze-loss close: the mano team bids high (a plain bid, not
//      flagged kamikaze) and is engineered to lose every trick, missing
//      by more than the -2 threshold -> phase='finished',
//      end_cause='kamikaze'. Deliberately NOT the match's last hand, to
//      prove the kamikaze check fires ahead of (independent of) the
//      last-hand check, same precedence as PantallaPartida.jsx's
//      cerrarMano.
//
// Every tally (bid vs. tricks vs. delta) is cross-checked against an
// independently-computed expected delta.
//
// Repaired while re-running for the mano_seat/bid_mano_seat split batch
// (2026-08-04) — stale in the same way as the other verify-*.mjs scripts
// touched today: `resolverBase` (src/engine/trick.js) and `calcularPuntos`
// (src/engine/scoring.js, the whole file is gone) were both removed with
// hotseat mode (piece 5q) — trick resolution and scoring are entirely
// server-authoritative now, no client engine left to import. `resolverBase`
// usage is replaced with trusting the server's own last_trick_winner_seat
// (the actual system under test); `calcularPuntos` is reinlined below from
// the documented scoring rule (the same formula close_hand's own SQL
// implements — read directly from 20260706290000_close_hand_dual_captain_
// confirm.sql, not guessed) so scenario deltas are still cross-checked
// against an independent computation, not just trusted from the RPC's own
// output. `join_room` alone no longer assigns seat/team since piece 5r
// (choose_team does) — added to setupRoom below.
import { createClient } from "@supabase/supabase-js";
import { jerarquia } from "../src/engine/hierarchy.js";

// Mirrors close_hand's own scoring branch exactly (see the migration
// referenced above): hecho===pedido for a team scores a 10+hecho bonus;
// otherwise -abs(hecho-pedido). "N"/"E" kept as param names matching the
// original (now-deleted) scoring.js signature this script always called
// with (team0, team1 positionally) — not a meaningful abbreviation here.
function calcularPuntos(pedN, pedE, hechoN, hechoE) {
  if (hechoN === pedN && hechoE !== pedE) {
    return { deltaN: 10 + hechoN, deltaE: -Math.abs(hechoE - pedE) };
  }
  if (hechoE === pedE && hechoN !== pedN) {
    return { deltaN: -Math.abs(hechoN - pedN), deltaE: 10 + hechoE };
  }
  return { deltaN: -Math.abs(hechoN - pedN), deltaE: -Math.abs(hechoE - pedE) };
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-close-hand.mjs");
  process.exit(1);
}

const N_JUG = 4;
const ASES = { espadas: false, copas: false, oros: false };

function isBastosAce(card) {
  return card.valor === 1 && card.palo.n === "Bastos";
}
function isEspadasAce(card) {
  return card.valor === 1 && card.palo.n === "Espadas";
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
  const { data, error } = await client.from("players").select("id, seat, team, tricks_won").eq("room_id", roomId);
  if (error) throw error;
  return data;
}

async function handResultRow(client, roomId, handNumber) {
  const { data, error } = await client
    .from("hand_results")
    .select("*")
    .eq("room_id", roomId)
    .eq("hand_number", handNumber)
    .single();
  if (error) throw error;
  return data;
}

// submit_bid requires pie's bid to equal exactly total-1-mano or
// total+1-mano, whichever lands in [0, total].
function pieBidFor(total, bidMano) {
  const a = total - 1 - bidMano;
  if (a >= 0 && a <= total) return a;
  return total + 1 - bidMano;
}

async function setupRoom(sessions, config, bidMano) {
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
  const bidPie = pieBidFor(config.estructura[gs.hand_number], bidMano);
  // Every bidMano this script ever passes (0 for scenarios A/B, totalBases
  // for scenario C's "bid all of it") happens to leave pie with exactly
  // one legal option, so mano's own submit_bid call auto-resolves both
  // bids in one shot (pie_forced_bid_auto_resolve, 20260706190000) —
  // found while repairing this script's other staleness; the second call
  // is only needed when that doesn't happen.
  gs = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: bidMano, p_kamikaze: false });
  if (gs.phase === "bidding") {
    gs = await rpc(sessions[captainPie.seat], "submit_bid", { p_room_id: room.id, p_value: bidPie, p_kamikaze: false });
  }

  return { room, players, gs, bidMano, bidPie };
}

// Plays exactly one trick to completion. cardPicker(seat, remainingHand)
// picks which card that seat plays this trick. Returns the game_state
// after the trick resolves (phase will be 'resolving' or 'closing' —
// ases are all off, so never 'oros_menu'/'copas_menu' here).
async function playOneTrick(sessions, room, gs0, cardPicker) {
  let gs = gs0;
  while (gs.phase === "playing") {
    const seat = gs.turn_seat;
    const hand = await myHand(sessions[seat], room.id, gs.hand_number);
    const card = cardPicker(seat, hand);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: card.uid });
  }
  return gs;
}

// If the trick left the room in 'resolving', confirm the winner and
// advance play. No-op (and no assertion) once the hand's last trick
// leaves it in 'closing' instead.
async function advanceIfResolving(sessions, room, gs) {
  if (gs.phase !== "resolving") return gs;
  return rpc(sessions[gs.last_trick_winner_seat], "resolve_resolving", { p_room_id: room.id });
}

async function scenarioA(sessions, impostorSession) {
  console.log("\n=== Scenario A: normal close, continues to the next hand ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [1, 1], ases: ASES, kamikazes: 0 };
  const { room, players, gs: gs0, bidMano, bidPie } = await setupRoom(sessions, config, 0);
  console.log(`  room=${room.code} bid_mano_seat=${gs0.bid_mano_seat} dealer_seat=${gs0.dealer_seat}`);

  // estructura[0]=1: the hand's only trick is also its last base, so this
  // single play_card call each takes it straight from 'playing' to
  // 'closing' (no 'resolving' stop in between).
  let gs = await playOneTrick(sessions, room, gs0, (seat, hand) => hand[0]);
  assertEq(gs.phase, "closing", "phase after the hand's only trick");

  await assertRpcFails(
    impostorSession.rpc("close_hand", { p_room_id: room.id }),
    "close_hand rejects a caller who isn't a room member"
  );

  // gs.last_trick_winner_seat is the server's own recorded winner (the
  // actual system under test) — trusted directly rather than
  // recomputed, since there's no client-side trick engine left to
  // recompute it independently against (see the file header).
  const allPlayers = await playersForRoom(sessions[0], room.id);
  const winnerTeam = allPlayers.find((p) => p.seat === gs.last_trick_winner_seat).team;
  const hechoTeam0 = winnerTeam === 0 ? 1 : 0;
  const hechoTeam1 = winnerTeam === 1 ? 1 : 0;

  // bidMano/bidPie are keyed by mano/pie, not team0/team1 — mano_seat
  // (and so which team is "mano") is randomly dealt, so this has to be
  // remapped to team0/team1 before comparing against hand_results, which
  // is keyed by actual team number like game_state.bids is. gs0 is the
  // pre-trick snapshot (right after bidding), so mano_seat and
  // bid_mano_seat are still identical here — either works, bid_mano_seat
  // used for consistency with the rest of this batch.
  const manoTeam = gs0.bid_mano_seat % 2;
  const pedTeam0 = manoTeam === 0 ? bidMano : bidPie;
  const pedTeam1 = manoTeam === 1 ? bidMano : bidPie;
  const { deltaN: expectedDelta0, deltaE: expectedDelta1 } = calcularPuntos(pedTeam0, pedTeam1, hechoTeam0, hechoTeam1);

  // close_hand is captain-only, dual-confirm (one captain of EACH team,
  // 20260706290000_close_hand_dual_captain_confirm.sql) — found while
  // repairing this script: "any room member"/"seat 2, not a captain"
  // describes an OLDER version of close_hand (before piece E's captain
  // gate and piece LL's dual-confirm requirement), no longer true.
  const captains = players.filter((p) => p.is_captain);
  await assertRpcFails(
    sessions[players.find((p) => !p.is_captain).seat].rpc("close_hand", { p_room_id: room.id }),
    "close_hand rejects a non-captain caller"
  );
  await rpc(sessions[captains[0].seat], "close_hand", { p_room_id: room.id });
  const after = await rpc(sessions[captains[1].seat], "close_hand", { p_room_id: room.id });

  const result = await handResultRow(sessions[0], room.id, gs0.hand_number);
  assertEq(result.bid_team0, pedTeam0, "hand_results.bid_team0");
  assertEq(result.bid_team1, pedTeam1, "hand_results.bid_team1");
  assertEq(result.tricks_team0, hechoTeam0, "hand_results.tricks_team0");
  assertEq(result.tricks_team1, hechoTeam1, "hand_results.tricks_team1");
  assertEq(result.delta_team0, expectedDelta0, "hand_results.delta_team0 matches calcularPuntos");
  assertEq(result.delta_team1, expectedDelta1, "hand_results.delta_team1 matches calcularPuntos");

  assertEq(after.phase, "dealing", "phase after close_hand (more hands remain)");
  assertEq(after.hand_number, 1, "hand_number advanced");
  assertEq(after.dealer_seat, (gs0.dealer_seat + 1) % N_JUG, "dealer_seat rotated");

  // Bonus: confirm deal_hand actually accepts this state and starts hand 1.
  // deal_hand_dealer_only (20260706200000) restricts the "next hand"
  // branch to the actual dealer_seat — found while repairing this script,
  // sessions[0] only worked by accident before this gate existed.
  const nextGs = await rpc(sessions[after.dealer_seat], "deal_hand", { p_room_id: room.id });
  assertEq(nextGs.phase, "bidding", "deal_hand accepts close_hand's output and starts the next hand");
  assertEq(nextGs.hand_number, 1, "deal_hand kept hand_number=1");
  const resetPlayers = await playersForRoom(sessions[0], room.id);
  assertEq(resetPlayers.every((p) => p.tricks_won === 0), true, "tricks_won reset for the new hand");

  console.log("  scenario A passed");
}

async function scenarioB(sessions) {
  console.log("\n=== Scenario B: normal close, last hand of the match ===");
  const config = { nJug: N_JUG, dosMazos: false, estructura: [1], ases: ASES, kamikazes: 0 };
  const { room, gs: gs0, bidMano, bidPie } = await setupRoom(sessions, config, 0);
  console.log(`  room=${room.code} bid_mano_seat=${gs0.bid_mano_seat}`);

  const gs = await playOneTrick(sessions, room, gs0, (seat, hand) => hand[0]);
  assertEq(gs.phase, "closing", "phase after the hand's only trick");

  // Dual-captain confirm (see scenario A) — seat 0/1 are captains of
  // team0/team1 respectively, since setupRoom's choose_team loop makes
  // the first joiner of each team its captain.
  await rpc(sessions[0], "close_hand", { p_room_id: room.id });
  const after = await rpc(sessions[1], "close_hand", { p_room_id: room.id });
  assertEq(after.phase, "finished", "phase after close_hand (last hand of the match)");
  assertEq(after.end_cause, "normal", "end_cause");

  const { data: roomAfter, error } = await sessions[0].from("rooms").select("status").eq("id", room.id).single();
  if (error) throw error;
  assertEq(roomAfter.status, "finished", "rooms.status");

  await assertRpcFails(
    sessions[0].rpc("close_hand", { p_room_id: room.id }),
    "close_hand rejects a call outside the closing phase"
  );

  console.log("  scenario B passed");
}

// Plays out one trick, forcing it to the non-mano team: looks at BOTH
// non-mano players' current hands, finds whichever single card among them
// has the highest jerarquia, and has its owner play it — a stronger
// guarantee than "one fixed player always plays their own max" (piece
// 4d's Oros script), since it doesn't matter which of the two non-mano
// seats actually holds the trick's best card. Mano-team players play
// their own lowest remaining card, excluding the Bastos/Espadas aces
// (jerarquia overrides unrelated to raw valor). Still not airtight against
// small-hand bad luck (see engineerKamikazeHand's retry loop) — with only
// 3 cards dealt per player (not the full 40-card deck the Oros/Copas
// scripts use), a mano player's weakest card can occasionally still beat
// both non-mano hands' best remaining card.
async function playTrickForNonMano(sessions, room, gs, manoSeats, nonManoSeats) {
  const hands = {};
  for (const seat of [...manoSeats, ...nonManoSeats]) {
    hands[seat] = await myHand(sessions[seat], room.id, gs.hand_number);
  }

  let winSeat = null;
  let winCard = null;
  for (const seat of nonManoSeats) {
    for (const c of hands[seat]) {
      if (!winCard || jerarquia(c) > jerarquia(winCard)) {
        winSeat = seat;
        winCard = c;
      }
    }
  }

  const cardToPlay = {};
  cardToPlay[winSeat] = winCard;
  for (const seat of nonManoSeats) {
    if (seat === winSeat) continue;
    const candidates = hands[seat].filter((c) => !isBastosAce(c) && !isEspadasAce(c));
    // A seat's only remaining card(s) can, with a 3-card hand, occasionally
    // be nothing but the Bastos/Espadas aces once excluded — there's no
    // safe "low" card left to force. Rather than fall back to playing a
    // card that could flip the trick's winner, bail out and let the
    // caller retry with a fresh room.
    if (candidates.length === 0) return null;
    cardToPlay[seat] = candidates.reduce((worst, c) => (jerarquia(c) < jerarquia(worst) ? c : worst), candidates[0]);
  }
  for (const seat of manoSeats) {
    const candidates = hands[seat].filter((c) => !isBastosAce(c) && !isEspadasAce(c));
    if (candidates.length === 0) return null;
    cardToPlay[seat] = candidates.reduce((worst, c) => (jerarquia(c) < jerarquia(worst) ? c : worst), candidates[0]);
  }

  return playOneTrick(sessions, room, gs, (seat) => cardToPlay[seat]);
}

// Sets up a room and plays out every trick of hand 0 trying to deny the
// mano team any tricks at all. Returns null (caller retries with a fresh
// room) if the mano team still won at least one trick despite the
// engineered plays — self-verified rather than assumed, same "retry until
// observed" pattern as the Copas/Oros scripts.
async function engineerKamikazeHand(sessions, config, bidMano) {
  const totalBases = config.estructura[0];
  const { room, players, gs: gs0, bidPie } = await setupRoom(sessions, config, bidMano);
  const manoTeam = gs0.bid_mano_seat % 2;
  const manoSeats = players.filter((p) => p.team === manoTeam).map((p) => p.seat);
  const nonManoSeats = players.filter((p) => p.team !== manoTeam).map((p) => p.seat);

  let gs = gs0;
  for (let trick = 0; trick < totalBases; trick++) {
    gs = await playTrickForNonMano(sessions, room, gs, manoSeats, nonManoSeats);
    if (!gs) return null; // no safe "low" card left for some seat this attempt, retry fresh
    gs = await advanceIfResolving(sessions, room, gs);
  }
  if (gs.phase !== "closing") throw new Error(`expected 'closing' after the hand's last trick, got '${gs.phase}'`);

  const playersAfter = await playersForRoom(sessions[0], room.id);
  const hechoMano = playersAfter.filter((p) => p.team === manoTeam).reduce((s, p) => s + p.tricks_won, 0);
  if (hechoMano !== 0) return null; // mano team wasn't fully denied this attempt, retry fresh

  return { room, players, gs0, gs, manoTeam, bidPie, totalBases };
}

async function scenarioC(sessions) {
  console.log("\n=== Scenario C: kamikaze-loss close (not the match's last hand) ===");
  // 2-hand match: hand 0 is where the kamikaze loss is engineered, so a
  // pass here proves the kamikaze check fires ahead of (independent of)
  // the last-hand check, matching cerrarMano's precedence.
  const config = { nJug: N_JUG, dosMazos: false, estructura: [3, 3], ases: ASES, kamikazes: 0 };
  // A plain bid of "all of it" (not flagged kamikaze) — legal, and
  // exactly the case the noDeclarado rule exists to catch.
  const bidMano = config.estructura[0];

  // Raised from 30 to 100 while re-running this script for the mano_seat/
  // bid_mano_seat batch (unrelated to that fix — the engineered "deny mano
  // every trick" heuristic is inherently probabilistic with only 3-card
  // hands, see playTrickForNonMano's own comment; 30 attempts observed
  // failing outright, 100 reliably succeeds within a handful).
  const MAX_ATTEMPTS = 100;
  let setup = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !setup; attempt++) {
    setup = await engineerKamikazeHand(sessions, config, bidMano);
    if (!setup) console.log(`  attempt ${attempt}/${MAX_ATTEMPTS}: mano team wasn't fully denied, retrying...`);
  }
  if (!setup) throw new Error(`could not deny the mano team every trick in ${MAX_ATTEMPTS} attempts`);

  const { room, players, gs0, gs, manoTeam, bidPie, totalBases } = setup;
  console.log(`  room=${room.code} bid_mano_seat=${gs0.bid_mano_seat} manoTeam=${manoTeam} bidMano=${bidMano} bidPie=${bidPie}`);
  console.log(`  mano team denied every trick, engineered successfully`);

  // mano_seat/bid_mano_seat split (batch fix post-pieza-J): the mano team
  // lost every trick, so mano_seat has now drifted to whichever non-mano
  // seat won the LAST trick (resolve_trick/resolve_resolving's fix, this
  // same batch) — bid_mano_seat must NOT have moved. This is the exact
  // scenario the split exists for: if close_hand read mano_seat instead
  // of bid_mano_seat for the kamikaze check below, it would blame the
  // WRONG team (the one that just won everything) instead of the team
  // that actually made the bad bid.
  assertEq(gs.bid_mano_seat, gs0.bid_mano_seat, "bid_mano_seat still frozen at the original bidding-time mano");
  if (gs.mano_seat === gs.bid_mano_seat) {
    throw new Error(`expected mano_seat (${gs.mano_seat}) to have drifted away from bid_mano_seat (${gs.bid_mano_seat}) — the mano team lost every trick, so the last trick's winner (now mano_seat) must be on the OTHER team`);
  }
  console.log(`  ok: mano_seat (${gs.mano_seat}) drifted away from bid_mano_seat (${gs.bid_mano_seat}) — mano team lost every trick, as engineered`);

  // Same bidMano/bidPie -> team0/team1 remapping as scenario A: mano/pie
  // is not the same axis as team0/team1.
  const pedTeam0 = manoTeam === 0 ? bidMano : bidPie;
  const pedTeam1 = manoTeam === 1 ? bidMano : bidPie;
  const hechoTeam0 = manoTeam === 0 ? 0 : totalBases;
  const hechoTeam1 = manoTeam === 1 ? 0 : totalBases;
  const { deltaN: expectedDelta0, deltaE: expectedDelta1 } = calcularPuntos(pedTeam0, pedTeam1, hechoTeam0, hechoTeam1);
  const expectedDeltaMano = manoTeam === 0 ? expectedDelta0 : expectedDelta1;
  if (expectedDeltaMano > -2) {
    throw new Error(`expected the mano team's delta to trigger noDeclarado (<=-2), got ${expectedDeltaMano}`);
  }
  console.log(`    expected delta_mano=${expectedDeltaMano} (calcularPuntos) — triggers noDeclarado`);

  // Dual-captain confirm (see scenario A).
  const captains = players.filter((p) => p.is_captain);
  await rpc(sessions[captains[0].seat], "close_hand", { p_room_id: room.id });
  const after = await rpc(sessions[captains[1].seat], "close_hand", { p_room_id: room.id });

  const result = await handResultRow(sessions[0], room.id, gs0.hand_number);
  assertEq(result.bid_team0, pedTeam0, "hand_results.bid_team0");
  assertEq(result.bid_team1, pedTeam1, "hand_results.bid_team1");
  assertEq(result.delta_team0, expectedDelta0, "hand_results.delta_team0 matches calcularPuntos");
  assertEq(result.delta_team1, expectedDelta1, "hand_results.delta_team1 matches calcularPuntos");

  assertEq(after.phase, "finished", "phase after close_hand (kamikaze loss)");
  assertEq(after.end_cause, "kamikaze", "end_cause");
  assertEq(after.hand_number, gs0.hand_number, "hand_number unchanged (game ended, didn't advance)");

  const { data: roomAfter, error } = await sessions[0].from("rooms").select("status").eq("id", room.id).single();
  if (error) throw error;
  assertEq(roomAfter.status, "finished", "rooms.status");

  console.log("  scenario C passed");
}

async function main() {
  console.log("Signing in 5 anonymous sessions (4 players + 1 unaffiliated impostor)...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());
  const impostorSession = await newSession();

  await scenarioA(sessions, impostorSession);
  await scenarioB(sessions);
  await scenarioC(sessions);

  console.log("\nAll checks passed against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
