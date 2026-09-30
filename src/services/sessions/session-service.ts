import { supabase } from "@/integrations/supabase/client";

export type SessionListRow = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: { count: number }[];
};

export type SessionDetail = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  current_question_id: string | null;
  all_active?: boolean;
  active_question_ids?: string[] | null;
  expires_at?: string | null;
  image_url?: string | null;
  created_at?: string;
  creator_id?: string;
  is_exam?: boolean;
  max_fullscreen_exits?: number;
  block_clipboard?: boolean;
  block_right_click?: boolean;
};

/**
 * Reads all sessions created by the specified faculty user with participant counts.
 */
export async function getFacultySessions(creatorId: string): Promise<SessionListRow[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id,title,code,status,created_at,participants(count)")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[SessionService] Error fetching faculty sessions:", error);
    throw error;
  }

  return (data as unknown as SessionListRow[]) ?? [];
}

/**
 * Reads a single session by its unique ID, preserving schema backwards compatibility with core columns.
 */
export async function getSessionById(sessionId: string): Promise<SessionDetail | null> {
  const { data: s, error: sErr } = await (supabase.from("sessions") as any)
    .select(
      "id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url,created_at,creator_id,is_exam,max_fullscreen_exits,block_clipboard,block_right_click",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr) {
    console.warn("[SessionService] Integrity columns load failed, falling back to core columns:", sErr);
    const { data: fallbackS, error: fbErr } = await supabase
      .from("sessions")
      .select(
        "id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url,created_at,creator_id",
      )
      .eq("id", sessionId)
      .maybeSingle();

    if (fbErr) {
      console.error("[SessionService] Error fetching fallback session details:", fbErr);
      throw fbErr;
    }

    return (fallbackS as unknown as SessionDetail) || null;
  }

  return (s as unknown as SessionDetail) || null;
}
