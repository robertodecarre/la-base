// Verifies piece CC's redraw-on-tie fix end-to-end against the real
// linked Supabase project: sortear_reparto_inicial must never return a
// result with a tied highest jerarquía — every trial's winner has to be
// STRICTLY above every other seat, never "lowest seat among the tied
// max" (the old behavior this replaces). Genuine randomness means a
// single trial proves nothing either way, so this runs many independent
// rooms and asserts the invariant holds on every one of them.
//
// nJug=8 (not 4): more seats drawing from the same deck makes a tie in
// nominal value likelier per trial (jerarquía only cares about value,
// and 4 suits share most values 1-7/10-12) — this exercises the redraw
// path far more often than 4p would across the same number of trials,
// without needing to fake/seed the RNG.
//
// Usage: node --env-file=.env scripts/verify-sorteo-redraw-tie.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const N_JUG = 8;
const N_TRIALS = 40;
const CONFIG = {
  nJug: N_JUG,
  dosMazos: false,
  estructura: [1],
  ases: { espadas: false, copas: false, oros: false },
  kamikazes: 0,
};

function jerarquia(carta) {
  if (carta.valor === 1 && carta.palo.n === "Bastos") return 100;
  return carta.valor;
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

async function main() {
  console.log(`Running ${N_TRIALS} independent sorteo trials against the real project (nJug=${N_JUG})...`);
  const session = await newSession();

  let tiedCardValuesSeen = 0; // sanity check that ties are actually possible/common with this setup
  for (let trial = 1; trial <= N_TRIALS; trial++) {
    const room = await rpc(session, "create_room", { p_config: CONFIG });
    // is_room_member requires a players row — join as the sole member.
    // Only need ONE session to call it — first-call-wins semantics
    // (unchanged by this piece), doesn't need all seats joined.
    await rpc(session, "join_room", { p_code: room.code, p_name: "J0" });
    const result = await rpc(session, "sortear_reparto_inicial", { p_room_id: room.id });
    const sorteo = result.sorteo_inicial;
    if (!sorteo || !Array.isArray(sorteo.cartas)) {
      throw new Error(`trial ${trial}: sorteo_inicial missing/malformed: ${JSON.stringify(sorteo)}`);
    }

    const jerBySeat = sorteo.cartas.map((c) => jerarquia(c.carta));
    const maxJer = Math.max(...jerBySeat);
    const winners = jerBySeat.reduce((acc, j, seat) => (j === maxJer ? [...acc, seat] : acc), []);
    if (winners.length > 1) {
      throw new Error(`trial ${trial}: FAIL — tie survived in the final result, winners at seats ${winners} all with jerarquía ${maxJer} (redraw-on-tie did not fire or did not resolve it)`);
    }
    if (sorteo.ganador_seat !== winners[0]) {
      throw new Error(`trial ${trial}: FAIL — ganador_seat=${sorteo.ganador_seat} doesn't match the seat with strictly-highest jerarquía (${winners[0]})`);
    }

    // Not a failure signal on its own — just confirms this test setup
    // actually produces tie-prone raw draws often enough that "never a
    // tie in the final result" is a meaningful assertion, not a fluke of
    // nJug/deck choice.
    const uniqueValuesDrawn = new Set(sorteo.cartas.map((c) => `${c.carta.valor}-${c.carta.palo.n === "Bastos" && c.carta.valor === 1}`)).size;
    if (uniqueValuesDrawn < sorteo.cartas.length) tiedCardValuesSeen++;
  }

  console.log(`  ok: all ${N_TRIALS} trials resolved to a single strict winner (no tie ever survived to the final result)`);
  console.log(`  info: ${tiedCardValuesSeen}/${N_TRIALS} trials' FINAL draw still contained duplicate non-winning values among seats (expected/harmless — only the TOP jerarquía has to be unique, confirms this setup exercises real tie scenarios).`);
  console.log("\nALL CHECKS PASSED against the real project.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
