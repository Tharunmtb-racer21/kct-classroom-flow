import { supabase } from "@/integrations/supabase/client";

export type Participant = {
  id: string;
  name: string;
  joined_at: string;
  risk_score?: number;
  risk_level?: "low" | "medium" | "high";
};

/**
 * Retrieves all participants for a given session sorted by joined_at.
 * Handles fallback gracefully if custom risk columns are not present in schema.
 */
export async function getParticipants(sessionId: string): Promise<Participant[]> {
  const { data: ps, error: psErr } = await (supabase.from("participants") as any)
    .select("id,name,joined_at,risk_score,risk_level")
    .eq("session_id", sessionId)
    .order("joined_at");

  if (psErr) {
    console.warn("[ParticipantService] Risk columns load failed, falling back to core fields:", psErr);
    const { data: fallbackPs, error: fbErr } = await supabase
      .from("participants")
      .select("id,name,joined_at")
      .eq("session_id", sessionId)
      .order("joined_at");

    if (fbErr) {
      console.error("[ParticipantService] Error fetching fallback participants:", fbErr);
      throw fbErr;
    }

    return (fallbackPs as unknown as Participant[]) ?? [];
  }

  return (ps as unknown as Participant[]) ?? [];
}
