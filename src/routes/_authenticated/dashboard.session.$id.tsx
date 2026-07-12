import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ChevronRight, Copy, Pause, Play, Plus, Square, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { joinUrl, isPrivatePreviewHost } from "@/lib/session-utils";
import { toast } from "sonner";
import { StatusPill } from "./dashboard.index";

type QType = "wordcloud" | "poll" | "quiz";
type Question = { id: string; session_id: string; type: QType; title: string; options: string[]; correct_answer: string | null; order_index: number };
type Session = { id: string; title: string; code: string; status: "draft" | "live" | "ended"; current_question_id: string | null };
type Participant = { id: string; name: string; joined_at: string };
type Response = { id: string; question_id: string; participant_id: string; answer: string; created_at: string };

export const Route = createFileRoute("/_authenticated/dashboard/session/$id")({
  component: SessionControl,
});

function SessionControl() {
  const { id } = Route.useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);

  const loadAll = async () => {
    const { data: s } = await supabase.from("sessions").select("id,title,code,status,current_question_id").eq("id", id).maybeSingle();
    setSession(s as Session | null);
    const { data: qs } = await supabase.from("questions").select("*").eq("session_id", id).order("order_index");
    setQuestions(((qs ?? []) as unknown) as Question[]);
    const { data: ps } = await supabase.from("participants").select("id,name,joined_at").eq("session_id", id).order("joined_at");
    setParticipants((ps ?? []) as Participant[]);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel(`sess-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `session_id=eq.${id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Listen for responses of current question
  const currentQ = questions.find((q) => q.id === session?.current_question_id) ?? null;
  useEffect(() => {
    if (!currentQ) { setResponses([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from("responses").select("*").eq("question_id", currentQ.id).order("created_at");
      if (active) setResponses((data ?? []) as Response[]);
    })();
    const ch = supabase
      .channel(`resp-${currentQ.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses", filter: `question_id=eq.${currentQ.id}` }, (payload) => {
        setResponses((prev) => [...prev, payload.new as Response]);
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [currentQ?.id]);

  const updateSession = async (patch: Partial<Session>) => {
    const { error } = await supabase.from("sessions").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const startSession = () => updateSession({ status: "live" });
  const pauseSession = () => updateSession({ status: "draft" });
  const endSession = () => updateSession({ status: "ended", current_question_id: null });

  const goToQuestion = async (qid: string | null) => {
    if (session?.status !== "live") await updateSession({ status: "live", current_question_id: qid });
    else await updateSession({ current_question_id: qid });
  };

  const nextQuestion = () => {
    if (!currentQ) {
      if (questions[0]) goToQuestion(questions[0].id);
      return;
    }
    const idx = questions.findIndex((q) => q.id === currentQ.id);
    const next = questions[idx + 1];
    goToQuestion(next?.id ?? null);
  };

  if (!session) {
    return <div className="p-10 text-muted-foreground">Loading session...</div>;
  }

  const joinLink = joinUrl(session.code);
  const previewWarning = isPrivatePreviewHost() && !(import.meta as any).env?.VITE_PUBLIC_APP_URL;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusPill status={session.status} />
            <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Users className="h-4 w-4" /> {participants.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.status !== "live" && session.status !== "ended" && (
            <Button onClick={startSession} className="gradient-bg"><Play className="mr-2 h-4 w-4" /> Start</Button>
          )}
          {session.status === "live" && (
            <>
              <Button onClick={nextQuestion} variant="secondary"><ChevronRight className="mr-2 h-4 w-4" /> Next Question</Button>
              <Button onClick={pauseSession} variant="outline"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
            </>
          )}
          {session.status !== "ended" && (
            <Button onClick={endSession} variant="destructive"><Square className="mr-2 h-4 w-4" /> End</Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-2xl p-6 lg:col-span-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Session Code</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="font-mono text-3xl font-bold tracking-[0.25em]">{session.code}</div>
            <button onClick={() => { navigator.clipboard.writeText(session.code); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={joinLink} size={180} level="M" />
            </div>
          </div>
          <div className="mt-4 break-all text-center text-xs text-muted-foreground">{joinLink}</div>
          <button
            onClick={() => { navigator.clipboard.writeText(joinLink); toast.success("Link copied"); }}
            className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Copy join link
          </button>
          {previewWarning && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              This is a private preview URL — students on other devices cannot open it. Publish the app (top-right) or set <span className="font-mono">VITE_PUBLIC_APP_URL</span> so the QR points to your live site.
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <QuestionsPanel sessionId={id} questions={questions} currentId={session.current_question_id} onActivate={goToQuestion} />
          <LivePanel current={currentQ} responses={responses} participants={participants} />
        </div>
      </div>
    </div>
  );
}

function QuestionsPanel({
  sessionId, questions, currentId, onActivate,
}: { sessionId: string; questions: Question[]; currentId: string | null; onActivate: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QType>("poll");
  const [title, setTitle] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [correct, setCorrect] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const options = type === "wordcloud"
      ? []
      : optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
    const { error } = await supabase.from("questions").insert({
      session_id: sessionId,
      type,
      title,
      options,
      correct_answer: type === "quiz" ? correct : null,
      order_index: questions.length,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Question added");
    setOpen(false); setTitle(""); setOptionsText(""); setCorrect("");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Questions</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-bg"><Plus className="mr-2 h-4 w-4" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Question</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as QType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poll">Poll (MCQ)</SelectItem>
                    <SelectItem value="wordcloud">Word Cloud</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Question</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="What is..." />
              </div>
              {type !== "wordcloud" && (
                <div className="space-y-2">
                  <Label>Options (one per line)</Label>
                  <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} required placeholder={"Option A\nOption B\nOption C"} />
                </div>
              )}
              {type === "quiz" && (
                <div className="space-y-2">
                  <Label>Correct answer (must match option exactly)</Label>
                  <Input value={correct} onChange={(e) => setCorrect(e.target.value)} required />
                </div>
              )}
              <Button type="submit" disabled={saving} className="w-full gradient-bg">
                {saving ? "Saving..." : "Create question"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-2">
        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No questions yet. Add polls, word clouds, or quiz questions to activate live.
          </div>
        )}
        {questions.map((q, i) => {
          const active = q.id === currentId;
          return (
            <div key={q.id} className={cn("flex items-center gap-3 rounded-xl border p-3 transition", active ? "border-primary bg-primary/10" : "border-border bg-card/40")}>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{q.title}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{q.type}</div>
              </div>
              <Button size="sm" variant={active ? "default" : "outline"} onClick={() => onActivate(q.id)}>
                {active ? "Live" : "Activate"}
              </Button>
              <button onClick={() => remove(q.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LivePanel({ current, responses, participants }: { current: Question | null; responses: Response[]; participants: Participant[] }) {
  if (!current) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold">Live Results</h2>
        <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Activate a question to see live responses here.
        </div>
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Participants ({participants.length})</div>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <div key={p.id} className="rounded-full bg-accent px-3 py-1 text-xs">{p.name}</div>
            ))}
            {participants.length === 0 && <div className="text-sm text-muted-foreground">Waiting for students to join...</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">Live · {current.type}</div>
          <h2 className="mt-1 text-lg font-semibold">{current.title}</h2>
        </div>
        <div className="text-sm text-muted-foreground">{responses.length} responses</div>
      </div>
      <div className="mt-6">
        {current.type === "poll" && <PollResults options={current.options} responses={responses} />}
        {current.type === "quiz" && <QuizResults options={current.options} correct={current.correct_answer} responses={responses} participants={participants} />}
        {current.type === "wordcloud" && <WordCloudResults responses={responses} participants={participants} />}
      </div>
    </div>
  );
}

function PollResults({ options, responses }: { options: string[]; responses: Response[] }) {
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
          <div key={o}>
            <div className="flex justify-between text-sm mb-1">
              <span>{o}</span>
              <span className="text-muted-foreground">{c} · {pct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-accent">
              <div className="h-full gradient-bg transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizResults({ options, correct, responses, participants }: { options: string[]; correct: string | null; responses: Response[]; participants: Participant[] }) {
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const scores = new Map<string, number>();
  responses.forEach((r) => { if (r.answer === correct) scores.set(r.participant_id, (scores.get(r.participant_id) ?? 0) + 1); });
  const leaderboard = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <div className="space-y-6">
      <PollResults options={options} responses={responses} />
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Leaderboard</div>
        <div className="space-y-1">
          {leaderboard.length === 0 && <div className="text-sm text-muted-foreground">No correct answers yet.</div>}
          {leaderboard.map(([pid, s], i) => (
            <div key={pid} className="flex items-center justify-between rounded-lg bg-accent/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-3"><span className="font-bold text-[color:var(--primary-glow)]">#{i + 1}</span>{nameById.get(pid) ?? "Anonymous"}</span>
              <span className="font-mono">{s} pt{s === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
        {correct && <div className="mt-3 text-xs text-muted-foreground">Correct answer: <span className="text-[color:var(--accent-emerald)] font-medium">{correct}</span></div>}
      </div>
    </div>
  );
}

function WordCloudResults({ responses, participants }: { responses: Response[]; participants: Participant[] }) {
  const words = useMemo(() => {
    const counts = new Map<string, number>();
    responses.forEach((r) => {
      r.answer.split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).forEach((w) => {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      });
    });
    // Sort by count desc; cap to 200 for performance
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200);
  }, [responses]);

  const max = words[0]?.[1] ?? 1;
  const palette = [
    "#60a5fa", "#38bdf8", "#22d3ee", "#5eead4",
    "#34d399", "#a78bfa", "#c4b5fd", "#e0f2fe",
    "#7dd3fc", "#93c5fd", "#67e8f9", "#f0f9ff",
  ];
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/5 p-8"
      style={{
        minHeight: 380,
        background:
          "radial-gradient(ellipse at 20% 20%, oklch(0.3 0.15 240 / 0.35), transparent 55%), radial-gradient(ellipse at 80% 80%, oklch(0.35 0.14 165 / 0.28), transparent 55%), oklch(0.15 0.04 260)",
      }}
    >
      {/* Live stats */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-between text-xs">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur">
          <span
            className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent-emerald)]"
            style={{ animation: "wc-pulse-dot 1.6s ease-in-out infinite" }}
          />
          <span className="font-semibold">{participants.length}</span>
          <span className="text-muted-foreground">participants</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur">
          <span className="font-semibold">{responses.length}</span>
          <span className="text-muted-foreground">responses</span>
        </div>
      </div>

      {words.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="text-center">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              <div
                className="absolute inset-3 rounded-full gradient-bg opacity-60"
                style={{ animation: "wc-pulse-dot 1.8s ease-in-out infinite" }}
              />
            </div>
            <div className="mt-5 text-sm font-medium text-foreground/80">Waiting for responses…</div>
            <div className="mt-1 text-xs text-muted-foreground">Your word cloud will appear here in real time.</div>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-[320px] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-2 pt-8">
          {words.map(([w, c], i) => {
            // Log-ish scale: rare words stay readable, common words dominate.
            const t = Math.pow(c / max, 0.55);
            const size = 0.95 + t * 3.4; // rem
            const color = palette[hash(w) % palette.length];
            const opacity = 0.65 + t * 0.35;
            const floatDur = 4 + (hash(w + "d") % 5); // 4-8s
            const floatDelay = ((hash(w + "x") % 20) / 10).toFixed(2); // 0-2s
            return (
              <span
                key={w}
                className="inline-block font-extrabold leading-none tracking-tight will-change-transform"
                style={{
                  fontSize: `${size}rem`,
                  color,
                  opacity,
                  textShadow: `0 0 18px ${color}66, 0 0 44px ${color}33`,
                  transition: "font-size 700ms cubic-bezier(0.22,1,0.36,1), opacity 500ms ease",
                  animation: `wc-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) both, wc-float ${floatDur}s ease-in-out ${floatDelay}s infinite`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}