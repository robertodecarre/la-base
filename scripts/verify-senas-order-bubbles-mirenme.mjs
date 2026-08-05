// Verifies the rediseño de barra de señas RPCs (set_senas_order,
// set_senas_bubble, mirenme_request/_watch/_unwatch,
// supabase/migrations/20260805000000_senas_order_bubbles_mirenme.sql)
// end-to-end against the real linked Supabase project — same approach as
// the other verify-*.mjs scripts in this repo (direct .rpc() calls, no
// Edge Function, no mocking).
//
// Usage: node --env-file=.env scripts/verify-senas-order-bubbles-mirenme.mjs
//
// Scenarios:
//   A. set_senas_order writes only the caller's team's _order, other
//      team's key untouched, existing meaning entries untouched.
//   B. set_senas_order and set_senas_bubble both still work AFTER
//      deal_hand (room.status no longer 'waiting') — unlike
//      set_senas_mapping, they're not gated to the lobby.
//   C. set_senas_bubble writes {on,text} under the caller's team's
//      _bubbles[key], other team untouched.
//   D. mirenme_request toggles: first call creates an empty-array request,
//      second call (manual cancel) deletes the key entirely.
//   E. mirenme_watch: a teammate can watch an active request; the array
//      gains their seat. Rejects a non-existent request and a
//      cross-team requester seat.
//   F. mirenme_unwatch removes the watcher but leaves the request key
//      present (so "Te miro" again on the same request still works).
//   G. Manual cancel (mirenme_request while active) deletes the request
//      even while a teammate is still watching — priority over watchers.
//   H. Mutual exclusion: starting to watch a teammate's request
//      auto-cancels my own active request; starting my own request
//      auto-removes me from any request I was watching.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.");
  console.error("Run with: node --env-file=.env scripts/verify-senas-order-bubbles-mirenme.mjs");
  process.exit(1);
}

const N_JUG = 4;

