// Verifies piece BB's revancha_partida RPC end-to-end against the real
// linked Supabase project: playing a 1-hand match to 'finished', then
// requesting a rematch resets hand_number/scores/history while keeping
// the same room/players/teams/seats (no trip back through team
// selection), and the resulting state is actually playable again — hand
// 0 of the rematch deals and plays through the EXISTING deal_hand/
// play_card/close_hand RPCs untouched, reaching 'closing' a second time.
//
// Usage: node --env-file=.env scripts/verify-revancha.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const N_JUG = 4;
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [1],
  ases: { espadas: false, copas: false, oros: false },
  kamikazes: 0,
};

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ok: ${label} (${JSON.stringify(actual)})`);
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

async function playTrick(sessions, room, gs) {
  const startBase = gs.base_num;
  while (gs.phase === "playing" && gs.base_num === startBase) {
    const seat = gs.turn_seat;
    const cards = await myHand(sessions[seat], room.id, gs.hand_number);
    gs = await rpc(sessions[seat], "play_card", { p_room_id: room.id, p_card_uid: cards[0].uid });
  }
  return gs;
}

async function playOneHandToFinished(sessions, room, players, dealerSeat = 0) {
  // deal_hand_dealer_only (20260706200000_captain_dealer_gates.sql) only
  // lets the actual dealer_seat call deal_hand once a game_state row
  // already exists (2nd+ hand of a room's life, including hand 0 of a
  // REVANCHA) — the room's very first hand ever (no game_state row yet)
  // is ungated, which is why the original default of seat 0 worked for
  // match 1 here (no real sorteo in this test, so dealer_seat there is
  // whatever deal_hand's own random fallback picks — irrelevant, since
  // that branch doesn't check who's calling). Piece II's revancha fix
  // makes the REMATCH's dealer_seat a real, non-zero seat sometimes, so
  // callers past match 1 must pass the actual dealer.
  let gs = await rpc(sessions[dealerSeat], "deal_hand", { p_room_id: room.id });
  const teamMano = gs.mano_seat % 2;
  const captainMano = players.find((p) => p.team === teamMano && p.is_captain);
  // estructura=[1]: pie has exactly one legal bid (opcionesValidas
  // collapses to a single option for a 1-card hand), so mano's submit_bid
  // alone resolves both and jumps straight to 'playing' — pie's captain
  // never gets a second call (piece D, 20260706190000).
  gs = await rpc(sessions[captainMano.seat], "submit_bid", { p_room_id: room.id, p_value: 1, p_kamikaze: false });
  assertEq(gs.phase, "playing", "submit_bid auto-resolved pie's forced bid for a 1-card hand");

  // estructura=[1]: the only base is also the LAST base of the hand —
  // piece AA sends it straight to 'closing' (no 'resolving'/Llevar-base
  // step in between).
  gs = await playTrick(sessions, room, gs);
  assertEq(gs.phase, "closing", "phase after the only/last base of hand 0");

  // Piece LL: close_hand now needs a captain of EACH team to confirm.
  const captains = players.filter((p) => p.is_captain);
  await rpc(sessions[captains[0].seat], "close_hand", { p_room_id: room.id });
  gs = await rpc(sessions[captains[1].seat], "close_hand", { p_room_id: room.id });
  assertEq(gs.phase, "finished", "phase after closing the match's only hand");
  return gs;
}

async function playedCardsCount(client, roomId) {
  const { count, error } = await client
    .from("played_cards")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) throw error;
  return count;
}

async function handResultsCount(client, roomId) {
  const { count, error } = await client
    .from("hand_results")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) throw error;
  return count;
}

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const sessions = [];
  for (let i = 0; i < N_JUG; i++) sessions.push(await newSession());

  const room = await rpc(sessions[0], "create_room", { p_config: CONFIG });
  for (let i = 0; i < N_JUG; i++) {
    await rpc(sessions[i], "join_room", { p_code: room.code, p_name: `J${i}` });
  }
  const players = [];
  for (let i = 0; i < N_JUG; i++) {
    players.push(await rpc(sessions[i], "choose_team", { p_room_id: room.id, p_team: i % 2 }));
  }

  console.log("\n=== Playing the match's only hand to 'finished' ===");
  const gsFinished = await playOneHandToFinished(sessions, room, players);
  assertEq(await playedCardsCount(sessions[0], room.id), N_JUG, "played_cards has the 4 cards from hand 0, pre-revancha");
  assertEq(await handResultsCount(sessions[0], room.id), 1, "hand_results has 1 row, pre-revancha");
  // close_hand's 'finished' branch never touches dealer_seat/mano_seat, so
  // these are exactly the last (only) hand's pie/mano — piece II's fix
  // target.
  //
  // mano_seat/bid_mano_seat split (batch fix post-pieza-J): this match's
  // only hand is 1 card = 1 trick = the hand's LAST base, which now goes
  // through resolve_trick's direct-to-'closing' branch and sets mano_seat
  // to whoever actually WON that trick (20260804010000) — which may or
  // may not be the original bidding-time mano. bid_mano_seat never moves.
  // revancha_partida's dealer seed must use bid_mano_seat (rotation is
  // pure seat order, confirmed unaffected by in-hand events), so this
  // script now tracks both and asserts against the right one.
  const oldDealerSeat = gsFinished.dealer_seat;
  const oldManoSeat = gsFinished.mano_seat;
  const oldBidManoSeat = gsFinished.bid_mano_seat;
  const oldPieTeam = oldDealerSeat % 2;
  const oldBidManoTeam = oldBidManoSeat % 2;
  console.log(`  (pre-revancha) pie(dealer) seat=${oldDealerSeat} team=${oldPieTeam}, mano seat=${oldManoSeat}, bid_mano seat=${oldBidManoSeat} team=${oldBidManoTeam}`);
  if (oldManoSeat !== oldBidManoSeat) {
    console.log(`  info: mano_seat (${oldManoSeat}) diverged from bid_mano_seat (${oldBidManoSeat}) this run — direct confirmation the split matters for this exact scenario.`);
  }

  console.log("\n=== Requesting revancha ===");
  // Non-captain, non-dealer, arbitrary seat — proves it's ungated by role.
  const nonCaptainSeat = players.find((p) => !p.is_captain).seat;
  const { error: notFinishedErr } = await sessions[0].rpc("revancha_partida", { p_room_id: "00000000-0000-0000-0000-000000000000" });
  if (!notFinishedErr) throw new Error("FAIL: revancha_partida on a nonexistent room should have failed");
  console.log(`  ok: revancha_partida rejects an unknown room (${notFinishedErr.message})`);

  let gs = await rpc(sessions[nonCaptainSeat], "revancha_partida", { p_room_id: room.id });
  assertEq(gs.hand_number, 0, "hand_number reset to 0");
  assertEq(gs.phase, "dealing", "phase reset to 'dealing'");
  assertEq(gs.base_num, 0, "base_num reset to 0");
  assertEq(gs.kamikaze_declared, false, "kamikaze_declared reset");
  assertEq(gs.end_cause, null, "end_cause cleared");

  assertEq(await playedCardsCount(sessions[0], room.id), 0, "played_cards wiped by revancha");
  assertEq(await handResultsCount(sessions[0], room.id), 0, "hand_results wiped by revancha");

  const { data: playersAfter, error: playersErr } = await sessions[0]
    .from("players")
    .select("seat, team, is_captain, name")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  if (playersErr) throw playersErr;
  const playersBefore = [...players].sort((a, b) => a.seat - b.seat)
    .map((p) => ({ seat: p.seat, team: p.team, is_captain: p.is_captain, name: p.name }));
  assertEq(playersAfter, playersBefore, "same seats/teams/captains/names preserved across revancha (no team-selection replay)");

  // Piece II (updated by the mano_seat/bid_mano_seat split): revancha_
  // partida seeds the new dealer_seat from the OLD bid_mano_seat — NOT
  // mano_seat, which may have drifted mid-hand via a base win or Oros and
  // must never influence dealer rotation — assert that directly off its
  // own return value, before deal_hand runs again and could muddy which
  // RPC actually set it.
  assertEq(gs.dealer_seat, oldBidManoSeat, "revancha's new dealer_seat (pie) is seeded from the last match's bid_mano_seat, not mano_seat");

  console.log("\n=== Second match plays through cleanly from the reset state ===");
  gs = await playOneHandToFinished(sessions, room, players, gs.dealer_seat);
  assertEq(gs.hand_number, 0, "hand_number of the rematch's only hand is 0, not 1 (a real second match, not a continuation)");
  assertEq(await handResultsCount(sessions[0], room.id), 1, "hand_results has exactly 1 row again (the rematch's hand 0, not appended to the old one)");

  // Piece II core assertion: the team that was PIE in the finished match
  // must be MANO in the rematch (and, symmetrically, the old BIDDING-TIME
  // mano team is the new pie team) — read off the rematch's own hand-0
  // dealer_seat/bid_mano_seat as computed by deal_hand, not re-derived by
  // hand. Uses oldBidManoTeam (not whatever mano_seat drifted to by the
  // end of the finished match), matching the "pure seat rotation" rule.
  //
  // gs here is the STATE AFTER the rematch's own hand 0 was played to
  // 'finished' (playOneHandToFinished returns post-close_hand) — so
  // gs.mano_seat has ALREADY been overwritten by that hand's actual last-
  // trick winner (resolve_trick's direct-to-closing branch, same fix as
  // above) and is no longer "the mano deal_hand assigned". gs.bid_mano_
  // seat is what stayed frozen at deal_hand's original assignment for
  // THIS (rematch) hand — that's the one piece II's inversion rule is
  // actually about.
  console.log("\n=== Piece II: pie/mano inversion across REVANCHA ===");
  assertEq(gs.dealer_seat % 2, oldBidManoTeam, "rematch's pie team is the old match's bidding-time mano team");
  assertEq(gs.bid_mano_seat % 2, oldPieTeam, "rematch's bidding-time mano team is the old match's pie team");

  console.log("\nALL CHECKS PASSED against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
