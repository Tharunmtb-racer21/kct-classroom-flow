import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Loader2, Upload, Timer, Lock, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactUsModal } from "@/components/contact-us-modal";
import { useExamIntegrity } from "@/hooks/use-exam-integrity";

type Session = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  current_question_id: string | null;
  all_active?: boolean;
  active_question_ids?: string[] | null;
  expires_at?: string | null;
  image_url?: string | null;
  is_exam?: boolean;
  max_fullscreen_exits?: number;
  block_clipboard?: boolean;
  block_right_click?: boolean;
};
type Question = {
  id: string;
  type: "wordcloud" | "poll" | "quiz";
  title: string;
  options: string[];
  image_url?: string | null;
  question_type?: string;
};

const microsoftSubmitButton =
  "w-full h-14 rounded-[4px] border border-[#005a9e] bg-[#0078d4] text-white shadow-sm font-semibold hover:bg-[#106ebe] active:bg-[#005a9e] focus-visible:ring-[#0078d4]/45 disabled:border-[#a6a6a6] disabled:bg-[#c8c8c8] disabled:text-[#666666]";

const isMultipleCorrect = (q: Question | null | undefined): boolean => {
  if (!q) return false;
  if (q.question_type === "Multiple Correct") return true;
  const titleLower = (q.title || "").toLowerCase();
  return (
    titleLower.includes("select all") ||
    titleLower.includes("multiple correct") ||
    titleLower.includes("choose multiple")
  );
};

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
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>({});
  const [unansweredQuestionIds, setUnansweredQuestionIds] = useState<Set<string>>(new Set());
  const [allQuestionsComplete, setAllQuestionsComplete] = useState(false);
  const [showSavedResponses, setShowSavedResponses] = useState(false);

  const {
    isFullscreenActive,
    fullscreenExits,
    isWarningOpen,
    warningMessage,
    isOnline,
    latency,
    downlink,
    connectionType,
    requestFullscreen,
  } = useExamIntegrity({
    sessionId: session?.id ?? "",
    participantId,
    isExam: !!session?.is_exam,
    currentQuestionId: question?.id ?? null,
    settings: {
      maxFullscreenExits: session?.max_fullscreen_exits ?? 3,
      blockClipboard: !!session?.block_clipboard,
      blockRightClick: !!session?.block_right_click,
    },
  });

  console.log("JoinPage Render:", {
    session: session
      ? {
          id: session.id,
          status: session.status,
          current_question_id: session.current_question_id,
          active_question_ids: session.active_question_ids,
          all_active: session.all_active,
        }
      : null,
    question,
    allQuestionsCount: allQuestions.length,
    participantId,
  });

  // load session by code
  useEffect(() => {
    (async () => {
      const { data, error } = await (
        supabase
          .from("sessions")
          .select(
            "id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url,is_exam,max_fullscreen_exits,block_clipboard,block_right_click",
          ) as any
      )
        .eq("code", upperCode)
        .maybeSingle();
      if (error) {
        console.warn("Integrity session columns load failed, falling back to core columns:", error);
        const { data: fallbackData } = await supabase
          .from("sessions")
          .select(
            "id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url",
          )
          .eq("code", upperCode)
          .maybeSingle();
        if (!fallbackData) setNotFound(true);
        else setSession(fallbackData as Session);
      } else {
        if (!data) setNotFound(true);
        else setSession(data as Session);
      }
    })();
  }, [upperCode]);

  // realtime updates
  useEffect(() => {
    if (!session) return;
    console.log(`Subscribing to realtime updates for session: ${session.id}`);
    const ch = supabase
      .channel(`join-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          console.log("Realtime update received for session:", payload.new);
          setSession((s) => (s ? { ...s, ...(payload.new as Partial<Session>) } : s));
        },
      )
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
        const { data, error } = await supabase
          .from("questions")
          .select("id,type,title,options,image_url,question_type")
          .eq("session_id", session.id)
          .order("order_index");
        if (error) {
          console.error("Error fetching all questions:", error);
          const { data: fbData } = await supabase
            .from("questions")
            .select("id,type,title,options,image_url,question_type")
            .eq("session_id", session.id)
            .order("order_index");
          if (fbData) setAllQuestions(fbData as unknown as Question[]);
        } else if (data) {
          setAllQuestions(data as unknown as Question[]);
        }
      })();
      return;
    }

    // Check if we have multiple custom active question IDs
    if (activeIds.length > 1) {
      setQuestion(null);
      (async () => {
        const { data, error } = await supabase
          .from("questions")
          .select("id,type,title,options,image_url,question_type")
          .in("id", activeIds);
        if (error) {
          console.error("Error fetching active questions:", error);
          const { data: fbData } = await supabase
            .from("questions")
            .select("id,type,title,options,image_url,question_type")
            .in("id", activeIds);
          if (fbData) setAllQuestions(fbData as unknown as Question[]);
        } else if (data) {
          setAllQuestions(data as unknown as Question[]);
        }
      })();
      return;
    }

    // Single active question mode (either via current_question_id or a single active_question_ids element)
    const singleActiveId =
      session?.current_question_id || (activeIds.length === 1 ? activeIds[0] : null);
    if (!singleActiveId) {
      setQuestion(null);
      setAllQuestions([]);
      return;
    }
    setAllQuestions([]);
    (async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id,type,title,options,image_url,question_type")
        .eq("id", singleActiveId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching single question:", error);
        const { data: fbData } = await supabase
          .from("questions")
          .select("id,type,title,options,image_url,question_type")
          .eq("id", singleActiveId)
          .maybeSingle();
        if (fbData) {
          setQuestion(fbData as unknown as Question);
          setAnswer("");
        }
      } else if (data) {
        setQuestion(data as unknown as Question);
        setAnswer("");
      }
    })();
  }, [
    session?.id,
    session?.current_question_id,
    session?.all_active,
    session?.active_question_ids?.join(","),
  ]);

  // realtime question updates
  useEffect(() => {
    if (!question?.id) return;
    const ch = supabase
      .channel(`join-question-${question.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "questions", filter: `id=eq.${question.id}` },
        (payload) => {
          setQuestion((q) => (q ? { ...q, ...(payload.new as Partial<Question>) } : q));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [question?.id]);

  // realtime responses updates (to support real-time Retake/Reset)
  useEffect(() => {
    if (!participantId || !session?.id) return;

    const ch = supabase
      .channel(`join-responses-${participantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "responses",
          filter: `participant_id=eq.${participantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedQid = (payload.old as any).question_id;
            if (deletedQid) {
              setSubmittedFor((prev) => {
                const next = new Set(prev);
                next.delete(deletedQid);
                return next;
              });
              setSubmittedAnswers((prev) => {
                const next = { ...prev };
                delete next[deletedQid];
                return next;
              });
              if (question && question.id === deletedQid) {
                setAnswer("");
              }
              setAllQuestionsComplete(false);
            }
          } else if (payload.eventType === "INSERT") {
            const newResp = payload.new as any;
            setSubmittedFor((prev) => new Set([...prev, newResp.question_id]));
            setSubmittedAnswers((prev) => ({
              ...prev,
              [newResp.question_id]: newResp.answer ?? "",
            }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [participantId, session?.id, question?.id]);

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
      // Verify if the participant still exists in the database to prevent foreign key errors
      (async () => {
        try {
          const { data, error } = await supabase
            .from("participants")
            .select("id")
            .eq("id", parsed.id)
            .maybeSingle();

          if (!error && data) {
            setParticipantId(parsed.id);
            setName(parsed.name);
          } else {
            console.warn("Stale participant ID found in localStorage. Clearing.");
            localStorage.removeItem(`kctpulse-${session.id}`);
            setParticipantId(null);
            setName("");
          }
        } catch (e) {
          console.error("Error verifying participant ID:", e);
          // Fallback to restore in case of network issues so we don't lock students out
          setParticipantId(parsed.id);
          setName(parsed.name);
        }
      })();
    }
  }, [session?.id]);

  // Load existing database submissions for this participant to prevent reload duplicate submissions
  useEffect(() => {
    if (!participantId) return;
    const activeIds = session?.active_question_ids || [];
    const questionIds = [
      session?.current_question_id,
      ...activeIds,
      ...allQuestions.map((q) => q.id),
    ].filter(Boolean) as string[];

    if (questionIds.length === 0) return;

    (async () => {
      const { data, error } = await supabase
        .from("responses")
        .select("question_id,answer")
        .eq("participant_id", participantId)
        .in("question_id", questionIds);

      if (!error && data) {
        const answeredIds = data.map((r) => r.question_id);
        setSubmittedFor(new Set(answeredIds));
        setSubmittedAnswers(Object.fromEntries(data.map((r) => [r.question_id, r.answer ?? ""])));
        if (allQuestions.length > 0 && allQuestions.every((q) => answeredIds.includes(q.id))) {
          setAllQuestionsComplete(true);
        } else {
          setAllQuestionsComplete(false);
        }
      }
    })();
  }, [participantId, question?.id, allQuestions.length, session]);

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
    if (error || !data) {
      toast.error(error?.message ?? "Failed to join");
      return;
    }
    setParticipantId(data.id);
    localStorage.setItem(
      `kctpulse-${session.id}`,
      JSON.stringify({ id: data.id, name: name.trim() }),
    );
  };

  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadResponseImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `responses/${crypto.randomUUID()}.${fileExt}`;

    const { data, error } = await supabase.storage.from("question-images").upload(fileName, file);

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("question-images").getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (qid?: string, ans?: string) => {
    if (submitting) return;
    const targetQ = qid ? (allQuestions.find((q) => q.id === qid) ?? question) : question;
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
      setSubmittedFor((prev) => new Set([...prev, targetQ.id]));
      if (!qid) {
        setAnswer("");
        setResponseFile(null);
      } else setAnswerMap((prev) => ({ ...prev, [targetQ.id]: "" }));
      toast.success("Response submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAll = async () => {
    if (submitting) return;
    if (!participantId) return;

    const pendingQuestions = allQuestions.filter((q) => !submittedFor.has(q.id));
    const missingQuestions = pendingQuestions.filter((q) => !(answerMap[q.id] ?? "").trim());

    if (missingQuestions.length > 0) {
      setUnansweredQuestionIds(new Set(missingQuestions.map((q) => q.id)));
      toast.error(
        `Please answer ${missingQuestions.length === 1 ? "the highlighted question" : "all highlighted questions"} before submitting`,
      );
      return;
    }

    const responses = pendingQuestions.map((q) => ({
      question: q,
      answer: (answerMap[q.id] ?? "").trim(),
    }));

    if (responses.length === 0) {
      setUnansweredQuestionIds(new Set());
      toast.success("All questions are already submitted");
      return;
    }

    setUnansweredQuestionIds(new Set());
    setSubmitting(true);
    try {
      const { error } = await supabase.from("responses").insert(
        responses.map(({ question, answer }) => ({
          question_id: question.id,
          participant_id: participantId,
          answer,
          image_url: null,
        })),
      );

      if (error) throw error;

      setSubmittedFor(
        (prev) => new Set([...prev, ...responses.map(({ question }) => question.id)]),
      );
      setSubmittedAnswers((prev) => ({
        ...prev,
        ...Object.fromEntries(responses.map(({ question, answer }) => [question.id, answer])),
      }));
      setAnswerMap((prev) => {
        const next = { ...prev };
        responses.forEach(({ question }) => {
          next[question.id] = "";
        });
        return next;
      });
      setAllQuestionsComplete(true);
      toast.success(
        `${responses.length} ${responses.length === 1 ? "response" : "responses"} submitted`,
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit responses");
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check the code <span className="font-mono">{upperCode}</span> with your faculty.
          </p>
        </div>
      </Wrap>
    );
  }
  if (!session)
    return (
      <Wrap secondsLeft={secondsLeft}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Wrap>
    );

  if (session.status === "ended") {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This session has ended. Thanks for joining!
          </p>
        </div>
      </Wrap>
    );
  }

  if (session.status === "draft") {
    return (
      <Wrap secondsLeft={secondsLeft}>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            This session is not active yet. Waiting for the faculty to start it...
          </p>
          <div className="flex justify-center pt-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-accent">
              <div className="h-full w-1/2 gradient-bg animate-pulse" />
            </div>
          </div>
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
          <div className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">
            {session.code}
          </div>
        </div>
        <form onSubmit={handleJoin} className="mt-8 space-y-4">
          <Input
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            className="h-14 text-center text-lg"
          />
          <Button
            disabled={joining || !name.trim()}
            className="w-full h-14 text-base gradient-bg font-semibold"
          >
            {joining ? "Joining..." : "Join Session"}
          </Button>
        </form>
      </Wrap>
    );
  }

  // If this is a secure exam, enforce fullscreen kiosk mode
  if (session?.is_exam && participantId && (!isFullscreenActive || isWarningOpen)) {
    const maxExits = session.max_fullscreen_exits ?? 3;
    const isLockdown = fullscreenExits >= maxExits;

    return (
      <Wrap secondsLeft={secondsLeft}>
        <div
          className={cn(
            "text-center space-y-6 bg-card border-2 p-6 rounded-2xl animate-in fade-in zoom-in duration-300",
            isLockdown
              ? "border-rose-500/20 animate-lock-blink"
              : "border-amber-500/20 animate-lock-blink-warning",
          )}
        >
          <div
            className={cn(
              "mx-auto grid h-16 w-16 place-items-center rounded-full",
              isLockdown ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500",
            )}
          >
            <Lock className="h-8 w-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <div
              className={cn(
                "text-xs font-black uppercase tracking-widest",
                isLockdown ? "text-rose-500" : "text-amber-500",
              )}
            >
              {isLockdown ? "Exam Locked" : "Secure Kiosk Mode"}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{session.title}</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {isLockdown
                ? "You have exceeded the maximum allowed fullscreen exits. The exam has been locked. Please contact your faculty invigilator to inspect and unlock your session."
                : "This exam requires a secure fullscreen environment. Tab switching, screen recording, and exiting fullscreen are logged by the faculty integrity monitor."}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2 text-left text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold">Fullscreen Warnings:</span>
              <span
                className={cn(
                  "font-bold px-2 py-0.5 rounded-full text-[10px]",
                  fullscreenExits >= maxExits
                    ? "bg-rose-500/10 text-rose-500"
                    : "bg-amber-500/10 text-amber-500",
                )}
              >
                {fullscreenExits} / {maxExits} Exits
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border/40 pt-2">
              <span className="text-muted-foreground font-semibold">Network Quality:</span>
              <span className={cn("font-bold", isOnline ? "text-emerald-500" : "text-rose-500")}>
                {isOnline ? `Online (${connectionType})` : "Offline"}
              </span>
            </div>
            {isOnline && latency > 0 && (
              <div className="flex justify-between items-center border-t border-border/40 pt-2">
                <span className="text-muted-foreground font-semibold">Heartbeat RTT:</span>
                <span className="font-bold text-foreground">{latency} ms</span>
              </div>
            )}
          </div>

          {!isLockdown ? (
            <Button
              onClick={requestFullscreen}
              className="w-full h-14 text-base font-bold gradient-bg flex items-center justify-center gap-2"
            >
              <Play className="h-5 w-5" /> Enter Fullscreen & Continue
            </Button>
          ) : (
            <div className="text-xs text-rose-400 font-medium font-mono text-center pt-2">
              Access Restricted. Warnings limit exceeded.
            </div>
          )}
        </div>
      </Wrap>
    );
  }

  // ── ALL mode or Multi-select mode: show multiple questions at once ─────────────────────────────────
  const hasMultipleActive =
    session.all_active || (session.active_question_ids && session.active_question_ids.length > 1);
  if (hasMultipleActive && allQuestions.length > 0) {
    const pendingQuestions = allQuestions.filter((q) => !submittedFor.has(q.id));
    const answeredPendingCount = pendingQuestions.filter((q) =>
      (answerMap[q.id] ?? "").trim(),
    ).length;

    if (allQuestionsComplete || pendingQuestions.length === 0) {
      return (
        <Wrap secondsLeft={secondsLeft} isOnline={isOnline} latency={latency}>
          <div className="mx-auto flex min-h-[58vh] w-full max-w-md flex-col items-center justify-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-[color:var(--accent-emerald)]/15 text-[color:var(--accent-emerald)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Your response was saved.</h1>
            <p className="mt-2 text-base text-muted-foreground">Thank you.</p>
            <div className="mt-8 w-full rounded-md border border-border bg-card/50 px-4 py-3 text-left">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Session</div>
              <div className="mt-1 font-semibold">{session.title}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full rounded-[4px] gap-2"
              onClick={() => setShowSavedResponses((value) => !value)}
            >
              <Eye className="h-4 w-4" />
              {showSavedResponses ? "Hide responses" : "View responses"}
            </Button>
            {showSavedResponses && (
              <div className="mt-4 w-full space-y-3 text-left">
                {allQuestions.map((q, index) => (
                  <div key={q.id} className="rounded-md border border-border bg-card/60 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Question {index + 1}
                    </div>
                    <div className="mt-1 text-sm font-semibold">{q.title}</div>
                    <div className="mt-3 rounded-md bg-background/70 px-3 py-2 text-sm">
                      {submittedAnswers[q.id] || "No answer saved"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Wrap>
      );
    }

    return (
      <Wrap secondsLeft={secondsLeft} isOnline={isOnline} latency={latency}>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmitAll();
          }}
        >
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">
              All Questions
            </div>
            <h1 className="mt-1 text-xl font-bold">{session.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hi {name}! Answer all questions below.
            </p>
          </div>
          {allQuestions.map((q, i) => {
            const submitted = submittedFor.has(q.id);
            const qAnswer = answerMap[q.id] ?? "";
            const isUnanswered = unansweredQuestionIds.has(q.id) && !submitted && !qAnswer.trim();
            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-2xl border-2 bg-card/40 p-4 space-y-3 transition",
                  isUnanswered
                    ? "border-rose-500/20 bg-destructive/10 animate-validation-blink"
                    : submitted
                      ? "border-emerald-500/80 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                      : "border-border/30",
                )}
              >
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {q.type}
                    </span>
                  </div>
                  {q.type === "quiz" && (
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                        isMultipleCorrect(q)
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          : "bg-primary/10 border-primary/20 text-primary",
                      )}
                    >
                      {isMultipleCorrect(q) ? "Multiple Answers" : "Single Answer"}
                    </span>
                  )}
                </div>
                {q.image_url && (
                  <img
                    src={q.image_url}
                    alt=""
                    className="rounded-xl max-h-40 object-contain w-full border border-border"
                  />
                )}
                <p className="font-semibold leading-snug">{q.title}</p>
                {submitted ? (
                  <div className="flex items-center gap-2 text-sm text-[color:var(--accent-emerald)]">
                    <CheckCircle2 className="h-4 w-4" /> Submitted!
                  </div>
                ) : q.type === "wordcloud" ? (
                  <div className="space-y-2">
                    <Textarea
                      value={qAnswer}
                      onChange={(e) => {
                        setAnswerMap((p) => ({ ...p, [q.id]: e.target.value }));
                        setUnansweredQuestionIds((prev) => {
                          if (!prev.has(q.id)) return prev;
                          const next = new Set(prev);
                          next.delete(q.id);
                          return next;
                        });
                      }}
                      placeholder="Type your thoughts..."
                      rows={2}
                      maxLength={200}
                      aria-invalid={isUnanswered}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (isMultipleCorrect(q)) {
                            const currentSelected = qAnswer
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            let updatedSelected = [];
                            if (currentSelected.includes(opt.trim())) {
                              updatedSelected = currentSelected.filter((s) => s !== opt.trim());
                            } else {
                              updatedSelected = [...currentSelected, opt.trim()];
                            }
                            const updatedAnswer = updatedSelected.join(", ");
                            setAnswerMap((p) => ({ ...p, [q.id]: updatedAnswer }));
                            setUnansweredQuestionIds((prev) => {
                              if (!prev.has(q.id) || !updatedAnswer.trim()) return prev;
                              const next = new Set(prev);
                              next.delete(q.id);
                              return next;
                            });
                          } else {
                            setAnswerMap((p) => ({ ...p, [q.id]: opt }));
                            setUnansweredQuestionIds((prev) => {
                              if (!prev.has(q.id)) return prev;
                              const next = new Set(prev);
                              next.delete(q.id);
                              return next;
                            });
                          }
                        }}
                        className={cn(
                          "w-full rounded-xl border-2 p-3 text-left text-sm font-medium transition",
                          isMultipleCorrect(q)
                            ? qAnswer
                                .split(",")
                                .map((s) => s.trim())
                                .includes(opt.trim())
                              ? "border-primary bg-primary/15"
                              : "border-border bg-card/40"
                            : qAnswer === opt
                              ? "border-primary bg-primary/15"
                              : "border-border bg-card/40",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {isUnanswered && (
                  <div className="text-xs font-semibold text-destructive">
                    Answer required before submitting.
                  </div>
                )}
              </div>
            );
          })}
          <div className="sticky bottom-4 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            {pendingQuestions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-[color:var(--accent-emerald)]">
                <CheckCircle2 className="h-4 w-4" /> All questions submitted
              </div>
            ) : (
              <Button type="submit" disabled={submitting} className={microsoftSubmitButton}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting
                  ? "Submitting..."
                  : `Submit (${answeredPendingCount}/${pendingQuestions.length})`}
              </Button>
            )}
          </div>
        </form>
      </Wrap>
    );
  }

  if (!question) {
    return (
      <Wrap secondsLeft={secondsLeft} isOnline={isOnline} latency={latency}>
        <div className="text-center space-y-6">
          {session.image_url && (
            <div className="overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center max-h-60 shadow-md">
              <img
                src={session.image_url}
                alt="Session announcement"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">
              You're in
            </div>
            <h1 className="mt-1 text-2xl font-bold">{session.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Hi {name}! Waiting for the next question…
            </p>
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
    <Wrap secondsLeft={secondsLeft} isOnline={isOnline} latency={latency}>
      {question.image_url && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center max-h-60 shadow-md">
          <img
            src={question.image_url}
            alt="Question visual"
            className="w-full h-full object-contain"
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-[color:var(--accent-emerald)]">
          {question.type}
        </div>
        {question.type === "quiz" && (
          <span
            className={cn(
              "text-xs px-2.5 py-0.5 rounded-full font-semibold border",
              isMultipleCorrect(question)
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                : "bg-primary/10 border-primary/20 text-primary",
            )}
          >
            {isMultipleCorrect(question) ? "Multiple Answers" : "Single Answer"}
          </span>
        )}
      </div>
      <h1 className="mt-1 text-2xl font-bold leading-tight">{question.title}</h1>

      {alreadySubmitted ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <CheckCircle2 className="h-16 w-16 text-[color:var(--accent-emerald)]" />
          <div className="mt-3 font-semibold">Response received</div>
          <p className="mt-1 text-sm text-muted-foreground">Waiting for the next question…</p>
        </div>
      ) : question.type === "wordcloud" ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your thoughts..."
            rows={4}
            maxLength={200}
          />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Attach Image (Optional)
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setResponseFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer h-11 bg-card/40 border-border"
              />
              {responseFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResponseFile(null)}
                  className="text-destructive"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting || !answer.trim()}
            className={microsoftSubmitButton}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </form>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-3">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  if (isMultipleCorrect(question)) {
                    const currentSelected = answer
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (currentSelected.includes(opt.trim())) {
                      const updated = currentSelected.filter((s) => s !== opt.trim());
                      setAnswer(updated.join(", "));
                    } else {
                      const updated = [...currentSelected, opt.trim()];
                      setAnswer(updated.join(", "));
                    }
                  } else {
                    setAnswer(opt);
                  }
                }}
                className={cn(
                  "w-full rounded-2xl border-2 p-4 text-left text-base font-medium transition",
                  isMultipleCorrect(question)
                    ? answer
                        .split(",")
                        .map((s) => s.trim())
                        .includes(opt.trim())
                      ? "border-primary bg-primary/15"
                      : "border-border bg-card/40"
                    : answer === opt
                      ? "border-primary bg-primary/15"
                      : "border-border bg-card/40",
                )}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Attach Image (Optional)
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setResponseFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer h-11 bg-card/40 border-border"
              />
              {responseFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResponseFile(null)}
                  className="text-destructive"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Button type="submit" disabled={submitting || !answer} className={microsoftSubmitButton}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </form>
      )}
    </Wrap>
  );
}

function Wrap({
  children,
  secondsLeft,
  isOnline,
  latency,
}: {
  children: React.ReactNode;
  secondsLeft: number | null;
  isOnline?: boolean;
  latency?: number;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-12 w-12 object-cover" />
          </div>
          <span className="font-extrabold text-lg tracking-tight">
            KCT <span className="gradient-text">PULSE</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time Network Telemetry */}
          {isOnline !== undefined && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border font-mono font-semibold transition-all duration-300",
                isOnline
                  ? latency && latency > 250
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-500 animate-pulse",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isOnline
                    ? latency && latency > 250
                      ? "bg-amber-500 animate-pulse"
                      : "bg-emerald-500 animate-pulse"
                    : "bg-rose-500",
                )}
              />
              <span>{isOnline ? (latency ? `${latency}ms` : "Online") : "Offline"}</span>
            </div>
          )}

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
      <footer className="border-t border-border/30 py-5 text-center text-[11px] text-muted-foreground space-y-1">
        <div>
          © {new Date().getFullYear()} KCT PULSE · Kumaraguru College of Technology ·{" "}
          <span className="font-semibold text-primary/80">Connect Beyond the Screen.</span>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="text-[color:var(--accent-emerald)] font-semibold">
              Founder & Designed by
            </span>
            <span className="font-bold text-foreground/70 tracking-wide">THARUN N E</span>
          </span>
          <span className="text-border/50">·</span>
          <span className="flex items-center gap-1">
            <span className="text-primary font-semibold">Developed by</span>
            <span className="font-bold text-foreground/70 tracking-wide">NAVNEETH V</span>
          </span>
          <span className="text-border/50">·</span>
          <ContactUsModal>
            <button className="hover:text-foreground font-semibold cursor-pointer transition-colors">
              Contact Us & Feedback
            </button>
          </ContactUsModal>
        </div>
      </footer>
    </div>
  );
}
