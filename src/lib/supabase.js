import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Todas las RPCs del servidor (create_room, join_room, ...) requieren
// auth.uid(): sin esto, cualquier llamada falla con "not_authenticated".
// signInAnonymously() no muestra ningún formulario ni pide credenciales;
// supabase-js persiste la sesión sola en localStorage, así que llamar esto
// de nuevo en una visita futura simplemente reutiliza la sesión existente.
let sesionAnonima = null;
export async function asegurarSesion() {
  if (sesionAnonima) return sesionAnonima;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    sesionAnonima = session;
    return session;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  sesionAnonima = data.session;
  return sesionAnonima;
}
