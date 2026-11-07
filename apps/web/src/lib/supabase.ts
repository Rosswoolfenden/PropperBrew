import { createClient } from "@supabase/supabase-js";

/** Browser auth client. Sessions persist in localStorage; sign-in links land with the session in the URL. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } },
);
