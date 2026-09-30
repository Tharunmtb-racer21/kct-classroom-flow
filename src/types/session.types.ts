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

export type Session = {
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

export type Participant = {
  id: string;
  name: string;
  joined_at: string;
  risk_score?: number;
  risk_level?: "low" | "medium" | "high";
};

export type Response = {
  id: string;
  question_id: string;
  participant_id: string;
  answer: string;
  created_at: string;
  image_url?: string | null;
};
