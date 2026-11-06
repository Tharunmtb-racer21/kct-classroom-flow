import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ML_SUPABASE_URL =
  import.meta.env.VITE_ML_SUPABASE_URL || "https://enssdnjdgoyotgronelk.supabase.co";
const ML_SUPABASE_ANON_KEY =
  import.meta.env.VITE_ML_SUPABASE_ANON_KEY || "sb_publishable_HihKdeM52ZOL58z5jZqJfg_hZ5e2IL6";

/**
 * Dedicated Supabase Client for the Machine Learning Database.
 * Used exclusively to persist and query student interaction telemetry, feature vectors,
 * and training datasets without consuming storage or realtime limits on the primary KCT PULSE database.
 */
export const mlSupabase: SupabaseClient = createClient(ML_SUPABASE_URL, ML_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
