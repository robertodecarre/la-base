import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { statusParaError } from "../_shared/errors.ts";
import { validarPedido } from "../_shared/validateBid.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("not_authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const roomId = body?.roomId;
    if (typeof roomId !== "string") throw new Error("invalid_config");

    const { data: gs, error: gsError } = await supabase
      .from("game_state")
      .select("hand_number, phase, mano_seat, bids, kamikazes_remaining")
      .eq("room_id", roomId)
      .single();
    if (gsError) throw new Error(gsError.message);
    if (gs.phase !== "bidding") throw new Error("not_bidding_phase");

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("config")
      .eq("id", roomId)
      .single();
    if (roomError) throw new Error(roomError.message);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("team, is_captain")
      .eq("room_id", roomId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (playerError) throw new Error("not_room_member");

    const teamMano = gs.mano_seat % 2;
    const teamPie = 1 - teamMano;
    const bids = gs.bids as { team0: number | null; team1: number | null };
    const bidsByTeam = [bids.team0, bids.team1];
    const requiredTeam = bidsByTeam[teamMano] === null ? teamMano : teamPie;

    if (bidsByTeam[requiredTeam] !== null) throw new Error("already_bid");
    if (player.team !== requiredTeam) throw new Error("not_your_teams_turn");
    if (!player.is_captain) throw new Error("not_captain");

    const totalBases = (room.config as { estructura: number[] }).estructura[gs.hand_number];
    const { value, kamikaze } = validarPedido(
      { totalBases, requiredTeam, teamMano, bidMano: bidsByTeam[teamMano] },
      body?.value,
      body?.kamikaze,
    );

    const { data, error } = await supabase.rpc("submit_bid", {
      p_room_id: roomId,
      p_value: value,
      p_kamikaze: kamikaze,
    });
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return new Response(JSON.stringify({ error: message }), {
      status: statusParaError(message),
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
