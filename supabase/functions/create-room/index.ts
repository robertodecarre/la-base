import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { statusParaError } from "../_shared/errors.ts";
import { validarConfig } from "../_shared/validateConfig.ts";

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

    const config = validarConfig(await req.json());

    const { data, error } = await supabase.rpc("create_room", { p_config: config });
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify(data), {
      status: 201,
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
