export type Response = {
  id: string;
  answer: string;
  participant_id: string;
  created_at: string;
};

export type Question = {
  id: string;
  title: string;
  type: "wordcloud" | "poll" | "quiz";
  options: string[];
  correct_answer: string | null;
  order_index: number;
  points?: number;
  marks?: number;
  responses: Response[];
};

export type Participant = {
  id: string;
  name: string;
  joined_at: string;
};

export type Row = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: Participant[];
  questions: Question[];
};
