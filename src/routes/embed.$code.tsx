import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Cloud, Loader2, Radio, Sparkles, Users, Zap, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { joinUrl } from "@/lib/session-utils";
import { ThemeToggle } from "@/components/theme-toggle";

type Session = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  current_question_id: string | null;
  expires_at?: string | null;
};

type Question = {
  id: string;
  session_id: string;
  type: "wordcloud" | "poll" | "quiz";
  title: string;
  options: string[];
  correct_answer: string | null;
  image_url?: string | null;
};

type Response = {
  id: string;
  question_id: string;
  participant_id: string;
  answer: string;
  created_at: string;
};

export const Route = createFileRoute("/embed/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Live Slide Embed · KCT PULSE" },
      { name: "description", content: "Live embed view for PowerPoint and Google Slides." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const { code } = Route.useParams();
  const upperCode = code.toUpperCase();

  const [session, setSession] = useState<Session | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 1. Fetch Session
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id,title,code,status,current_question_id,expires_at")
        .eq("code", upperCode)
        .maybeSingle();

      if (!data) {
        setNotFound(true);
      } else {
        setSession(data as Session);
      }
      setLoading(false);
    })();
  }, [upperCode]);

  // 2. Realtime Session Updates
  useEffect(() => {
    if (!session?.id) return;
    const ch = supabase
      .channel(`embed-session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          setSession((s) => (s ? { ...s, ...(payload.new as Partial<Session>) } : s));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.id]);

  // 3. Fetch Active Question
  useEffect(() => {
    if (!session?.current_question_id) {
      setQuestion(null);
      setResponses([]);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("questions")
        .select("id,session_id,type,title,options,correct_answer,image_url")
        .eq("id", session.current_question_id)
        .maybeSingle();

      if (data) {
        setQuestion(data as unknown as Question);
      }
    })();
  }, [session?.current_question_id]);

  // 4. Fetch & Realtime Responses for Current Question
  useEffect(() => {
    if (!question?.id) {
      setResponses([]);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("responses")
        .select("id,question_id,participant_id,answer,created_at")
        .eq("question_id", question.id);

      if (data) setResponses(data as Response[]);
    })();

    const ch = supabase
      .channel(`embed-responses-${question.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "responses", filter: `question_id=eq.${question.id}` },
        (payload) => {
          setResponses((prev) => [...prev, payload.new as Response]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [question?.id]);

  // 5. Realtime Participants Count
  useEffect(() => {
    if (!session?.id) return;
    const loadCount = async () => {
      const { count } = await supabase
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", session.id);
      setParticipantCount(count ?? 0);
    };

    loadCount();

    const ch = supabase
      .channel(`embed-participants-${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${session.id}` },
        loadCount
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.id]);

  const joinLink = useMemo(() => (session ? joinUrl(session.code) : ""), [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">Loading presentation slide view...</p>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 text-destructive grid place-items-center mb-4">
          <Radio className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold">Session Not Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">Session code <span className="font-mono font-bold text-foreground">{upperCode}</span> does not exist or has expired.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden relative selection:bg-primary/20">
      {/* Top Slide Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-card/70 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-md">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
              <span className="rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide uppercase">SLIDE EMBED</span>
            </div>
            <h1 className="text-xs font-medium text-muted-foreground truncate max-w-[280px] sm:max-w-[450px]">{session.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground bg-card border border-border/80 px-3 py-1.5 rounded-full shadow-sm">
            <Users className="h-4 w-4 text-primary animate-pulse" />
            <span><strong className="text-primary font-bold">{participantCount}</strong> Active Students</span>
          </div>
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Main Presentation Area */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 p-6 overflow-hidden relative z-10">
        {/* Left 3 Columns: Active Live Question & Chart */}
        <div className="md:col-span-3 flex flex-col justify-between glass rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-2xl border border-border/60">
          {!question ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
                <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 border border-primary/30 text-primary shadow-inner">
                  <Sparkles className="h-10 w-10 animate-pulse" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Waiting for Faculty to Activate Question</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  This presentation slide will automatically update in real-time as soon as a live poll or quiz question is pushed from the faculty control dashboard.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Real-time Sync Connected
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="uppercase text-xs font-black tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                    LIVE · {question.type.toUpperCase()}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground bg-accent/60 border border-border/40 px-3 py-1 rounded-full font-mono">
                    {responses.length} {responses.length === 1 ? "Response" : "Responses"} Submitted
                  </span>
                </div>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-snug">{question.title}</h2>
              </div>

              {/* Render Chart / WordCloud */}
              <div className="flex-1 my-2 flex items-center justify-center min-h-[220px]">
                {question.type === "wordcloud" ? (
                  <WordCloudView responses={responses} />
                ) : (
                  <PollChartView question={question} responses={responses} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Column: QR Code & Join Info */}
        <div className="md:col-span-1 glass rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-5 border border-border/60 shadow-xl relative">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-widest font-black text-primary">Scan to Join Live</div>
            <p className="text-[11px] text-muted-foreground">Point your phone camera at the screen</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-xl border border-border/40 transform hover:scale-105 transition-transform duration-300">
            <QRCodeSVG value={joinLink} size={160} level="M" />
          </div>

          <div className="w-full space-y-1 bg-card/60 border border-border/60 p-3 rounded-2xl">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Session Code</div>
            <div className="font-mono text-2xl font-black tracking-[0.25em] gradient-text select-all">{session.code}</div>
          </div>

          <div className="w-full text-[11px] text-muted-foreground break-all px-2 font-mono select-all bg-accent/40 py-1.5 rounded-lg border border-border/30">
            {joinLink}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components for Embed Visuals

function PollChartView({ question, responses }: { question: Question; responses: Response[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    question.options.forEach((opt) => (map[opt] = 0));
    responses.forEach((r) => {
      if (map[r.answer] !== undefined) map[r.answer]++;
      else map[r.answer] = (map[r.answer] || 0) + 1;
    });
    return map;
  }, [question.options, responses]);

  const total = Math.max(1, responses.length);

  return (
    <div className="w-full space-y-4">
      {question.options.map((opt, idx) => {
        const count = counts[opt] || 0;
        const pct = Math.round((count / total) * 100);
        const isCorrect = question.correct_answer === opt;

        return (
          <div key={idx} className="space-y-2">
            <div className="flex items-center justify-between text-base font-bold">
              <span className="flex items-center gap-2.5">
                <span className="h-7 w-7 rounded-xl bg-primary/20 text-primary grid place-items-center text-xs font-black shadow-sm border border-primary/30">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="text-foreground">{opt}</span>
                {isCorrect && (
                  <span className="text-xs text-emerald-500 font-extrabold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Correct Answer
                  </span>
                )}
              </span>
              <span className="font-mono text-sm font-extrabold text-foreground">{count} ({pct}%)</span>
            </div>
            <div className="h-5 w-full bg-accent/70 rounded-full overflow-hidden p-1 border border-border/50 shadow-inner">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 shadow-md",
                  isCorrect ? "bg-emerald-500" : "gradient-bg"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WordCloudView({ responses }: { responses: Response[] }) {
  const frequencies = useMemo(() => {
    const counts: Record<string, number> = {};
    responses.forEach((r) => {
      const words = r.answer.toLowerCase().trim().split(/\s+/);
      words.forEach((w) => {
        if (w.length > 1) {
          counts[w] = (counts[w] || 0) + 1;
        }
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  }, [responses]);

  if (frequencies.length === 0) {
    return (
      <div className="text-sm font-medium text-muted-foreground italic">
        Words submitted by students will appear live on this slide...
      </div>
    );
  }

  const max = Math.max(...frequencies.map((f) => f[1]), 1);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 p-6">
      {frequencies.map(([word, count]) => {
        const sizeRem = 1.2 + (count / max) * 1.8;
        return (
          <span
            key={word}
            className="font-black gradient-text transform hover:scale-110 transition-transform duration-200 drop-shadow-sm"
            style={{ fontSize: `${sizeRem}rem` }}
          >
            {word}
            <sub className="text-[11px] opacity-70 ml-1 font-mono text-muted-foreground">({count})</sub>
          </span>
        );
      })}
    </div>
  );
}
