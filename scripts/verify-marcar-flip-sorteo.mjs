// Verifies piece H's marcar_flip_sorteo RPC end-to-end against the real
// linked Supabase project — direct .rpc() calls, same pattern as every
// other verify-*.mjs script here.
//
// Usage: node --env-file=.env scripts/verify-marcar-flip-sorteo.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
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

async function main() {
  console.log("Signing in 4 anonymous sessions...");
  const clients = [];
  for (let i = 0; i < 4; i++) { clients.push(await newSession()); await sleep(300); }

  const room = await rpc(clients[0], "create_room", { p_config: { nJug: 4, estructura: [1, 1] } });
  for (const c of clients) await rpc(c, "join_room", { p_code: room.code, p_name: "P" });
  for (let i = 0; i < 4; i++) await rpc(clients[i], "choose_team", { p_room_id: room.id, p_team: i % 2 });

  console.log("\n1) marcar_flip_sorteo before sorteo_inicial exists -> sorteo_not_ready");
  await rpcExpectError(clients[0], "marcar_flip_sorteo", { p_room_id: room.id }, "sorteo_not_ready");

  const roomAfterSorteo = await rpc(clients[0], "sortear_reparto_inicial", { p_room_id: room.id });
  assertEq(!!roomAfterSorteo.sorteo_inicial, true, "sorteo_inicial resuelto");
  assertEq(roomAfterSorteo.sorteo_inicial.flipped ?? null, null, "flipped ausente hasta el primer flip");

  console.log("\n2) seat 0 flips its own card");
  const r1 = await rpc(clients[0], "marcar_flip_sorteo", { p_room_id: room.id });
  assertEq(r1.sorteo_inicial.flipped, { "0": true }, "flipped tiene solo seat 0");

  console.log("\n3) seat 1 flips, seat 0's flip is preserved (no se pisa)");
  const r2 = await rpc(clients[1], "marcar_flip_sorteo", { p_room_id: room.id });
  assertEq(r2.sorteo_inicial.flipped, { "0": true, "1": true }, "flipped acumula ambos asientos");

  console.log("\n4) flipping again is idempotent (no-op, no error)");
  const r3 = await rpc(clients[0], "marcar_flip_sorteo", { p_room_id: room.id });
  assertEq(r3.sorteo_inicial.flipped, { "0": true, "1": true }, "re-flip no cambia nada");

  console.log("\n5) a non-member can't flip a room they're not in");
  const outsider = await newSession();
  await rpcExpectError(outsider, "marcar_flip_sorteo", { p_room_id: room.id }, "not_room_member");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
