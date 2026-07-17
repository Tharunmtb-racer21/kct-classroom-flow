import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Session = { id: string; title: string; code: string; status: "draft" | "live" | "ended"; current_question_id: string | null };
type Question = { id: string; type: "wordcloud" | "poll" | "quiz"; title: string; options: string[] };

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
  const [answer, setAnswer] = useState("");
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);

  // load session by code
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sessions").select("id,title,code,status,current_question_id").eq("code", upperCode).maybeSingle();
      if (!data) setNotFound(true);
      else setSession(data as Session);
    })();
  }, [upperCode]);

  // realtime updates
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`join-${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` }, (payload) => {
        setSession((s) => (s ? { ...s, ...(payload.new as Partial<Session>) } : s));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.id]);

  // load current question
  useEffect(() => {
    if (!session?.current_question_id) { setQuestion(null); return; }
    (async () => {
      const { data } = await supabase.from("questions").select("id,type,title,options").eq("id", session.current_question_id!).maybeSingle();
      if (data) {
        setQuestion(data as unknown as Question);
        setAnswer("");
      }
    })();
  }, [session?.current_question_id]);

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

  const handleSubmit = async () => {
    if (!question || !participantId || !answer.trim()) return;
    const { error } = await supabase.from("responses").insert({
      question_id: question.id,
      participant_id: participantId,
      answer: answer.trim(),
    });
    if (error) return toast.error(error.message);
    setSubmittedFor(question.id);
    toast.success("Response submitted");
  };

  if (notFound) {
    return (
      <Wrap>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check the code <span className="font-mono">{upperCode}</span> with your faculty.</p>
        </div>
      </Wrap>
    );
  }
  if (!session) return <Wrap><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Wrap>;

  if (session.status === "ended") {
    return (
      <Wrap>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">This session has ended. Thanks for joining!</p>
        </div>
      </Wrap>
    );
  }

  if (!participantId) {
    return (
      <Wrap>
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

  if (!question) {
    return (
      <Wrap>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">You're in</div>
          <h1 className="mt-1 text-2xl font-bold">{session.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Hi {name}! Waiting for the next question…</p>
          <div className="mt-8 flex justify-center">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-accent">
              <div className="h-full w-1/2 gradient-bg animate-pulse" />
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  const alreadySubmitted = submittedFor === question.id;

  return (
    <Wrap>
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
          <Button onClick={handleSubmit} disabled={!answer.trim()} className="w-full h-14 gradient-bg font-semibold">Submit</Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {question.options.map((opt) => (
            <button
              key={opt}
              onClick={() => setAnswer(opt)}
              className={cn(
                "w-full rounded-2xl border-2 p-4 text-left text-base font-medium transition",
                answer === opt ? "border-primary bg-primary/15" : "border-border bg-card/40",
              )}
            >
              {opt}
            </button>
          ))}
          <Button onClick={handleSubmit} disabled={!answer} className="w-full h-14 gradient-bg font-semibold">Submit Answer</Button>
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
        <div className="grid h-8 w-8 place-items-center rounded-lg overflow-hidden">
          <img src="/kct-logo.jpg" alt="KCT Logo" className="h-8 w-8 object-cover" />
        </div>
        <span className="font-bold text-sm">KCT <span className="gradient-text">PULSE</span></span>
      </header>
      <main className="flex-1 px-5 py-8 flex items-start justify-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}