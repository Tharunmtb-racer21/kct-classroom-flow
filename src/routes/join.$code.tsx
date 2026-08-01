import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Upload, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type Session = { id: string; title: string; code: string; status: "draft" | "live" | "ended"; current_question_id: string | null; all_active?: boolean; active_question_ids?: string[] | null; expires_at?: string | null; image_url?: string | null };
type Question = { id: string; type: "wordcloud" | "poll" | "quiz"; title: string; options: string[]; image_url?: string | null };

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "Join Session · KCT PULSE" },
      { name: "description", content: "Join a live KCT PULSE classroom session." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const upperCode = code.toUpperCase();
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [answer, setAnswer] = useState("");
  const [submittedFor, setSubmittedFor] = useState<Set<string>>(new Set());
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});

  console.log("JoinPage Render:", {
    session: session ? { id: session.id, status: session.status, current_question_id: session.current_question_id, active_question_ids: session.active_question_ids, all_active: session.all_active } : null,
    question,
    allQuestionsCount: allQuestions.length,
    participantId
  });

  // load session by code
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("sessions").select("id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url") as any).eq("code", upperCode).maybeSingle();
      if (!data) setNotFound(true);
      else setSession(data as Session);
    })();
  }, [upperCode]);

  // realtime updates
  useEffect(() => {
    if (!session) return;
    console.log(`Subscribing to realtime updates for session: ${session.id}`);
    const ch = supabase
      .channel(`join-${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` }, (payload) => {
        console.log("Realtime update received for session:", payload.new);
        setSession((s) => (s ? { ...s, ...(payload.new as Partial<Session>) } : s));
      })
      .subscribe((status) => {
        console.log(`Realtime subscription status for session ${session.id}: ${status}`);
      });
    return () => { 
      console.log(`Unsubscribing from realtime updates for session: ${session.id}`);
      supabase.removeChannel(ch); 
    };
  }, [session?.id]);

  // load current question OR all questions in ALL mode OR multi-selected active questions
  useEffect(() => {
    const activeIds = session?.active_question_ids || [];
    
    // Check if we are in ALL mode
    if (session?.all_active) {
      setQuestion(null);
      (async () => {
        const { data, error } = await supabase.from("questions").select("id,type,title,options,image_url").eq("session_id", session.id).order("order_index");
        if (error) console.error("Error fetching all questions:", error);
        if (data) setAllQuestions(data as unknown as Question[]);
      })();
      return;
    }

    // Check if we have multiple custom active question IDs
    if (activeIds.length > 1) {
      setQuestion(null);
      (async () => {
        const { data, error } = await supabase.from("questions").select("id,type,title,options,image_url").in("id", activeIds);
        if (error) console.error("Error fetching active questions:", error);
        if (data) setAllQuestions(data as unknown as Question[]);
      })();
      return;
    }

    // Single active question mode (either via current_question_id or a single active_question_ids element)
    const singleActiveId = session?.current_question_id || (activeIds.length === 1 ? activeIds[0] : null);
    if (!singleActiveId) { setQuestion(null); setAllQuestions([]); return; }
    setAllQuestions([]);
    (async () => {
      const { data, error } = await supabase.from("questions").select("id,type,title,options,image_url").eq("id", singleActiveId).maybeSingle();
      if (error) console.error("Error fetching single question:", error);
      if (data) {
        setQuestion(data as unknown as Question);
        setAnswer("");
      }
    })();
  }, [session?.id, session?.current_question_id, session?.all_active, session?.active_question_ids?.join(",")]);

  // realtime question updates
  useEffect(() => {
    if (!question?.id) return;
    const ch = supabase
      .channel(`join-question-${question.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions", filter: `id=eq.${question.id}` }, (payload) => {
        setQuestion((q) => (q ? { ...q, ...(payload.new as Partial<Question>) } : q));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [question?.id]);

  // countdown timer state
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.expires_at) {
      setSecondsLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const difference = new Date(session.expires_at!).getTime() - Date.now();
      const seconds = Math.max(0, Math.floor(difference / 1000));
      setSecondsLeft(seconds);
      if (seconds <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.expires_at]);

  // restore prior participant in this browser
  useEffect(() => {
    if (!session) return;
    const saved = localStorage.getItem(`kctpulse-${session.id}`);
    if (saved) {
      const parsed = JSON.parse(saved) as { id: string; name: string };
      setParticipantId(parsed.id);
      setName(parsed.name);
    }
  }, [session?.id]);

  // Load existing database submissions for this participant to prevent reload duplicate submissions
  useEffect(() => {
    if (!participantId) return;
    
    // Collect all question IDs we care about
    const questionIds: string[] = [];
    if (question?.id) {
      questionIds.push(question.id);
    }
    allQuestions.forEach((q) => {
      if (q.id) questionIds.push(q.id);
    });

    if (questionIds.length === 0) return;

    (async () => {
      const { data, error } = await supabase
        .from("responses")
        .select("question_id")
        .eq("participant_id", participantId)
        .in("question_id", questionIds);

      if (!error && data) {
        const answeredIds = data.map((r) => r.question_id);
        setSubmittedFor(new Set(answeredIds));
      }
    })();
  }, [participantId, question?.id, allQuestions.length]);


  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setJoining(true);
    const { data, error } = await supabase
      .from("participants")
      .insert({ session_id: session.id, name: name.trim() })
      .select("id")
      .single();
    setJoining(false);
    if (error || !data) { toast.error(error?.message ?? "Failed to join"); return; }
    setParticipantId(data.id);
    localStorage.setItem(`kctpulse-${session.id}`, JSON.stringify({ id: data.id, name: name.trim() }));
  };

  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadResponseImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `responses/${crypto.randomUUID()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('question-images')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (qid?: string, ans?: string) => {
    const targetQ = qid ? (allQuestions.find(q => q.id === qid) ?? question) : question;
    const targetAnswer = ans ?? answer;
    if (!targetQ || !participantId || !targetAnswer.trim()) return;
    setSubmitting(true);
    try {
      let image_url = null;
      if (!qid && responseFile) {
        image_url = await uploadResponseImage(responseFile);
      }
      const { error } = await supabase.from("responses").insert({
        question_id: targetQ.id,
        participant_id: participantId,
        answer: targetAnswer.trim(),
        image_url,
      });
      if (error) throw error;
      setSubmittedFor(prev => new Set([...prev, targetQ.id]));
      if (!qid) { setAnswer(""); setResponseFile(null); }
      else setAnswerMap(prev => ({ ...prev, [targetQ.id]: "" }));
      toast.success("Response submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check the code <span className="font-mono">{upperCode}</span> with your faculty.</p>
        </div>
      </Wrap>
    );
  }
  if (!session) return <Wrap secondsLeft={secondsLeft}><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Wrap>;

  if (session.status === "ended") {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">This session has ended. Thanks for joining!</p>
        </div>
      </Wrap>
    );
  }

  if (!participantId) {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Joining</div>
          <h1 className="mt-1 text-2xl font-bold">{session.title}</h1>
          <div className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">{session.code}</div>
        </div>
        <form onSubmit={handleJoin} className="mt-8 space-y-4">
          <Input autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} className="h-14 text-center text-lg" />
          <Button disabled={joining || !name.trim()} className="w-full h-14 text-base gradient-bg font-semibold">
            {joining ? "Joining..." : "Join Session"}
          </Button>
        </form>
      </Wrap>
    );
  }

  // ── ALL mode or Multi-select mode: show multiple questions at once ─────────────────────────────────
  const hasMultipleActive = session.all_active || (session.active_question_ids && session.active_question_ids.length > 1);
  if (hasMultipleActive && allQuestions.length > 0) {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">All Questions</div>
            <h1 className="mt-1 text-xl font-bold">{session.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Hi {name}! Answer all questions below.</p>
          </div>
          {allQuestions.map((q, i) => {
            const submitted = submittedFor.has(q.id);
            const qAnswer = answerMap[q.id] ?? "";
            return (
              <div key={q.id} className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-bold">{i + 1}</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{q.type}</span>
                </div>
                {q.image_url && <img src={q.image_url} alt="" className="rounded-xl max-h-40 object-contain w-full border border-border" />}
                <p className="font-semibold leading-snug">{q.title}</p>
                {submitted ? (
                  <div className="flex items-center gap-2 text-sm text-[color:var(--accent-emerald)]">
                    <CheckCircle2 className="h-4 w-4" /> Submitted!
                  </div>
                ) : q.type === "wordcloud" ? (
                  <div className="space-y-2">
                    <Textarea
                      value={qAnswer}
                      onChange={e => setAnswerMap(p => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="Type your thoughts..."
                      rows={2}
                      maxLength={200}
                    />
                    <Button onClick={() => handleSubmit(q.id, qAnswer)} disabled={submitting || !qAnswer.trim()} className="w-full gradient-bg font-semibold">
                      {submitting ? "Submitting..." : "Submit"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAnswerMap(p => ({ ...p, [q.id]: opt }))}
                        className={cn(
                          "w-full rounded-xl border-2 p-3 text-left text-sm font-medium transition",
                          qAnswer === opt ? "border-primary bg-primary/15" : "border-border bg-card/40"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                    <Button onClick={() => handleSubmit(q.id, qAnswer)} disabled={submitting || !qAnswer} className="w-full gradient-bg font-semibold">
                      {submitting ? "Submitting..." : "Submit Answer"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Wrap>
    );
  }

  if (!question) {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center space-y-6">
          {session.image_url && (
            <div className="overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center max-h-60 shadow-md">
              <img src={session.image_url} alt="Session announcement" className="w-full h-full object-contain" />
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">You're in</div>
            <h1 className="mt-1 text-2xl font-bold">{session.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Hi {name}! Waiting for the next question…</p>
          </div>
          <div className="flex justify-center">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-accent">
              <div className="h-full w-1/2 gradient-bg animate-pulse" />
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  const alreadySubmitted = submittedFor.has(question?.id ?? "");

  return (
    <Wrap secondsLeft={secondsLeft}>
      {question.image_url && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center max-h-60 shadow-md">
          <img src={question.image_url} alt="Question visual" className="w-full h-full object-contain" />
        </div>
      )}
      <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">{question.type}</div>
      <h1 className="mt-1 text-2xl font-bold leading-tight">{question.title}</h1>

      {alreadySubmitted ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <CheckCircle2 className="h-16 w-16 text-[color:var(--accent-emerald)]" />
          <div className="mt-3 font-semibold">Response received</div>
          <p className="mt-1 text-sm text-muted-foreground">Waiting for the next question…</p>
        </div>
      ) : question.type === "wordcloud" ? (
        <div className="mt-6 space-y-4">
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your thoughts..." rows={4} maxLength={200} />
          
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Attach Image (Optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setResponseFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer h-11 bg-card/40 border-border"
              />
              {responseFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setResponseFile(null)} className="text-destructive">Clear</Button>
              )}
            </div>
          </div>

          <Button onClick={() => handleSubmit()} disabled={submitting || !answer.trim()} className="w-full h-14 gradient-bg font-semibold">
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAnswer(opt)}
                className={cn(
                  "w-full rounded-2xl border-2 p-4 text-left text-base font-medium transition",
                  answer === opt ? "border-primary bg-primary/15" : "border-border bg-card/40",
                )}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Attach Image (Optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setResponseFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer h-11 bg-card/40 border-border"
              />
              {responseFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setResponseFile(null)} className="text-destructive">Clear</Button>
              )}
            </div>
          </div>

          <Button onClick={() => handleSubmit()} disabled={submitting || !answer} className="w-full h-14 gradient-bg font-semibold">
            {submitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children, secondsLeft }: { children: React.ReactNode; secondsLeft: number | null }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-12 w-12 object-cover" />
          </div>
          <span className="font-extrabold text-lg tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time Countdown Banner for Students */}
          {secondsLeft !== null && secondsLeft !== undefined && secondsLeft > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-xs text-primary font-bold animate-pulse">
              <Timer className="h-3.5 w-3.5" />
              <span>Time Left: {secondsLeft}s</span>
            </div>
          )}
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>
      <main className="flex-1 px-5 py-8 flex items-start justify-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}