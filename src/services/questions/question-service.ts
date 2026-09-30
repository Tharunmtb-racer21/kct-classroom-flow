import { supabase } from "@/integrations/supabase/client";

export type QType = "wordcloud" | "poll" | "quiz";

export type Question = {
  id: string;
  session_id: string;
  type: QType;
  title: string;
  options: string[];
  correct_answer: string | null;
  order_index: number;
  image_url?: string | null;
  points?: number;
  marks?: number;
  explanation?: string | null;
  question_type?: string;
};

/**
 * Retrieves all questions for a given session sorted by order_index.
 * Preserves question options, points, marks, correct answers, and types.
 */
export async function getQuestions(sessionId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index");

  if (error) {
    console.error("[QuestionService] Error fetching questions for session:", error);
    throw error;
  }

  return (data as unknown as Question[]) ?? [];
}
