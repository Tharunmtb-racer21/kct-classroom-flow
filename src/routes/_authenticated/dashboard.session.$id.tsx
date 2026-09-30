import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Users,
  Upload,
  Image as ImageIcon,
  Pencil,
  Award,
  X,
  Zap,
  Presentation,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  Lock,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatStudentDisplayName } from "@/lib/utils";
import { joinUrl, isPrivatePreviewHost } from "@/lib/session-utils";
import { toast } from "sonner";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";
import { extractTextFromDocument } from "@/lib/document-parser";
import {
  generateQuestionsFromText,
  GeneratedQuestion,
  QType as AIQType,
  generateIntegritySummary,
} from "@/lib/ai-service";
import { ThemeToggle } from "@/components/theme-toggle";
import { VoiceInputButton } from "@/components/voice-input-button";
import { useSession, sessionKeys } from "@/hooks/queries/use-session";
import { useQuestions, questionKeys } from "@/hooks/queries/use-questions";
import { useParticipants, participantKeys } from "@/hooks/queries/use-participants";
import { sessionsKeys } from "@/hooks/queries/use-sessions";
import { queryClient } from "@/lib/query-client";

import type { QType, Question, Session, Participant, Response } from "@/types/session.types";
import { QuestionsPanel } from "@/components/session/questions-panel";
import { LivePanel } from "@/components/session/live-panel";
import { ExamIntegrityProctoring } from "@/components/session/exam-integrity-proctoring";

export const Route = createFileRoute("/_authenticated/dashboard/session/$id")({
  component: SessionControl,
});

