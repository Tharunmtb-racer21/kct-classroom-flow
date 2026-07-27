import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";
import { 
  Users, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Award, 
  CheckCircle2, 
  MessageSquare,
  BarChart3,
  Calendar,
  Sparkles
} from "lucide-react";

type Response = {
  id: string;
  answer: string;
  participant_id: string;
  created_at: string;
};

type Question = {
  id: string;
  title: string;
  type: "wordcloud" | "poll" | "quiz";
  options: string[];
  correct_answer: string | null;
  order_index: number;
  responses: Response[];
};

type Participant = {
  id: string;
  name: string;
  joined_at: string;
};

type Row = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: Participant[];
  questions: Question[];
};

export const Route = createFileRoute("/_authenticated/dashboard/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  
  // Use user from the route context (loaded securely in _authenticated beforeLoad)
  const { user } = Route.useRouteContext() as { user: any };

  useEffect(() => {
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select(`
            id,
            title,
            code,
            status,
            created_at,
            participants (
              id,
              name,
              joined_at
            ),
            questions (
              id,
              title,
              type,
              options,
              correct_answer,
              order_index,
              responses (
                id,
                answer,
                participant_id,
                created_at
              )
            )
          `)
          .eq("creator_id", user.uid)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Supabase error fetching reports:", error);
          const { toast } = await import("sonner");
          toast.error("Failed to load reports: " + error.message);
          throw error;
        }

        console.log("Reports data loaded successfully:", data);

        // Ensure questions are sorted by order_index
        const formattedData = (data as unknown as Row[])?.map(session => ({
          ...session,
          questions: [...(session.questions ?? [])].sort((a, b) => a.order_index - b.order_index)
        })) ?? [];

        setRows(formattedData);
      } catch (err: any) {
        console.error("Failed to load reports:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const toggleExpand = (id: string) => {
    setExpandedSessionId(expandedSessionId === id ? null : id);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">Detailed analytics and responses across your sessions.</p>

      {loading ? (
        <div className="mt-8 flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass mt-8 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Run a session first — analytics will appear here.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {rows.map((r) => {
            const isExpanded = expandedSessionId === r.id;
            const totalResponses = r.questions.reduce((sum, q) => sum + (q.responses?.length ?? 0), 0);
            
            return (
              <div key={r.id} className="glass rounded-2xl overflow-hidden transition-all duration-300 border border-white/5 hover:border-white/10">
                {/* Session Header Card */}
                <div 
                  onClick={() => toggleExpand(r.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none hover:bg-white/[0.02] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg truncate">{r.title}</h3>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono tracking-widest bg-accent/50 px-2 py-0.5 rounded">{r.code}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 self-end md:self-auto">
                    <div className="flex gap-4 text-center">
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Participants</div>
                        <div className="text-lg font-bold">{r.participants?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Questions</div>
                        <div className="text-lg font-bold">{r.questions?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Resp.</div>
                        <div className="text-lg font-bold">{totalResponses}</div>
                      </div>
                    </div>
                    <div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Session Analytics Panel */}
                {isExpanded && (
                  <div className="border-t border-white/5 bg-black/10 p-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-200">
                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Question Breakdown
                    </h4>

                    {r.questions.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No questions were configured for this session.
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {r.questions.map((q, idx) => (
                          <QuestionAnalyticsCard key={q.id} index={idx} question={q} participants={r.participants} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionAnalyticsCard({ index, question, participants }: { index: number; question: Question; participants: Participant[] }) {
  const responses = question.responses ?? [];
  const totalResp = responses.length;

  const typeLabels = {
    poll: "Poll (MCQ)",
    quiz: "Quiz",
    wordcloud: "Word Cloud"
  };

  const typeStyles = {
    poll: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    quiz: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    wordcloud: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
      {/* Question Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${typeStyles[question.type]}`}>
              {typeLabels[question.type]}
            </span>
          </div>
          <h5 className="font-medium text-foreground">{question.title}</h5>
        </div>
        <div className="text-xs text-muted-foreground text-left sm:text-right shrink-0">
          <span className="font-semibold text-foreground">{totalResp}</span> / {participants.length} responses
        </div>
      </div>

      {/* Render Analytics by Type */}
      <div className="pt-2">
        {question.type === "poll" && (
          <PollAnalytics options={question.options} responses={responses} />
        )}
        {question.type === "quiz" && (
          <QuizAnalytics options={question.options} correct={question.correct_answer} responses={responses} participants={participants} />
        )}
        {question.type === "wordcloud" && (
          <WordCloudAnalytics responses={responses} />
        )}
      </div>
    </div>
  );
}

function PollAnalytics({ options, responses }: { options: string[]; responses: Response[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    options.forEach((o) => m.set(o, 0));
    responses.forEach((r) => m.set(r.answer, (m.get(r.answer) ?? 0) + 1));
    return m;
  }, [options, responses]);

  const total = responses.length || 1;

  return (
    <div className="space-y-3">
      {options.map((o) => {
        const c = counts.get(o) ?? 0;
        const pct = Math.round((c / total) * 100);
        return (
          <div key={o} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{o}</span>
              <span className="font-semibold">{c} ({pct}%)</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizAnalytics({ options, correct, responses, participants }: { options: string[]; correct: string | null; responses: Response[]; participants: Participant[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    options.forEach((o) => m.set(o, 0));
    responses.forEach((r) => m.set(r.answer, (m.get(r.answer) ?? 0) + 1));
    return m;
  }, [options, responses]);

  const total = responses.length || 1;
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  // Calculate scores for leaderboard
  const scores = useMemo(() => {
    const m = new Map<string, number>();
    responses.forEach((r) => {
      if (r.answer === correct) {
        m.set(r.participant_id, (m.get(r.participant_id) ?? 0) + 1);
      }
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [responses, correct]);

  return (
    <div className="space-y-5">
      {/* Option Breakdown */}
      <div className="space-y-3">
        {options.map((o) => {
          const c = counts.get(o) ?? 0;
          const pct = Math.round((c / total) * 100);
          const isCorrect = o === correct;

          return (
            <div key={o} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={`flex items-center gap-1.5 ${isCorrect ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}>
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  {o}
                  {isCorrect && <span className="text-[10px] uppercase font-bold text-emerald-500/80 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Correct</span>}
                </span>
                <span className="font-semibold">{c} ({pct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${isCorrect ? "bg-emerald-500" : "bg-neutral-500"}`} 
                  style={{ width: `${pct}%` }} 
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quiz Leaderboard */}
      {correct && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Award className="h-3.5 w-3.5 text-amber-400" /> TOP PARTICIPANTS (CORRECT ANSWERS)
          </div>
          <div className="space-y-1.5">
            {scores.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">No correct responses submitted yet.</div>
            ) : (
              scores.map(([pid, s], idx) => (
                <div key={pid} className="flex items-center justify-between rounded bg-white/[0.01] border border-white/5 px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-amber-500">#{idx + 1}</span>
                    <span>{nameById.get(pid) ?? "Anonymous"}</span>
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{s} pt</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WordCloudAnalytics({ responses }: { responses: Response[] }) {
  const words = useMemo(() => {
    const counts = new Map<string, number>();
    responses.forEach((r) => {
      r.answer.split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).forEach((w) => {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [responses]);

  if (words.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">No words submitted yet.</div>;
  }

  const maxCount = words[0]?.[1] ?? 1;

  return (
    <div className="space-y-4">
      {/* Cloud-like frequency layout */}
      <div className="flex flex-wrap items-center justify-center gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.01]">
        {words.map(([w, c]) => {
          // Scale size between 0.8rem and 1.8rem
          const scale = 0.8 + (c / maxCount) * 1.0;
          const colors = [
            "text-purple-400", "text-pink-400", "text-blue-400", 
            "text-indigo-400", "text-cyan-400", "text-teal-400"
          ];
          const colorClass = colors[Math.abs(w.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length];

          return (
            <span 
              key={w} 
              className={`font-semibold transition-all hover:scale-110 duration-200 cursor-default ${colorClass}`}
              style={{ fontSize: `${scale}rem` }}
              title={`Submitted ${c} time${c > 1 ? "s" : ""}`}
            >
              {w}
              <span className="text-[10px] opacity-40 ml-0.5">({c})</span>
            </span>
          );
        })}
      </div>

      {/* Linear frequency ranking */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {words.slice(0, 9).map(([w, c]) => (
          <div key={w} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.01] border border-white/5 text-xs">
            <span className="text-muted-foreground truncate">{w}</span>
            <span className="font-semibold bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded font-mono">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}