function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = normalize(v[k]); return acc; }, {});
  }
  return v;
}
function assertEq(actual, expected, label) {
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`    ok: ${label} (${JSON.stringify(actual)})`);
}
function assert(cond, label) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`    ok: ${label}`);
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
  for (let i = 0; i < N_JUG; i++) {
    clients.push(await newSession());
    await sleep(300);
  }

  console.log("\nSetup: create_room + join_room + choose_team x4 (seats 0/2=team0, 1/3=team1)");
  const room = await rpc(clients[0], "create_room", { p_config: { nJug: N_JUG, estructura: [1, 2, 3] } });
  for (let i = 0; i < N_JUG; i++) {
    await rpc(clients[i], "join_room", { p_code: room.code, p_name: `P${i}` });
  }
  await rpc(clients[0], "choose_team", { p_room_id: room.id, p_team: 0 });
  await rpc(clients[1], "choose_team", { p_room_id: room.id, p_team: 1 });
  await rpc(clients[2], "choose_team", { p_room_id: room.id, p_team: 0 });
  await rpc(clients[3], "choose_team", { p_room_id: room.id, p_team: 1 });

  console.log("\nA. set_senas_order writes only the caller's team, leaves meanings/other team untouched");
  await rpc(clients[0], "set_senas_mapping", { p_room_id: room.id, p_mapping: { beso: "tengo 2 bajas" } });
  const orderTeam0 = ["beso", "guino", "lengua"];
  const roomAfterOrder = await rpc(clients[0], "set_senas_order", { p_room_id: room.id, p_order: orderTeam0 });
  assertEq(roomAfterOrder.senas_mapping.team0._order, orderTeam0, "team0._order stored");
  assertEq(roomAfterOrder.senas_mapping.team0.beso, "tengo 2 bajas", "team0 meaning entry untouched by order write");
  assertEq(roomAfterOrder.senas_mapping.team1 ?? null, null, "team1 key still absent");

  console.log("\nC. set_senas_bubble writes only the caller's team's _bubbles[key]");
  const roomAfterBubble = await rpc(clients[0], "set_senas_bubble", { p_room_id: room.id, p_gesture_key: "shhh", p_on: false, p_text: "Custom!" });
  assertEq(roomAfterBubble.senas_mapping.team0._bubbles.shhh, { on: false, text: "Custom!" }, "team0._bubbles.shhh stored");
  assertEq(roomAfterBubble.senas_mapping.team0._order, orderTeam0, "team0._order untouched by bubble write");

  console.log("\nB setup: sortear + deal_hand (room leaves 'waiting')");
  await rpc(clients[0], "sortear_reparto_inicial", { p_room_id: room.id });
  const { data: roomRow } = await clients[0].from("rooms").select("sorteo_inicial").eq("id", room.id).single();
  const dealerSeat = roomRow.sorteo_inicial.ganador_seat;
  await rpc(clients[dealerSeat], "deal_hand", { p_room_id: room.id });

  console.log("\nB. set_senas_order / set_senas_bubble still work once the room is 'playing' (unlike set_senas_mapping)");
  await rpcExpectError(clients[0], "set_senas_mapping", { p_room_id: room.id, p_mapping: { guino: "x" } }, "room_not_open");
  const orderAfterPlaying = ["lengua", "beso", "guino"];
  const roomAfterOrder2 = await rpc(clients[0], "set_senas_order", { p_room_id: room.id, p_order: orderAfterPlaying });
  assertEq(roomAfterOrder2.senas_mapping.team0._order, orderAfterPlaying, "order still editable mid-game");
  const roomAfterBubble2 = await rpc(clients[0], "set_senas_bubble", { p_room_id: room.id, p_gesture_key: "enojo", p_on: true, p_text: "Otra cosa" });
  assertEq(roomAfterBubble2.senas_mapping.team0._bubbles.enojo, { on: true, text: "Otra cosa" }, "bubble still editable mid-game");

  console.log("\nD. mirenme_request toggles: create then manual-cancel deletes the key");
  const gsAfterRequest = await rpc(clients[0], "mirenme_request", { p_room_id: room.id });
  assertEq(gsAfterRequest.mirenme.team0["0"], [], "P0's own request created, empty watcher array");
  const gsAfterCancel = await rpc(clients[0], "mirenme_request", { p_room_id: room.id });
  assert(!("0" in (gsAfterCancel.mirenme.team0 || {})), "P0's own request removed by pressing Mírenme again");

  console.log("\nE. mirenme_watch: teammate watches, rejects bad requests");
  await rpc(clients[0], "mirenme_request", { p_room_id: room.id }); // P0 opens a request again
  await rpcExpectError(clients[2], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 1 }, "invalid_requester_seat");
  await rpcExpectError(clients[0], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 2 }, "request_not_active");
  const gsAfterWatch = await rpc(clients[2], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 0 });
  assertEq(gsAfterWatch.mirenme.team0["0"], ["2"], "P2 (teammate) now watching P0's request");

  console.log("\nF. mirenme_unwatch removes the watcher but keeps the request key (can re-watch)");
  const gsAfterUnwatch = await rpc(clients[2], "mirenme_unwatch", { p_room_id: room.id, p_requester_seat: 0 });
  assertEq(gsAfterUnwatch.mirenme.team0["0"], [], "watcher array empty");
  assert("0" in gsAfterUnwatch.mirenme.team0, "request key 0 still present after unwatch");
  const gsAfterRewatch = await rpc(clients[2], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 0 });
  assertEq(gsAfterRewatch.mirenme.team0["0"], ["2"], "P2 can watch the same request again after unwatching");

  console.log("\nG. Manual cancel deletes the request even with an active watcher (priority)");
  const gsAfterManualCancel = await rpc(clients[0], "mirenme_request", { p_room_id: room.id });
  assert(!("0" in (gsAfterManualCancel.mirenme.team0 || {})), "P0's request gone even though P2 was watching");

  console.log("\nH. Mutual exclusion both directions");
  await rpc(clients[0], "mirenme_request", { p_room_id: room.id }); // P0 opens again
  await rpc(clients[2], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 0 }); // P2 watches P0
  const gsP2OwnRequest = await rpc(clients[2], "mirenme_request", { p_room_id: room.id }); // P2 starts own -> auto-unwatches P0
  assertEq(gsP2OwnRequest.mirenme.team0["0"], [], "starting my own request auto-removed me from the one I was watching");
  assertEq(gsP2OwnRequest.mirenme.team0["2"], [], "P2's own request now active");
  const gsP0Watches = await rpc(clients[0], "mirenme_watch", { p_room_id: room.id, p_requester_seat: 2 }); // P0 watches P2 -> P0 had its own active, must auto-cancel
  assert(!("0" in gsP0Watches.mirenme.team0), "P0's own request auto-cancelled by starting to watch P2");
  assertEq(gsP0Watches.mirenme.team0["2"], ["0"], "P0 now watching P2's request");

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