function SessionControl() {
  const { id } = Route.useParams();
  const {
    data: fetchedSession,
    isLoading: isSessionLoading,
    refetch: refetchSession,
  } = useSession(id);
  const {
    data: fetchedQuestions,
    refetch: refetchQuestions,
  } = useQuestions(id);
  const {
    data: fetchedParticipants,
    refetch: refetchParticipants,
  } = useParticipants(id);

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [allSessionResponses, setAllSessionResponses] = useState<Response[]>([]);
  const [activeTab, setActiveTab] = useState<"quiz" | "integrity">("quiz");
  const [selectedStudent, setSelectedStudent] = useState<Participant | null>(null);
  const [studentEvents, setStudentEvents] = useState<any[]>([]);
  const [studentHeartbeats, setStudentHeartbeats] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generatingAiSummary, setGeneratingAiSummary] = useState(false);

  useEffect(() => {
    if (fetchedSession) {
      setSession(fetchedSession as Session);
    }
  }, [fetchedSession]);

  useEffect(() => {
    if (fetchedQuestions) {
      setQuestions(fetchedQuestions as Question[]);
    }
  }, [fetchedQuestions]);

  useEffect(() => {
    if (fetchedParticipants) {
      setParticipants(fetchedParticipants as Participant[]);
    }
  }, [fetchedParticipants]);

  const questionsRef = useRef<Question[]>([]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const currentQRef = useRef<Question | null>(null);

  // Session Rename States
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const handleRenameSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const trimmed = renameTitle.trim();
      const { error } = await supabase
        .from("sessions")
        .update({ title: trimmed })
        .eq("id", session.id);

      if (error) throw error;

      setSession((prev) => (prev ? { ...prev, title: trimmed } : null));
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      toast.success("Session renamed successfully! ✏️");
      setRenameDialogOpen(false);
    } catch (err: any) {
      console.error("Rename session error:", err);
      toast.error(err.message || "Failed to rename session.");
    } finally {
      setRenaming(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!selectedStudent) return;
    setGeneratingAiSummary(true);
    try {
      const summary = await generateIntegritySummary(
        studentEvents,
        formatStudentDisplayName(selectedStudent.name, selectedStudent.id),
      );
      setAiSummary(summary);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate AI proctoring summary.");
    } finally {
      setGeneratingAiSummary(false);
    }
  };

  const viewStudentAudit = async (student: Participant) => {
    setSelectedStudent(student);
    setAiSummary(null);
    setLoadingAudit(true);
    try {
      const { data: events } = await (supabase as any)
        .from("exam_integrity_events")
        .select("*")
        .eq("participant_id", student.id)
        .order("timestamp", { ascending: false });

      const { data: heartbeats } = await (supabase as any)
        .from("exam_heartbeats")
        .select("*")
        .eq("participant_id", student.id)
        .order("timestamp", { ascending: false })
        .limit(20);

      setStudentEvents(events || []);
      setStudentHeartbeats(heartbeats || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      toast.error("Failed to load student proctoring logs.");
    } finally {
      setLoadingAudit(false);
    }
  };

  const [recentHeartbeats, setRecentHeartbeats] = useState<
    Record<string, { timestamp: string; latency_ms: number; status: string }>
  >({});

  const loadAll = async () => {
    // 1, 2, 3. Fetch Session, Questions, Participants via React Query
    const [sRes, qRes, pRes] = await Promise.all([
      refetchSession(),
      refetchQuestions(),
      refetchParticipants(),
    ]);

    if (sRes.data) {
      setSession(sRes.data as Session);
    }
    const qList = (qRes.data ?? questions) as Question[];
    if (qRes.data) {
      setQuestions(qList);
    }
    if (pRes.data) {
      setParticipants(pRes.data as Participant[]);
    }

    // 4. Fetch Responses
    if (qList.length > 0) {
      const qIds = qList.map((q) => q.id);
      const { data: respData } = await supabase
        .from("responses")
        .select("*")
        .in("question_id", qIds);
      setAllSessionResponses((respData ?? []) as Response[]);
    } else {
      setAllSessionResponses([]);
    }

    // 5. Fetch recent heartbeats (with fallback if exam_heartbeats table does not exist yet)
    try {
      const { data: hbs, error: hbsErr } = await (supabase as any)
        .from("exam_heartbeats")
        .select("participant_id, timestamp, latency_ms, status")
        .eq("session_id", id)
        .order("timestamp", { ascending: false });

      if (hbsErr) {
        console.warn("Heartbeats table load failed (probably database migration syncing):", hbsErr);
        setRecentHeartbeats({});
      } else {
        const latestHbs: Record<string, { timestamp: string; latency_ms: number; status: string }> =
          {};
        if (hbs) {
          hbs.forEach((hb: any) => {
            if (!latestHbs[hb.participant_id]) {
              latestHbs[hb.participant_id] = {
                timestamp: hb.timestamp,
                latency_ms: hb.latency_ms,
                status: hb.status,
              };
            }
          });
        }
        setRecentHeartbeats(latestHbs);
      }
    } catch (err) {
      console.warn("Heartbeats load exception:", err);
      setRecentHeartbeats({});
    }
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel(`sess-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setSession((s) => (s ? { ...s, ...(payload.new as Partial<Session>) } : (payload.new as Session)));
            queryClient.invalidateQueries({ queryKey: sessionKeys.detail(id) });
          } else {
            refetchSession();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions", filter: `session_id=eq.${id}` },
        () => {
          refetchQuestions();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants" },
        (payload) => {
          const sessId = (payload.new as any)?.session_id || (payload.old as any)?.session_id;
          if (sessId && sessId !== id) return;

          if (payload.eventType === "INSERT") {
            const newP = payload.new as Participant;
            setParticipants((prev) => (prev.some((p) => p.id === newP.id) ? prev : [...prev, newP]));
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as any)?.id;
            if (oldId) setParticipants((prev) => prev.filter((p) => p.id !== oldId));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Participant;
            setParticipants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }
          queryClient.invalidateQueries({ queryKey: participantKeys.session(id) });
          refetchParticipants();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, (payload) => {
        const qId = (payload.new as any)?.question_id || (payload.old as any)?.question_id;
        const knownQids = new Set(questionsRef.current.map((q) => q.id));
        if (!qId || !knownQids.has(qId)) return;

        if (payload.eventType === "INSERT") {
          const newR = payload.new as Response;
          setAllSessionResponses((prev) => {
            if (prev.some((r) => r.id === newR.id)) return prev;
            return [...prev, newR];
          });
          if (currentQRef.current?.id === qId) {
            setResponses((prev) => {
              if (prev.some((r) => r.id === newR.id)) return prev;
              return [...prev, newR];
            });
          }
          // Self-heal: If this response came from a participant not yet in local state, refresh participants immediately
          if (newR.participant_id) {
            setParticipants((prev) => {
              if (!prev.some((p) => p.id === newR.participant_id)) {
                queryClient.invalidateQueries({ queryKey: participantKeys.session(id) });
                refetchParticipants();
              }
              return prev;
            });
          }
        } else if (payload.eventType === "DELETE") {
          const oldId = (payload.old as any)?.id;
          setAllSessionResponses((prev) => prev.filter((r) => r.id !== oldId));
          if (currentQRef.current?.id === qId) {
            setResponses((prev) => prev.filter((r) => r.id !== oldId));
          }
        } else if (payload.eventType === "UPDATE") {
          const updR = payload.new as Response;
          setAllSessionResponses((prev) =>
            prev.map((r) => (r.id === updR.id ? updR : r)),
          );
          if (currentQRef.current?.id === qId) {
            setResponses((prev) =>
              prev.map((r) => (r.id === updR.id ? updR : r)),
            );
          }
        }
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exam_heartbeats",
          filter: `session_id=eq.${id}`,
        },
        (payload) => {
          const hb = payload.new as any;
          setRecentHeartbeats((prev) => ({
            ...prev,
            [hb.participant_id]: {
              timestamp: hb.timestamp,
              latency_ms: hb.latency_ms,
              status: hb.status || "stable",
            },
          }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refetchSession, refetchQuestions, refetchParticipants]);

  // When all_active is true, show every question as live
  const isAllMode = !!session?.all_active;
  const activeIdsSet = new Set(session?.active_question_ids ?? []);
  const currentQ = isAllMode
    ? null
    : (questions.find((q) => q.id === session?.current_question_id) ?? null);

  useEffect(() => {
    currentQRef.current = currentQ;
  }, [currentQ]);

  useEffect(() => {
    if (!currentQ) {
      setResponses([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("responses")
        .select("*")
        .eq("question_id", currentQ.id)
        .order("created_at");
      if (active) setResponses((data ?? []) as Response[]);
    })();
    const ch = supabase
      .channel(`resp-${currentQ.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "responses",
          filter: `question_id=eq.${currentQ.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newR = payload.new as Response;
            setResponses((prev) => (prev.some((r) => r.id === newR.id) ? prev : [...prev, newR]));
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as any)?.id;
            setResponses((prev) => prev.filter((r) => r.id !== oldId));
          } else if (payload.eventType === "UPDATE") {
            const updR = payload.new as Response;
            setResponses((prev) => prev.map((r) => (r.id === updR.id ? updR : r)));
          }
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [currentQ?.id]);

  const updateSession = async (patch: Partial<Session>) => {
    // Optimistically update local session state to keep UI snappy
    setSession((prev) => (prev ? { ...prev, ...patch } : null));

    const { error } = await (supabase.from("sessions") as any).update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      // Revert to correct server state on failure
      loadAll();
    } else {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
    }
  };

  const startSession = () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    updateSession({ status: "live", expires_at: expiresAt });
    toast.success("Live session started! (Auto-drafts after 1 hour)");
  };
  const pauseSession = () => updateSession({ status: "draft", expires_at: null });
  const endSession = () =>
    updateSession({
      status: "ended",
      current_question_id: null,
      all_active: false,
      expires_at: null,
    });

  const goToQuestion = async (qid: string | null) => {
    if (session?.status !== "live") {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await updateSession({ status: "live", current_question_id: qid, expires_at: expiresAt });
    } else {
      await updateSession({ current_question_id: qid });
    }
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

  // ── Auto Play ─────────────────────────────────────────────────────────────
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState(30); // seconds
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(0);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [customValue, setCustomValue] = useState("30");
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TIMER_OPTIONS = [
    { label: "30s", value: 30 },
    { label: "1 min", value: 60 },
    { label: "2 min", value: 120 },
    { label: "3 min", value: 180 },
    { label: "5 min", value: 300 },
  ];

  const stopAutoPlay = async () => {
    setAutoPlay(false);
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    autoPlayRef.current = null;
    countdownRef.current = null;
    setAutoPlayCountdown(0);
    // Clear expires_at and current_question_id in db
    await supabase
      .from("sessions")
      .update({ expires_at: null, current_question_id: null } as any)
      .eq("id", id);
  };

  const startAutoPlay = async () => {
    if (questions.length === 0) {
      toast.error("Add questions before using Auto Play.");
      return;
    }
    setShowTimerPicker(false);
    setAutoPlay(true);

    const updateExpiresAtInDb = async (secondsAhead: number) => {
      const expDate = new Date(Date.now() + secondsAhead * 1000).toISOString();
      await supabase
        .from("sessions")
        .update({ expires_at: expDate } as any)
        .eq("id", id);
    };

    // Activate the first question immediately
    const firstQ = questions[0];
    goToQuestion(firstQ.id);
    setAutoPlayCountdown(autoPlayInterval);
    updateExpiresAtInDb(autoPlayInterval);

    // Countdown tick every second
    let remaining = autoPlayInterval;
    let currentIndex = 0;

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setAutoPlayCountdown(remaining);
    }, 1000);

    // Advance question every `autoPlayInterval` seconds
    autoPlayRef.current = setInterval(async () => {
      currentIndex += 1;
      if (currentIndex >= questions.length) {
        // All questions done
        stopAutoPlay();
        toast.success("Auto Play finished! All questions completed. 🎉");
        return;
      }
      goToQuestion(questions[currentIndex].id);
      remaining = autoPlayInterval;
      setAutoPlayCountdown(autoPlayInterval);
      await updateExpiresAtInDb(autoPlayInterval);
    }, autoPlayInterval * 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const copyQrCodeAsImage = async () => {
    try {
      const canvas = document.querySelector("#session-qr-code canvas") as HTMLCanvasElement;
      if (!canvas) {
        toast.error("QR Code element not found.");
        return;
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
              }),
            ]);
            toast.success("QR Code card copied to clipboard! 🖼️");
          } catch (err) {
            console.warn("Clipboard copy failed, triggering automatic file download instead:", err);
            // Fallback: download directly as a PNG file
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `session-qr-${session?.code || id}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("QR Code downloaded as PNG image! 📥");
          }
        }
      }, "image/png");
    } catch (err) {
      console.error("Error capturing QR code:", err);
      toast.error("Failed to copy QR Code.");
    }
  };

  if (!session) {
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        {isSessionLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Loading session...</span>
          </>
        ) : (
          <span>Session not found or unavailable.</span>
        )}
      </div>
    );
  }

  const joinLink = joinUrl(session.code);
  const previewWarning = isPrivatePreviewHost() && !(import.meta as any).env?.VITE_PUBLIC_APP_URL;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 relative z-20">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRenameTitle(session.title);
                setRenameDialogOpen(true);
              }}
              className="h-8 px-2.5 text-xs gap-1.5 border-border/80 text-muted-foreground hover:text-foreground rounded-lg"
              title="Rename Session"
            >
              <Pencil className="h-3.5 w-3.5 text-primary" /> Rename
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <StatusPill status={session.status} />
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {Math.max(participants.length, new Set(allSessionResponses.map((r) => r.participant_id)).size)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card/30 border border-border/40 p-2 shadow-lg backdrop-blur-md relative z-30">
          <ThemeToggle variant="outline" className="rounded-xl h-10 w-10 border-border/80" />
          {session.status !== "live" && session.status !== "ended" && (
            <Button
              onClick={startSession}
              className="gradient-bg text-white font-semibold shadow-md rounded-xl h-10"
            >
              <Play className="mr-2 h-4 w-4" /> Start
            </Button>
          )}
          {session.status === "live" && !autoPlay && (
            <>
              <Button
                onClick={nextQuestion}
                variant="secondary"
                className="font-semibold rounded-xl h-10 border border-border/20"
              >
                <ChevronRight className="mr-2 h-4 w-4" /> Next Question
              </Button>
              <Button
                onClick={pauseSession}
                variant="outline"
                className="font-semibold rounded-xl h-10 border-border/80"
              >
                <Pause className="mr-2 h-4 w-4" /> Pause
              </Button>
            </>
          )}
          {session.status !== "ended" && (
            <Button
              onClick={endSession}
              variant="destructive"
              className="font-semibold rounded-xl h-10 shadow-md"
            >
              <Square className="mr-2 h-4 w-4" /> End
            </Button>
          )}

          {/* ── Auto Play Button ── */}
          {session.status !== "ended" && !autoPlay && (
            <>
              <Button
                onClick={() => {
                  setCustomValue(autoPlayInterval.toString());
                  setShowTimerPicker(true);
                }}
                variant="outline"
                className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 transition-all animate-ai-pulse rounded-xl h-10"
              >
                <Zap className="h-4 w-4" />
                Auto Play
              </Button>

              <Dialog open={showTimerPicker} onOpenChange={setShowTimerPicker}>
                <DialogContent className="max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6">
                  <DialogHeader className="space-y-1.5 text-left">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                      <Zap className="h-5 w-5 text-primary animate-pulse" />
                      Auto Play Settings
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground leading-normal">
                      Auto Play automatically cycles through all questions in your session
                      one-by-one. Each question will remain active for the selected duration before
                      transitioning to the next. Students will see a live countdown timer.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-3 text-left">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Preset Timers
                      </Label>
                      <div className="grid grid-cols-5 gap-2">
                        {TIMER_OPTIONS.map((opt) => {
                          const isSelected = autoPlayInterval === opt.value;
                          return (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => {
                                setAutoPlayInterval(opt.value);
                                setCustomValue(opt.value.toString());
                              }}
                              className={cn(
                                "rounded-xl text-xs h-9 px-0 font-semibold transition-all",
                                isSelected && "shadow-md shadow-primary/20",
                              )}
                            >
                              {opt.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="custom-seconds"
                        className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                      >
                        Custom Duration (Seconds)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="custom-seconds"
                          type="number"
                          min={5}
                          max={3600}
                          value={customValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomValue(val);
                            const parsed = parseInt(val);
                            if (!isNaN(parsed) && parsed > 0) {
                              setAutoPlayInterval(parsed);
                            }
                          }}
                          placeholder="Enter seconds, e.g. 45"
                          className="rounded-xl h-10 bg-background border-border text-sm"
                        />
                        <span className="text-xs text-muted-foreground font-semibold shrink-0">
                          seconds
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Currently set to:{" "}
                        <span className="font-bold text-primary">{autoPlayInterval} seconds</span> (
                        {Math.floor(autoPlayInterval / 60)}m {autoPlayInterval % 60}s)
                      </p>
                    </div>
                  </div>

                  <DialogFooter className="flex flex-row gap-2 mt-4 sm:justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowTimerPicker(false)}
                      className="flex-1 rounded-xl h-10 font-bold"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={startAutoPlay}
                      className="flex-1 gradient-bg text-white font-bold gap-2 rounded-xl h-10 shadow-md hover:opacity-90"
                    >
                      <Zap className="h-4 w-4" />
                      Start Auto Play
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* ── Auto Play Active Indicator ── */}
          {autoPlay && (
            <div className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground shadow-md transition-all active:scale-[0.98]">
              <Zap className="h-4 w-4 animate-pulse text-primary-foreground" />
              <span className="font-semibold">Auto</span>
              <div className="flex items-center gap-1">
                <div className="h-5 w-5 rounded-full border border-primary-foreground/40 flex items-center justify-center bg-black/10">
                  <span className="text-[10px] font-bold text-primary-foreground">
                    {autoPlayCountdown}
                  </span>
                </div>
                <span className="text-xs text-primary-foreground/75">s</span>
              </div>
              <button
                onClick={stopAutoPlay}
                className="ml-2 text-primary-foreground/70 hover:text-primary-foreground transition-colors p-0.5 hover:bg-black/15 rounded"
                title="Stop Auto Play"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rename Session Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Pencil className="h-5 w-5 text-primary" />
              Rename Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update the name of this classroom session. Students and participants will see the updated title automatically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRenameSession} className="space-y-4 pt-2">
            <div className="space-y-2 text-left">
              <Label htmlFor="session-rename-title" className="text-xs font-semibold text-muted-foreground">
                Session Title
              </Label>
              <Input
                id="session-rename-title"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                required
                autoFocus
                placeholder="e.g. Thermodynamics & Heat Flow - Lecture 2"
                className="rounded-xl border-border bg-background/50 h-10 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Session Code: <span className="font-mono font-bold text-primary">{session.code}</span>
              </p>
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
                className="rounded-xl text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={renaming || !renameTitle.trim() || renameTitle.trim() === session.title}
                className="gradient-bg text-white font-semibold rounded-xl text-xs h-9 gap-1.5 shadow-md"
              >
                {renaming ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dynamic Session Analytics Summary Bar */}
      <div className="mt-6 glass rounded-2xl p-5 border border-white/10 bg-white/[0.02] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Questions
          </span>
          <div className="text-xl font-bold text-foreground mt-0.5">{questions.length} Qs</div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Students Joined
          </span>
          <div className="text-xl font-bold text-foreground mt-0.5">
            {Math.max(participants.length, new Set(allSessionResponses.map((r) => r.participant_id)).size)} Students
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Total Submissions
          </span>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">
            {allSessionResponses.length} Resp.
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Participation %
          </span>
          <div className="text-xl font-bold text-cyan-400 mt-0.5">
            {questions.length > 0 &&
            Math.max(participants.length, new Set(allSessionResponses.map((r) => r.participant_id)).size) > 0
              ? Math.min(
                  100,
                  Math.round(
                    (allSessionResponses.length /
                      (questions.length *
                        Math.max(
                          participants.length,
                          new Set(allSessionResponses.map((r) => r.participant_id)).size,
                        ))) *
                      100,
                  ),
                )
              : 0}
            %
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Completion %
          </span>
          <div className="text-xl font-bold text-purple-400 mt-0.5">
            {questions.length > 0
              ? Math.round(
                  (questions.filter((q) => allSessionResponses.some((r) => r.question_id === q.id))
                    .length /
                    questions.length) *
                    100,
                )
              : 0}
            %
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">
            Export Status
          </span>
          <div className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready (PDF/CSV)
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-2xl p-6 lg:col-span-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Session Code
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/40 border border-border/50 px-4 py-3">
            <div className="font-mono text-3xl font-extrabold tracking-[0.15em] text-foreground gradient-text select-all">
              {session.code}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(session.code);
                toast.success("Copied to clipboard! 📋");
              }}
              className="h-8 w-8 p-0 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Copy Code"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-6 flex justify-center">
            <div
              id="session-qr-code"
              className="rounded-3xl bg-white p-5 shadow-[0_0_30px_rgba(255,255,255,0.06)] border border-white/5 transition-transform hover:scale-[1.02] duration-300"
            >
              <QRCodeCanvas value={joinLink} size={190} level="M" includeMargin={false} />
            </div>
          </div>
          <div
            className="mt-4 truncate text-center text-[11px] font-mono text-muted-foreground bg-muted/30 hover:bg-muted/40 transition-colors p-2.5 rounded-xl border border-border/50 select-all cursor-pointer"
            title="Double click to select all"
          >
            {joinLink}
          </div>

          <Button
            type="button"
            onClick={copyQrCodeAsImage}
            variant="outline"
            size="sm"
            className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-xl border-border bg-card/50 hover:bg-accent hover:text-accent-foreground text-xs font-semibold py-2.5 shadow-sm transition animate-in fade-in duration-200"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Copy QR Code as Image
          </Button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(joinLink);
                toast.success("Join link copied! 📋");
              }}
              variant="outline"
              size="sm"
              className="flex items-center justify-center gap-1.5 rounded-xl border-border bg-card/50 hover:bg-accent hover:text-accent-foreground text-xs font-semibold py-2.5 shadow-sm transition"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="flex items-center justify-center gap-1.5 rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold py-2.5 shadow-sm transition"
            >
              <a href={joinLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open Link
              </a>
            </Button>
          </div>
          <button
            onClick={() => {
              const embedUrl = `${window.location.origin}/embed/${session.code}`;
              navigator.clipboard.writeText(embedUrl);
              toast.success("PowerPoint / Slide Embed URL copied! 📊");
            }}
            className="mt-2 w-full text-xs text-primary font-semibold hover:underline flex items-center justify-center gap-1.5"
          >
            <Presentation className="h-3.5 w-3.5" />
            Copy Slide Embed URL (PowerPoint/Google Slides)
          </button>
          {previewWarning && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              This is a private preview URL — students on other devices cannot open it. Publish the
              app (top-right) or set <span className="font-mono">VITE_PUBLIC_APP_URL</span> so the
              QR points to your live site.
            </div>
          )}

          {/* Exam Integrity Settings Panel */}
          <div className="glass rounded-2xl p-5 mt-6 border border-border/50 bg-card/40 space-y-4 text-left">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                Exam Integrity Settings
              </h3>
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <div className="space-y-0.5">
                <Label htmlFor="exam-mode-toggle" className="text-xs font-semibold cursor-pointer">
                  Secure Exam Mode
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Enforce proctoring & kiosk monitoring
                </p>
              </div>
              <button
                id="exam-mode-toggle"
                onClick={() => updateSession({ is_exam: !session.is_exam })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  session.is_exam ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                    session.is_exam ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </div>

            {session.is_exam && (
              <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="max-exits"
                    className="text-[10px] font-bold text-muted-foreground uppercase"
                  >
                    Max Fullscreen Exits
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max-exits"
                      type="number"
                      min={1}
                      max={10}
                      value={session.max_fullscreen_exits ?? 3}
                      onChange={(e) =>
                        updateSession({ max_fullscreen_exits: parseInt(e.target.value) || 3 })
                      }
                      className="h-8 w-16 text-center text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      exits allowed before lockout
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-3">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="block-clip"
                      className="text-[11px] font-semibold cursor-pointer"
                    >
                      Restrict Clipboard
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Disable copy, cut, and paste
                    </p>
                  </div>
                  <button
                    id="block-clip"
                    onClick={() => updateSession({ block_clipboard: !session.block_clipboard })}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      session.block_clipboard ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                        session.block_clipboard ? "translate-x-3" : "translate-x-0",
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-3">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="block-right"
                      className="text-[11px] font-semibold cursor-pointer"
                    >
                      Block Right-Click
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Disable student context menu
                    </p>
                  </div>
                  <button
                    id="block-right"
                    onClick={() => updateSession({ block_right_click: !session.block_right_click })}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      session.block_right_click ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                        session.block_right_click ? "translate-x-3" : "translate-x-0",
                      )}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {session.is_exam && (
            <div className="flex rounded-xl bg-muted p-1 w-fit border border-border/50">
              <button
                onClick={() => setActiveTab("quiz")}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5",
                  activeTab === "quiz"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Presentation className="h-3.5 w-3.5" /> Quiz Controller
              </button>
              <button
                onClick={() => setActiveTab("integrity")}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-bold transition flex items-center gap-1.5",
                  activeTab === "integrity"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap className="h-3.5 w-3.5" /> Exam Proctoring Live
              </button>
            </div>
          )}

          {activeTab === "quiz" || !session.is_exam ? (
            <>
              <QuestionsPanel
                session={session}
                sessionId={id}
                questions={questions}
                currentId={session.current_question_id}
                isAllMode={isAllMode}
                activeQuestionIds={session.active_question_ids || []}
                onActivate={goToQuestion}
                onReload={loadAll}
                updateSession={updateSession}
              />
              <LivePanel current={currentQ} responses={responses} participants={participants} />
            </>
          ) : (
            <ExamIntegrityProctoring
              session={session}
              participants={participants}
              recentHeartbeats={recentHeartbeats}
              onSelectStudent={viewStudentAudit}
            />
          )}
        </div>
      </div>

      {/* Student Audit slide-over Drawer overlay */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="h-full w-full max-w-md bg-background border-l border-border shadow-2xl p-6 flex flex-col space-y-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <Users className="h-5 w-5 text-primary" />
                  {formatStudentDisplayName(selectedStudent.name, selectedStudent.id)}
                </h3>
                <span className="text-xs text-muted-foreground font-mono">
                  ID: {selectedStudent.id}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStudent(null)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {loadingAudit ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-xs">Loading integrity audit timeline...</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-6">
                {/* Score and Status cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">
                      Risk Score
                    </span>
                    <div
                      className={cn(
                        "text-2xl font-extrabold font-mono",
                        (selectedStudent.risk_score ?? 0) >= 60
                          ? "text-rose-500"
                          : (selectedStudent.risk_score ?? 0) >= 25
                            ? "text-amber-500"
                            : "text-emerald-500",
                      )}
                    >
                      {Math.round(selectedStudent.risk_score ?? 0)} pts
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">
                      Risk Category
                    </span>
                    <div className="mt-1">
                      <span
                        className={cn(
                          "text-xs px-2.5 py-0.5 rounded-full font-bold border uppercase tracking-wider",
                          selectedStudent.risk_level === "high"
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                            : selectedStudent.risk_level === "medium"
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                        )}
                      >
                        {selectedStudent.risk_level ?? "low"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Timeline Analysis Card */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                      <span className="text-xs font-bold text-foreground">
                        AI Invigilator Analysis
                      </span>
                    </div>
                    {!aiSummary && (
                      <Button
                        onClick={handleGenerateAiSummary}
                        disabled={generatingAiSummary}
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] px-2 text-primary font-bold hover:bg-primary/10 gap-1"
                      >
                        {generatingAiSummary ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Analyze Logs
                      </Button>
                    )}
                  </div>

                  {aiSummary ? (
                    <p className="text-xs text-muted-foreground leading-relaxed italic bg-background/50 p-2.5 rounded border border-border/30">
                      "{aiSummary}"
                    </p>
                  ) : generatingAiSummary ? (
                    <div className="h-10 flex items-center justify-center text-[10px] text-muted-foreground font-mono">
                      Generating cognitive timeline synthesis...
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Let the proctoring AI audit the chronological event logs and summarize anomaly
                      severity.
                    </p>
                  )}
                </div>

                {/* Event timeline */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-1.5">
                    Activity Timeline
                  </h4>

                  {studentEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic text-center py-6">
                      No integrity anomalies recorded. Good standing.
                    </div>
                  ) : (
                    <div className="relative pl-4 border-l border-border/60 ml-2 space-y-4">
                      {studentEvents.map((evt) => {
                        const isRiskEvent = [
                          "FULLSCREEN_EXITED",
                          "PAGE_HIDDEN",
                          "WINDOW_BLUR",
                          "COPY_ATTEMPT",
                          "RIGHT_CLICK",
                          "KEYBOARD_SHORTCUT",
                        ].includes(evt.event_type);

                        return (
                          <div key={evt.id} className="relative group">
                            {/* Dot icon */}
                            <span
                              className={cn(
                                "absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-4 ring-background",
                                isRiskEvent ? "bg-rose-500" : "bg-muted-foreground",
                              )}
                            />

                            <div className="text-xs space-y-0.5 text-left">
                              <div className="flex justify-between items-center">
                                <span
                                  className={cn(
                                    "font-bold",
                                    isRiskEvent ? "text-rose-400" : "text-foreground/80",
                                  )}
                                >
                                  {evt.event_type.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {new Date(evt.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              {evt.duration_seconds !== null &&
                                evt.duration_seconds !== undefined && (
                                  <p className="text-muted-foreground text-[10px]">
                                    Duration:{" "}
                                    <span className="font-semibold text-foreground/80">
                                      {evt.duration_seconds}s
                                    </span>
                                  </p>
                                )}
                              {evt.client_metadata &&
                                Object.keys(evt.client_metadata).length > 0 && (
                                  <div className="text-[10px] text-muted-foreground bg-muted/20 border border-border/20 p-2 rounded mt-1 overflow-x-auto max-w-full font-mono">
                                    {JSON.stringify(evt.client_metadata)}
                                  </div>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Heartbeats */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-1.5 text-left">
                    Recent Heartbeats
                  </h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {studentHeartbeats.map((hb) => (
                      <span
                        key={hb.id}
                        title={`Time: ${new Date(hb.timestamp).toLocaleTimeString()}\nLatency: ${hb.latency_ms}ms\nSpeed: ${hb.downlink_mbps} Mbps\nType: ${hb.connection_type}`}
                        className={cn(
                          "h-3 w-3 rounded border transition hover:scale-110 cursor-help",
                          hb.status === "stable"
                            ? "bg-emerald-500/20 border-emerald-500/50"
                            : "bg-amber-500/20 border-amber-500/50",
                        )}
                      />
                    ))}
                    {studentHeartbeats.length === 0 && (
                      <div className="text-xs text-muted-foreground italic text-left">
                        No heartbeat history.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
