import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import html2canvas from "html2canvas";
import { ArrowLeft, ChevronRight, Copy, FileText, Loader2, Pause, Play, Plus, Sparkles, Square, Trash2, Users, Upload, Image as ImageIcon, Pencil, X, Zap, Presentation, CheckCircle2, FileSpreadsheet, Download, AlertCircle, RotateCcw, ExternalLink, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { joinUrl, isPrivatePreviewHost } from "@/lib/session-utils";
import { toast } from "sonner";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";
import { extractTextFromDocument } from "@/lib/document-parser";
import { generateQuestionsFromText, GeneratedQuestion, QType as AIQType, generateIntegritySummary } from "@/lib/ai-service";
import { ThemeToggle } from "@/components/theme-toggle";

type QType = "wordcloud" | "poll" | "quiz";
type Question = { id: string; session_id: string; type: QType; title: string; options: string[]; correct_answer: string | null; order_index: number; image_url?: string | null; points?: number; explanation?: string | null; question_type?: string };
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
  created_at?: string; 
  creator_id?: string;
  is_exam?: boolean;
  max_fullscreen_exits?: number;
  block_clipboard?: boolean;
  block_right_click?: boolean;
};
type Participant = { 
  id: string; 
  name: string; 
  joined_at: string;
  risk_score?: number;
  risk_level?: "low" | "medium" | "high";
};
type Response = { id: string; question_id: string; participant_id: string; answer: string; created_at: string; image_url?: string | null };

export const Route = createFileRoute("/_authenticated/dashboard/session/$id")({
  component: SessionControl,
});

function SessionControl() {
  const { id } = Route.useParams();
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

  const handleGenerateAiSummary = async () => {
    if (!selectedStudent) return;
    setGeneratingAiSummary(true);
    try {
      const summary = await generateIntegritySummary(studentEvents, selectedStudent.name);
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
      const { data: events } = await (supabase as any).from("exam_integrity_events")
        .select("*")
        .eq("participant_id", student.id)
        .order("timestamp", { ascending: false });

      const { data: heartbeats } = await (supabase as any).from("exam_heartbeats")
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

  const [recentHeartbeats, setRecentHeartbeats] = useState<Record<string, { timestamp: string; latency_ms: number; status: string }>>({});

  const loadAll = async () => {
    // 1. Fetch Session with custom integrity columns (with fallback if columns do not exist yet)
    const { data: s, error: sErr } = await (supabase.from("sessions") as any).select("id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url,created_at,creator_id,is_exam,max_fullscreen_exits,block_clipboard,block_right_click").eq("id", id).maybeSingle();
    if (sErr) {
      console.warn("Integrity session columns load failed, falling back to core columns:", sErr);
      const { data: fallbackS } = await supabase.from("sessions").select("id,title,code,status,current_question_id,all_active,active_question_ids,expires_at,image_url,created_at,creator_id").eq("id", id).maybeSingle();
      setSession(fallbackS as Session | null);
    } else {
      setSession(s as Session | null);
    }

    // 2. Fetch Questions
    const { data: qs } = await supabase.from("questions").select("*").eq("session_id", id).order("order_index");
    const qList = ((qs ?? []) as unknown) as Question[];
    setQuestions(qList);

    // 3. Fetch Participants (with fallback if risk_score/risk_level columns do not exist yet)
    const { data: ps, error: psErr } = await (supabase.from("participants") as any).select("id,name,joined_at,risk_score,risk_level").eq("session_id", id).order("joined_at");
    if (psErr) {
      console.warn("Participant risk columns load failed, falling back to core fields:", psErr);
      const { data: fallbackPs } = await supabase.from("participants").select("id,name,joined_at").eq("session_id", id).order("joined_at");
      setParticipants((fallbackPs ?? []) as Participant[]);
    } else {
      setParticipants((ps ?? []) as Participant[]);
    }

    // 4. Fetch Responses
    if (qList.length > 0) {
      const qIds = qList.map((q) => q.id);
      const { data: respData } = await supabase.from("responses").select("*").in("question_id", qIds);
      setAllSessionResponses((respData ?? []) as Response[]);
    } else {
      setAllSessionResponses([]);
    }

    // 5. Fetch recent heartbeats (with fallback if exam_heartbeats table does not exist yet)
    try {
      const { data: hbs, error: hbsErr } = await (supabase as any).from("exam_heartbeats")
        .select("participant_id, timestamp, latency_ms, status")
        .eq("session_id", id)
        .order("timestamp", { ascending: false });

      if (hbsErr) {
        console.warn("Heartbeats table load failed (probably database migration syncing):", hbsErr);
        setRecentHeartbeats({});
      } else {
        const latestHbs: Record<string, { timestamp: string; latency_ms: number; status: string }> = {};
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
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `session_id=eq.${id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, loadAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "exam_heartbeats", filter: `session_id=eq.${id}` }, (payload) => {
        const hb = payload.new as any;
        setRecentHeartbeats(prev => ({
          ...prev,
          [hb.participant_id]: {
            timestamp: hb.timestamp,
            latency_ms: hb.latency_ms,
            status: hb.status || "stable",
          }
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // When all_active is true, show every question as live
  const isAllMode = !!session?.all_active;
  const activeIdsSet = new Set(session?.active_question_ids ?? []);
  const currentQ = isAllMode
    ? null
    : (questions.find((q) => q.id === session?.current_question_id) ?? null);
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
    // Optimistically update local session state to keep UI snappy
    setSession((prev) => (prev ? { ...prev, ...patch } : null));

    const { error } = await (supabase.from("sessions") as any).update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      // Revert to correct server state on failure
      loadAll();
    }
  };

  const startSession = () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    updateSession({ status: "live", expires_at: expiresAt });
    toast.success("Live session started! (Auto-drafts after 1 hour)");
  };
  const pauseSession = () => updateSession({ status: "draft", expires_at: null });
  const endSession = () => updateSession({ status: "ended", current_question_id: null, all_active: false, expires_at: null });

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
    await supabase.from("sessions").update({ expires_at: null, current_question_id: null } as any).eq("id", id);
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
      await supabase.from("sessions").update({ expires_at: expDate } as any).eq("id", id);
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
                [blob.type]: blob
              })
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
        <div className="flex flex-wrap gap-2 items-center">
          <ThemeToggle variant="outline" />
          {session.status !== "live" && session.status !== "ended" && (
            <Button onClick={startSession} className="gradient-bg"><Play className="mr-2 h-4 w-4" /> Start</Button>
          )}
          {session.status === "live" && !autoPlay && (
            <>
              <Button onClick={nextQuestion} variant="secondary"><ChevronRight className="mr-2 h-4 w-4" /> Next Question</Button>
              <Button onClick={pauseSession} variant="outline"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
            </>
          )}
          {session.status !== "ended" && (
            <Button onClick={endSession} variant="destructive"><Square className="mr-2 h-4 w-4" /> End</Button>
          )}

          {/* ── Auto Play Button ── */}
          {session.status !== "ended" && !autoPlay && (
            <div className="relative">
              <Button
                onClick={() => setShowTimerPicker((v) => !v)}
                variant="outline"
                className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60"
              >
                <Zap className="h-4 w-4" />
                Auto Play
              </Button>
              {showTimerPicker && (
                <div className="absolute right-0 top-full mt-2 z-50 glass rounded-xl border border-border p-3 min-w-[180px] shadow-xl">
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Time per question:</div>
                  <div className="flex flex-col gap-1">
                    {TIMER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setAutoPlayInterval(opt.value); }}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm text-left transition-all",
                          autoPlayInterval === opt.value
                            ? "bg-primary/20 text-primary font-semibold"
                            : "hover:bg-accent text-muted-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={startAutoPlay}
                    className="mt-3 w-full bg-primary hover:bg-primary/80 text-primary-foreground font-semibold gap-2"
                    size="sm"
                  >
                    <Zap className="h-3.5 w-3.5" /> Start Auto Play
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Auto Play Active Indicator ── */}
          {autoPlay && (
            <div className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-md transition-all active:scale-[0.98]">
              <Zap className="h-4 w-4 animate-pulse text-primary-foreground" />
              <span className="font-semibold">Auto</span>
              <div className="flex items-center gap-1">
                <div className="h-5 w-5 rounded-full border border-primary-foreground/40 flex items-center justify-center bg-black/10">
                  <span className="text-[10px] font-bold text-primary-foreground">{autoPlayCountdown}</span>
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

      {/* Dynamic Session Analytics Summary Bar */}
      <div className="mt-6 glass rounded-2xl p-5 border border-white/10 bg-white/[0.02] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Questions</span>
          <div className="text-xl font-bold text-foreground mt-0.5">{questions.length} Qs</div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Students Joined</span>
          <div className="text-xl font-bold text-foreground mt-0.5">{participants.length} Students</div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Total Submissions</span>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">{allSessionResponses.length} Resp.</div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Participation %</span>
          <div className="text-xl font-bold text-cyan-400 mt-0.5">
            {questions.length > 0 && participants.length > 0
              ? Math.min(100, Math.round((allSessionResponses.length / (questions.length * participants.length)) * 100))
              : 0}%
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Completion %</span>
          <div className="text-xl font-bold text-purple-400 mt-0.5">
            {questions.length > 0
              ? Math.round((questions.filter(q => allSessionResponses.some(r => r.question_id === q.id)).length / questions.length) * 100)
              : 0}%
          </div>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground font-semibold text-[10px]">Export Status</span>
          <div className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready (PDF/CSV)
          </div>
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
            <div id="session-qr-code" className="rounded-2xl bg-white p-4">
              <QRCodeCanvas value={joinLink} size={180} level="M" includeMargin={true} />
            </div>
          </div>
          <div className="mt-4 break-all text-center text-xs font-mono text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">{joinLink}</div>
          
          <Button
            type="button"
            onClick={copyQrCodeAsImage}
            variant="outline"
            size="sm"
            className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl border-border bg-card hover:bg-accent hover:text-accent-foreground text-xs font-semibold py-2.5 shadow-sm transition animate-in fade-in duration-200"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Copy QR Code as Image
          </Button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => { navigator.clipboard.writeText(joinLink); toast.success("Join link copied! 📋"); }}
              variant="outline"
              size="sm"
              className="flex items-center justify-center gap-1.5 rounded-xl border-border bg-card hover:bg-accent hover:text-accent-foreground text-xs font-semibold py-2.5 shadow-sm transition"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Link
            </Button>
            <a
              href={joinLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold py-2.5 shadow-sm transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Link
            </a>
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
              This is a private preview URL — students on other devices cannot open it. Publish the app (top-right) or set <span className="font-mono">VITE_PUBLIC_APP_URL</span> so the QR points to your live site.
            </div>
          )}

          {/* Exam Integrity Settings Panel */}
          <div className="glass rounded-2xl p-5 mt-6 border border-border/50 bg-card/40 space-y-4 text-left">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">Exam Integrity Settings</h3>
            </div>
            
            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <div className="space-y-0.5">
                <Label htmlFor="exam-mode-toggle" className="text-xs font-semibold cursor-pointer">Secure Exam Mode</Label>
                <p className="text-[10px] text-muted-foreground">Enforce proctoring & kiosk monitoring</p>
              </div>
              <button
                id="exam-mode-toggle"
                onClick={() => updateSession({ is_exam: !session.is_exam })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  session.is_exam ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                    session.is_exam ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {session.is_exam && (
              <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-1.5">
                  <Label htmlFor="max-exits" className="text-[10px] font-bold text-muted-foreground uppercase">Max Fullscreen Exits</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max-exits"
                      type="number"
                      min={1}
                      max={10}
                      value={session.max_fullscreen_exits ?? 3}
                      onChange={(e) => updateSession({ max_fullscreen_exits: parseInt(e.target.value) || 3 })}
                      className="h-8 w-16 text-center text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">exits allowed before lockout</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="block-clip" className="text-[11px] font-semibold cursor-pointer">Restrict Clipboard</Label>
                    <p className="text-[10px] text-muted-foreground">Disable copy, cut, and paste</p>
                  </div>
                  <button
                    id="block-clip"
                    onClick={() => updateSession({ block_clipboard: !session.block_clipboard })}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      session.block_clipboard ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                        session.block_clipboard ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="block-right" className="text-[11px] font-semibold cursor-pointer">Block Right-Click</Label>
                    <p className="text-[10px] text-muted-foreground">Disable student context menu</p>
                  </div>
                  <button
                    id="block-right"
                    onClick={() => updateSession({ block_right_click: !session.block_right_click })}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      session.block_right_click ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                        session.block_right_click ? "translate-x-3" : "translate-x-0"
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
                    : "text-muted-foreground hover:text-foreground"
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
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="h-3.5 w-3.5" /> Exam Proctoring Live
              </button>
            </div>
          )}

          {activeTab === "quiz" || !session.is_exam ? (
            <>
              <QuestionsPanel session={session} sessionId={id} questions={questions} currentId={session.current_question_id} isAllMode={isAllMode} activeQuestionIds={session.active_question_ids || []} onActivate={goToQuestion} onReload={loadAll} updateSession={updateSession} />
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
                  {selectedStudent.name}
                </h3>
                <span className="text-xs text-muted-foreground font-mono">ID: {selectedStudent.id}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)} className="h-8 w-8 p-0 rounded-full">
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
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Risk Score</span>
                    <div className={cn(
                      "text-2xl font-extrabold font-mono",
                      (selectedStudent.risk_score ?? 0) >= 60 
                        ? "text-rose-500" 
                        : (selectedStudent.risk_score ?? 0) >= 25 
                          ? "text-amber-500" 
                          : "text-emerald-500"
                    )}>
                      {Math.round(selectedStudent.risk_score ?? 0)} pts
                    </div>
                  </div>
                  
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Risk Category</span>
                    <div className="mt-1">
                      <span className={cn(
                        "text-xs px-2.5 py-0.5 rounded-full font-bold border uppercase tracking-wider",
                        selectedStudent.risk_level === "high"
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                          : selectedStudent.risk_level === "medium"
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                      )}>
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
                      <span className="text-xs font-bold text-foreground">AI Invigilator Analysis</span>
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
                      Let the proctoring AI audit the chronological event logs and summarize anomaly severity.
                    </p>
                  )}
                </div>

                {/* Event timeline */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-1.5">Activity Timeline</h4>
                  
                  {studentEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic text-center py-6">No integrity anomalies recorded. Good standing.</div>
                  ) : (
                    <div className="relative pl-4 border-l border-border/60 ml-2 space-y-4">
                      {studentEvents.map((evt) => {
                        const isRiskEvent = ["FULLSCREEN_EXITED", "PAGE_HIDDEN", "WINDOW_BLUR", "COPY_ATTEMPT", "RIGHT_CLICK", "KEYBOARD_SHORTCUT"].includes(evt.event_type);
                        
                        return (
                          <div key={evt.id} className="relative group">
                            {/* Dot icon */}
                            <span className={cn(
                              "absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-4 ring-background",
                              isRiskEvent ? "bg-rose-500" : "bg-muted-foreground"
                            )} />
                            
                            <div className="text-xs space-y-0.5 text-left">
                              <div className="flex justify-between items-center">
                                <span className={cn("font-bold", isRiskEvent ? "text-rose-400" : "text-foreground/80")}>
                                  {evt.event_type.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {new Date(evt.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              {evt.duration_seconds !== null && evt.duration_seconds !== undefined && (
                                <p className="text-muted-foreground text-[10px]">
                                  Duration: <span className="font-semibold text-foreground/80">{evt.duration_seconds}s</span>
                                </p>
                              )}
                              {evt.client_metadata && Object.keys(evt.client_metadata).length > 0 && (
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
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-1.5 text-left">Recent Heartbeats</h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {studentHeartbeats.map((hb) => (
                      <span
                        key={hb.id}
                        title={`Time: ${new Date(hb.timestamp).toLocaleTimeString()}\nLatency: ${hb.latency_ms}ms\nSpeed: ${hb.downlink_mbps} Mbps\nType: ${hb.connection_type}`}
                        className={cn(
                          "h-3 w-3 rounded border transition hover:scale-110 cursor-help",
                          hb.status === "stable" 
                            ? "bg-emerald-500/20 border-emerald-500/50" 
                            : "bg-amber-500/20 border-amber-500/50"
                        )}
                      />
                    ))}
                    {studentHeartbeats.length === 0 && (
                      <div className="text-xs text-muted-foreground italic text-left">No heartbeat history.</div>
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

function QuestionsPanel({
  session, sessionId, questions, currentId, isAllMode, activeQuestionIds, onActivate, onReload, updateSession,
}: { session: Session; sessionId: string; questions: Question[]; currentId: string | null; isAllMode: boolean; activeQuestionIds: string[]; onActivate: (id: string) => void; onReload: () => void; updateSession: (patch: Partial<Session>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QType>("poll");
  const [title, setTitle] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [questionType, setQuestionType] = useState<string>("Single Correct");
  const parsedOptions = useMemo(() => {
    return optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
  }, [optionsText]);
  const [correct, setCorrect] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Excel upload/parsing states for Quiz import
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelParsingErrors, setExcelParsingErrors] = useState<string[]>([]);
  const [excelValidated, setExcelValidated] = useState(false);
  const [excelQuestions, setExcelQuestions] = useState<any[]>([]);

  const [isRetakeConfirmOpen, setIsRetakeConfirmOpen] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    (async () => {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Sheet 1: Instructions
      const instructionsData = [
        ["", "MCQ Quiz Upload Template"],
        ["", "Fill in the 'Questions' sheet, then upload this file to create your quiz."],
        [],
        ["", "How to use this template"],
        ["", "1. Open the \"Questions\" sheet (second tab at the bottom)."],
        ["", "2. Row 2 is a filled-in EXAMPLE (shaded green). Do not delete the header row (row 1). You may delete the example row"],
        ["", "   before uploading, or leave it — it will be ignored if you follow the format."],
        ["", "3. Add one question per row, starting from row 2 (or row 3 if you kept the example)."],
        ["", "4. Fill in Option A and Option B at minimum. Option C, D and E are optional — leave blank if not needed."],
        ["", "5. In the \"Correct Answer\" column, enter the letter of the correct option (A, B, C, D, or E)."],
        ["", "6. \"Points\" is the score awarded for a correct answer. Defaults to 1 if left blank."],
        ["", "7. \"Question Type\" should be Single Correct or Multiple Correct. For Multiple Correct questions, list all"],
        ["", "   correct letters separated by commas in \"Correct Answer\" (e.g. A,C)."],
        ["", "8. \"Explanation\" is optional and shown to the user after answering (if your portal supports it)."],
        ["", "9. Do not rename column headers, do not reorder columns, and do not add extra columns — the upload parser depends on this exact layout."],
        ["", "10. Save the file as .xlsx and upload it back to the portal."],
        [],
        ["", "Formatting legend"],
        ["", "Cells you fill in (light yellow/beige)"],
        ["", "Example row (light green)"],
        [],
        ["", "Column reference"],
        ["", "• Question No: Auto-numbered. Do not edit — formula fills this automatically."],
        ["", "• Question Text: The question shown to the quiz taker. Required."],
        ["", "• Option A: First answer choice. Required."],
        ["", "• Option B: Second answer choice. Required."],
        ["", "• Option C: Third answer choice. Optional."],
        ["", "• Option D: Fourth answer choice. Optional."],
        ["", "• Option E: Fifth answer choice. Optional."],
        ["", "• Correct Answer: Letter of the correct option, e.g., 'A' or 'B'."],
        ["", "• Question Type: Single Correct or Multiple Correct."],
        ["", "• Points: Score for a correct answer. Defaults to 1 if blank."],
        ["", "• Explanation: Optional. Shown after the question is answered."],
      ];
      const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
      wsInstructions["!cols"] = [{ wch: 3 }, { wch: 110 }];
      XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

      // Sheet 2: Questions
      const headers = [
        "Question No.",
        "Question Text",
        "Option A",
        "Option B",
        "Option C",
        "Option D",
        "Option E",
        "Correct Answer",
        "Question Type",
        "Points",
        "Explanation"
      ];
      const sampleData = [
        headers,
        [
          1,
          "What is the capital of France?",
          "Paris",
          "Berlin",
          "London",
          "Rome",
          "",
          "A",
          "Single Correct",
          1,
          "Paris has been the capital of France since the 16th century."
        ]
      ];
      const wsQuestions = XLSX.utils.aoa_to_sheet(sampleData);
      wsQuestions["!cols"] = [
        { wch: 12 }, { wch: 45 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, wsQuestions, "Questions");

      // Sheet 3: Answer Key Summary
      const summaryHeaders = [
        "Question No.",
        "Question Text",
        "Correct Answer",
        "Question Type",
        "Points"
      ];
      const summaryData = [
        ["Answer Key Summary"],
        ["Auto-generated from the Questions sheet. This is for your review only — do not edit."],
        [],
        summaryHeaders,
        [
          1,
          "What is the capital of France?",
          "A",
          "Single Correct",
          1
        ]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary["!cols"] = [
        { wch: 12 }, { wch: 45 }, { wch: 15 }, { wch: 15 }, { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Answer Key Summary");

      XLSX.writeFile(wb, "mcq_quiz_upload_template.xlsx");
    })();
  };

  const handleValidateExcel = () => {
    if (!excelFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const questionsSheetName = workbook.SheetNames.find(
          (name) => name.toLowerCase() === "questions"
        );
        if (!questionsSheetName) {
          setExcelParsingErrors(["Sheet named 'Questions' was not found in the Excel template."]);
          setExcelValidated(false);
          return;
        }

        const worksheet = workbook.Sheets[questionsSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (!jsonData || jsonData.length === 0) {
          setExcelParsingErrors(["The 'Questions' sheet is empty."]);
          setExcelValidated(false);
          return;
        }

        const normalizedRows = jsonData.map((row: any) => {
          const normalized: any = {};
          Object.keys(row).forEach((key) => {
            normalized[key.trim()] = row[key];
          });
          return normalized;
        });

        // Filter out example rows or empty question texts
        const activeRows = normalizedRows.filter((r) => {
          const text = r["Question Text"];
          return text !== undefined && text !== null && String(text).trim() !== "";
        });

        if (activeRows.length === 0) {
          setExcelParsingErrors(["No questions found (all rows had empty 'Question Text')."]);
          setExcelValidated(false);
          return;
        }

        const errorsList: string[] = [];
        const parsedQuestionsList: any[] = [];

        activeRows.forEach((r, idx) => {
          const rowNum = idx + 2;
          const qText = r["Question Text"] ? String(r["Question Text"]).trim() : "";
          const optA = r["Option A"] ? String(r["Option A"]).trim() : "";
          const optB = r["Option B"] ? String(r["Option B"]).trim() : "";
          const optC = r["Option C"] ? String(r["Option C"]).trim() : "";
          const optD = r["Option D"] ? String(r["Option D"]).trim() : "";
          const optE = r["Option E"] ? String(r["Option E"]).trim() : "";
          const correctAnsRaw = r["Correct Answer"] ? String(r["Correct Answer"]).trim() : "";
          const qTypeRaw = r["Question Type"] ? String(r["Question Type"]).trim() : "";
          const pointsRaw = r["Points"];
          const explanation = r["Explanation"] ? String(r["Explanation"]).trim() : "";

          if (!qText) {
            errorsList.push(`Row ${rowNum}: Question Text is required.`);
          }
          if (!optA || !optB) {
            errorsList.push(`Row ${rowNum}: Option A and Option B are required.`);
          }

          const optionsMap: Record<string, string> = {
            A: optA,
            B: optB,
            C: optC,
            D: optD,
            E: optE,
          };
          const optionsList = [optA, optB, optC, optD, optE].filter(Boolean);
          if (optionsList.length < 2) {
            errorsList.push(`Row ${rowNum}: At least 2 options are required.`);
          }

          if (qTypeRaw !== "Single Correct" && qTypeRaw !== "Multiple Correct") {
            errorsList.push(`Row ${rowNum}: Question Type must be exactly 'Single Correct' or 'Multiple Correct'. Got '${qTypeRaw}'.`);
          }

          let points = 1;
          if (pointsRaw !== undefined && pointsRaw !== null && String(pointsRaw).trim() !== "") {
            const parsedPoints = Number(pointsRaw);
            if (isNaN(parsedPoints) || parsedPoints < 0 || !Number.isInteger(parsedPoints)) {
              errorsList.push(`Row ${rowNum}: Points must be a non-negative whole number. Got '${pointsRaw}'.`);
            } else {
              points = parsedPoints;
            }
          }

          if (!correctAnsRaw) {
            errorsList.push(`Row ${rowNum}: Correct Answer is required.`);
          } else {
            // Split correct answer by commas to support multiple choices (e.g. A,C or B,D)
            const letters = correctAnsRaw.split(",").map(l => l.trim().toUpperCase()).filter(Boolean);
            
            if (qTypeRaw === "Single Correct" && letters.length !== 1) {
              errorsList.push(`Row ${rowNum}: For Single Correct questions, Correct Answer must be exactly one letter. Got '${correctAnsRaw}'.`);
            } else if (qTypeRaw === "Multiple Correct" && letters.length < 2) {
              errorsList.push(`Row ${rowNum}: For Multiple Correct questions, Correct Answer must contain 2+ comma-separated valid letters. Got '${correctAnsRaw}'.`);
            }

            const invalidLetters = letters.filter(l => !["A", "B", "C", "D", "E"].includes(l));
            if (invalidLetters.length > 0) {
              errorsList.push(`Row ${rowNum}: Correct Answer contains invalid option letters: ${invalidLetters.join(", ")}.`);
            } else {
              const emptyOptionLetters = letters.filter(l => !optionsMap[l]);
              if (emptyOptionLetters.length > 0) {
                errorsList.push(`Row ${rowNum}: Correct Answer references empty option(s): ${emptyOptionLetters.join(", ")}.`);
              }
            }

            if (errorsList.length === 0) {
              const correctAnswers = letters.map(l => optionsMap[l]);
              const correct_answer_str = correctAnswers.join(", ");

              parsedQuestionsList.push({
                title: qText,
                options: optionsList,
                correct_answer: correct_answer_str,
                question_type: qTypeRaw,
                points,
                explanation,
              });
            }
          }
        });

        if (errorsList.length > 0) {
          setExcelParsingErrors(errorsList);
          setExcelValidated(false);
          setExcelQuestions([]);
        } else {
          setExcelParsingErrors([]);
          setExcelValidated(true);
          setExcelQuestions(parsedQuestionsList);
          toast.success("Excel template validation successful!");
        }
      } catch (err: any) {
        setExcelParsingErrors([err.message || "Failed to parse file."]);
        setExcelValidated(false);
        setExcelQuestions([]);
      }
    };
    reader.readAsArrayBuffer(excelFile);
  };

  const handleImportExcelQuestions = async () => {
    if (!excelValidated || excelQuestions.length === 0) {
      toast.error("Please validate the Excel template successfully first.");
      return;
    }

    setSaving(true);
    try {
      const questionsPayload = excelQuestions.map((q, idx) => ({
        session_id: sessionId,
        type: "quiz" as const,
        title: q.title,
        options: q.options,
        correct_answer: q.correct_answer,
        order_index: questions.length + idx,
        points: q.points,
        explanation: q.explanation,
        question_type: q.question_type,
      }));

      const { error } = await supabase.from("questions").insert(questionsPayload);
      if (error) throw error;

      toast.success(`${excelQuestions.length} questions imported successfully!`);
      
      setExcelFile(null);
      setExcelParsingErrors([]);
      setExcelValidated(false);
      setExcelQuestions([]);
      setOpen(false);
      onReload();
    } catch (err: any) {
      toast.error(err.message || "Failed to import questions.");
    } finally {
      setSaving(false);
    }
  };

  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // Calculate currently live question IDs from database status
  const liveQuestionIds = useMemo(() => {
    if (session.status !== "live") return [];
    if (session.all_active) return questions.map(q => q.id);
    const ids = new Set<string>();
    if (currentId) ids.add(currentId);
    activeQuestionIds.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [session.status, session.all_active, currentId, activeQuestionIds, questions]);

  // Keep checkboxes in sync with live status from the database
  useEffect(() => {
    setCheckedIds(liveQuestionIds);
  }, [liveQuestionIds]);

  const handleActivateSelected = async () => {
    try {
      const patch: any = {
        all_active: false,
        current_question_id: checkedIds.length > 0 ? checkedIds[0] : null,
        active_question_ids: checkedIds,
      };
      if (session.status !== "live" && checkedIds.length > 0) {
        patch.status = "live";
      }
      await updateSession(patch);
      toast.success("Selected question(s) activated");
    } catch (e: any) {
      toast.error(e.message || "Failed to activate selected questions");
    }
  };

  const handleRetakeSelected = () => {
    if (checkedIds.length === 0) {
      toast.error("Please select at least one question to retake");
      return;
    }
    setIsRetakeConfirmOpen(true);
  };

  const confirmRetakeSelected = async () => {
    setIsRetakeConfirmOpen(false);
    try {
      const { error } = await supabase
        .from("responses")
        .delete()
        .in("question_id", checkedIds);

      if (error) throw error;

      // Touch session to broadcast a realtime update to all student clients
      await supabase
        .from("sessions")
        .update({ status: session.status })
        .eq("id", sessionId);

      toast.success("Selected question(s) reset. Students can now retake them!");
      onReload();
    } catch (e: any) {
      toast.error(e.message || "Failed to reset selected questions");
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.uid}/${crypto.randomUUID()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('question-images')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let image_url = null;
      if (imageFile) {
        image_url = await uploadImage(imageFile);
      }

      const options = type === "wordcloud"
        ? []
        : optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
      
      const { error } = await supabase.from("questions").insert({
        session_id: sessionId,
        type,
        title,
        options,
        correct_answer: type === "quiz" ? correct : null,
        question_type: type === "quiz" ? questionType : "Single Correct",
        order_index: questions.length,
        image_url,
      });

      if (error) throw error;
      
      toast.success("Question added");
      setOpen(false); 
      setTitle(""); 
      setOptionsText(""); 
      setCorrect("");
      setQuestionType("Single Correct");
      setImageFile(null);
    } catch (error: any) {
      console.error("Create question error:", error);
      toast.error(error.message || "Failed to create question");
    } finally {
      setSaving(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editType, setEditType] = useState<QType>("poll");
  const [editTitle, setEditTitle] = useState("");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<string>("Single Correct");
  const parsedEditOptions = useMemo(() => {
    return editOptionsText.split("\n").map((o) => o.trim()).filter(Boolean);
  }, [editOptionsText]);
  const [editCorrect, setEditCorrect] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (q: Question) => {
    setEditingQuestion(q);
    setEditType(q.type);
    setEditTitle(q.title);
    setEditOptionsText(q.options?.join("\n") ?? "");
    setEditCorrect(q.correct_answer ?? "");
    setEditQuestionType(q.question_type ?? "Single Correct");
    setEditImageUrl(q.image_url ?? null);
    setEditImageFile(null);
    setRemoveExistingImage(false);
    setEditOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setEditSaving(true);
    try {
      let finalImageUrl = editImageUrl;
      if (removeExistingImage) {
        finalImageUrl = null;
      }
      if (editImageFile) {
        finalImageUrl = await uploadImage(editImageFile);
      }

      const options = editType === "wordcloud"
        ? []
        : editOptionsText.split("\n").map((o) => o.trim()).filter(Boolean);

      const { error } = await supabase
        .from("questions")
        .update({
          type: editType,
          title: editTitle,
          options,
          correct_answer: editType === "quiz" ? editCorrect : null,
          question_type: editType === "quiz" ? editQuestionType : "Single Correct",
          image_url: finalImageUrl,
        })
        .eq("id", editingQuestion.id);

      if (error) throw error;

      toast.success("Question updated");
      setEditOpen(false);
      onReload();
    } catch (error: any) {
      console.error("Edit question error:", error);
      toast.error(error.message || "Failed to update question");
    } finally {
      setEditSaving(false);
    }
  };

  const remove = (id: string) => {
    setDeleteQuestionId(id);
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteQuestionId) return;
    try {
      const { error } = await supabase.from("questions").delete().eq("id", deleteQuestionId);
      if (error) throw error;
      toast.success("Question deleted successfully");
      onReload();
    } catch (err: any) {
      console.error("Delete question error:", err);
      toast.error(err.message || "Failed to delete question");
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const [uploadingBanner, setUploadingBanner] = useState(false);

  const handleSessionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const url = await uploadImage(file);
      const { error } = await supabase.from("sessions").update({ image_url: url }).eq("id", sessionId);
      if (error) throw error;
      toast.success("Session banner uploaded");
      onReload();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveSessionImage = async () => {
    try {
      const { error } = await supabase.from("sessions").update({ image_url: null }).eq("id", sessionId);
      if (error) throw error;
      toast.success("Session banner removed");
      onReload();
    } catch (err: any) {
      toast.error(err.message || "Remove failed");
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Questions</h2>
        <div className="flex items-center gap-2">
          {/* Session Banner Image Upload Button */}
          <div className="relative">
            <input
              type="file"
              id="session-banner-upload"
              accept="image/*"
              className="hidden"
              onChange={handleSessionImageUpload}
              disabled={uploadingBanner}
            />
            <Button
              size="sm"
              variant="outline"
              asChild
              disabled={uploadingBanner}
              className="cursor-pointer"
            >
              <label htmlFor="session-banner-upload" className="flex items-center gap-2 m-0 cursor-pointer">
                <Upload className="h-4 w-4" />
                {uploadingBanner ? "Uploading..." : "Upload Banner"}
              </label>
            </Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-bg"><Plus className="mr-2 h-4 w-4" /> Add</Button>
            </DialogTrigger>
          <DialogContent className="max-w-md sm:max-w-xl transition-all duration-300">
            <DialogHeader><DialogTitle>New Question</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {/* AI Question Generator Card inside Add Question Dialog */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shadow-sm">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-primary">
                    <Sparkles className="h-4 w-4 text-primary animate-pulse" /> AI Question Generator
                  </h3>
                  <p className="text-xs text-muted-foreground">Generate multiple questions automatically from a document.</p>
                  <p className="text-[10px] text-amber-500/80 font-medium flex items-center gap-1">
                    <span>⚠️ AI can make mistakes; please verify questions.</span>
                  </p>
                </div>
                <AIGenerateDialog
                  sessionId={sessionId}
                  questionsCount={questions.length}
                  onReload={() => {
                    onReload();
                    setOpen(false);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => {
                  setType(v as QType);
                  // Reset Excel states when type changes
                  setExcelFile(null);
                  setExcelParsingErrors([]);
                  setExcelValidated(false);
                  setExcelQuestions([]);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poll">Poll (MCQ)</SelectItem>
                    <SelectItem value="wordcloud">Word Cloud</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {type !== "quiz" ? (
                <form onSubmit={handleCreate} className="space-y-4">
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
                  <div className="space-y-2">
                    <Label>Question Image (Optional)</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        className="cursor-pointer"
                      />
                      {imageFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setImageFile(null)}
                          className="text-destructive"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <Button type="submit" disabled={saving} className="w-full gradient-bg">
                    {saving ? "Saving..." : "Create question"}
                  </Button>
                </form>
              ) : (
                <Tabs defaultValue="manual" className="w-full">
                  <TabsList className="grid grid-cols-2 p-0.5 bg-muted rounded-lg border">
                    <TabsTrigger value="manual" className="text-xs font-semibold py-1.5">Add Manually</TabsTrigger>
                    <TabsTrigger value="excel" className="text-xs font-semibold py-1.5">Upload Excel</TabsTrigger>
                  </TabsList>

                  <TabsContent value="manual" className="space-y-4 mt-4">
                    <form onSubmit={handleCreate} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Question</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="What is..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Options (one per line)</Label>
                        <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} required placeholder={"Option A\nOption B\nOption C"} />
                      </div>
                      <div className="space-y-2">
                        <Label>Question Type</Label>
                        <select
                          value={questionType}
                          onChange={(e) => {
                            setQuestionType(e.target.value);
                            setCorrect("");
                          }}
                          className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="Single Correct">Single Correct</option>
                          <option value="Multiple Correct">Multiple Correct</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>Correct Answer(s)</Label>
                        {parsedOptions.length === 0 ? (
                          <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center bg-card/25">
                            Add options above first, then select the correct answer here.
                          </div>
                        ) : questionType === "Multiple Correct" ? (
                          <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/10 max-h-40 overflow-y-auto">
                            {parsedOptions.map((opt) => {
                              const selectedList = correct.split(",").map(s => s.trim()).filter(Boolean);
                              const isChecked = selectedList.includes(opt);
                              return (
                                <label key={opt} className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-0.5 hover:text-primary transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      let nextList = [...selectedList];
                                      if (e.target.checked) { nextList.push(opt); }
                                      else { nextList = nextList.filter(s => s !== opt); }
                                      setCorrect(nextList.join(", "));
                                    }}
                                    className="rounded border-border text-primary h-4 w-4"
                                  />
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <select
                            value={correct}
                            onChange={(e) => setCorrect(e.target.value)}
                            required
                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Select correct option</option>
                            {parsedOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Question Image (Optional)</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                            className="cursor-pointer"
                          />
                          {imageFile && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setImageFile(null)}
                              className="text-destructive"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                      <Button type="submit" disabled={saving} className="w-full gradient-bg">
                        {saving ? "Saving..." : "Create question"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="excel" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-primary/20 bg-primary/5 gap-3">
                        <div className="space-y-0.5">
                          <h4 className="font-semibold text-xs flex items-center gap-1">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                            Import Template
                          </h4>
                          <p className="text-[10px] text-muted-foreground">
                            Use our Excel sheet template to import multiple quiz questions.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" type="button" onClick={handleDownloadTemplate} className="gap-1 text-xs shrink-0 h-8 font-bold">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="excel-upload-file">Select Spreadsheet (.xlsx)</Label>
                        <div className="flex gap-2">
                          <Input 
                            id="excel-upload-file" 
                            type="file" 
                            accept=".xlsx" 
                            onChange={(e) => {
                              setExcelFile(e.target.files?.[0] ?? null);
                              setExcelValidated(false);
                              setExcelParsingErrors([]);
                              setExcelQuestions([]);
                            }}
                            className="text-xs file:bg-primary file:text-primary-foreground file:border-0 file:rounded file:px-2.5 file:py-0.5 hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                          />
                          {excelFile && (
                            <Button 
                              type="button" 
                              variant="secondary" 
                              onClick={handleValidateExcel}
                              className="font-bold border text-xs h-9 shrink-0 shadow-sm"
                            >
                              Validate
                            </Button>
                          )}
                        </div>
                      </div>

                      {excelParsingErrors.length > 0 && (
                        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 space-y-1.5">
                          <h5 className="font-bold text-destructive text-xs flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" />
                            Validation Errors ({excelParsingErrors.length})
                          </h5>
                          <ul className="text-[10px] text-destructive/95 space-y-1 max-h-28 overflow-y-auto pr-1">
                            {excelParsingErrors.map((err, i) => (
                              <li key={i} className="list-disc ml-3">{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {excelValidated && excelQuestions.length > 0 && (
                        <div className="space-y-2 border rounded-lg p-2.5 bg-card">
                          <div className="flex items-center justify-between">
                            <h5 className="font-bold text-xs flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                              Parsed Questions Preview
                            </h5>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">
                              {excelQuestions.length} Questions Validated
                            </span>
                          </div>
                          
                          <div className="overflow-x-auto border rounded max-h-48">
                            <table className="min-w-full divide-y divide-border text-[10px]">
                              <thead className="bg-muted text-muted-foreground sticky top-0">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-bold w-12">No.</th>
                                  <th className="px-2 py-1.5 text-left font-bold">Question Text</th>
                                  <th className="px-2 py-1.5 text-left font-bold">Type</th>
                                  <th className="px-2 py-1.5 text-left font-bold w-12">Points</th>
                                  <th className="px-2 py-1.5 text-left font-bold">Correct</th>
                                  <th className="px-2 py-1.5 text-left font-bold">Explanation</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-background">
                                {excelQuestions.map((q, idx) => (
                                  <tr key={idx} className="hover:bg-accent/40 transition-colors">
                                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{idx + 1}</td>
                                    <td className="px-2 py-1.5 font-medium truncate max-w-[120px]" title={q.title}>{q.title}</td>
                                    <td className="px-2 py-1.5 text-muted-foreground">{q.question_type}</td>
                                    <td className="px-2 py-1.5 font-mono">{q.points}</td>
                                    <td className="px-2 py-1.5 font-semibold text-primary">{q.correct_answer}</td>
                                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]" title={q.explanation}>{q.explanation || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <Button 
                        type="button"
                        onClick={handleImportExcelQuestions}
                        disabled={saving || !excelValidated}
                        className="w-full gradient-bg font-bold shadow-md shadow-primary/20"
                      >
                        {saving ? "Importing..." : `Import ${excelQuestions.length || ""} Questions`}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Question</DialogTitle></DialogHeader>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as QType)}>
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
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required placeholder="What is..." />
              </div>
              {editType !== "wordcloud" && (
                <div className="space-y-2">
                  <Label>Options (one per line)</Label>
                  <Textarea value={editOptionsText} onChange={(e) => setEditOptionsText(e.target.value)} rows={4} required placeholder={"Option A\nOption B\nOption C"} />
                </div>
              )}
              {editType === "quiz" && (
                <>
                  <div className="space-y-2">
                    <Label>Question Type</Label>
                    <select
                      value={editQuestionType}
                      onChange={(e) => {
                        setEditQuestionType(e.target.value);
                        setEditCorrect("");
                      }}
                      className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Single Correct">Single Correct</option>
                      <option value="Multiple Correct">Multiple Correct</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Correct Answer(s)</Label>
                    {parsedEditOptions.length === 0 ? (
                      <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-3 text-center bg-card/25">
                        Add options above first, then select the correct answer here.
                      </div>
                    ) : editQuestionType === "Multiple Correct" ? (
                      <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/10 max-h-40 overflow-y-auto">
                        {parsedEditOptions.map((opt) => {
                          const selectedList = editCorrect.split(",").map(s => s.trim()).filter(Boolean);
                          const isChecked = selectedList.includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2.5 text-sm cursor-pointer select-none py-0.5 hover:text-primary transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  let nextList = [...selectedList];
                                  if (e.target.checked) { nextList.push(opt); }
                                  else { nextList = nextList.filter(s => s !== opt); }
                                  setEditCorrect(nextList.join(", "));
                                }}
                                className="rounded border-border text-primary h-4 w-4"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <select
                        value={editCorrect}
                        onChange={(e) => setEditCorrect(e.target.value)}
                        required
                        className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select correct option</option>
                        {parsedEditOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}
              
              {editImageUrl && !removeExistingImage && (
                <div className="space-y-2">
                  <Label>Current Image</Label>
                  <div className="relative rounded-lg border border-border overflow-hidden bg-muted max-h-32 flex items-center justify-center group shadow-sm">
                    <img src={editImageUrl} alt="Question visual" className="max-h-32 object-contain" />
                    <button
                      type="button"
                      onClick={() => setRemoveExistingImage(true)}
                      className="absolute top-2 right-2 rounded bg-black/70 p-1 text-xs text-destructive hover:bg-destructive hover:text-white transition"
                    >
                      Remove Image
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>{editImageUrl && !removeExistingImage ? "Replace Image (Optional)" : "Question Image (Optional)"}</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                    className="cursor-pointer"
                  />
                  {editImageFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditImageFile(null)}
                      className="text-destructive"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <Button type="submit" disabled={editSaving} className="w-full gradient-bg">
                {editSaving ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Preview of current Session-wide Banner Image */}
      {session.image_url && (
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted max-h-48 flex items-center justify-center group shadow-sm">
          <img src={session.image_url} alt="Session banner preview" className="w-full h-full object-contain max-h-48" />
          <button
            onClick={handleRemoveSessionImage}
            className="absolute top-2 right-2 rounded-lg bg-black/75 p-1.5 text-white opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
            title="Remove Banner"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {/* ── ONE-CLICK Activate / Deactivate Selected / All ── */}
        {questions.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleActivateSelected}
                disabled={checkedIds.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Activate Selected {checkedIds.length > 0 && `(${checkedIds.length})`}
              </Button>
              <Button
                type="button"
                onClick={handleRetakeSelected}
                disabled={checkedIds.length === 0}
                variant="outline"
                className="flex items-center justify-center gap-1.5 rounded-xl border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-500 font-semibold py-2.5 text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retake Selected {checkedIds.length > 0 && `(${checkedIds.length})`}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  try {
                    const allIds = questions.map(q => q.id);
                    const patch: any = { all_active: true, active_question_ids: allIds };
                    if (session.status !== "live") patch.status = "live";
                    await updateSession(patch);
                    toast.success("All questions activated");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to activate all questions");
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-medium py-2 text-xs transition-all active:scale-[0.98]"
              >
                <Play className="h-3.5 w-3.5" />
                Activate All
              </button>
              <button
                onClick={async () => {
                  try {
                    await updateSession({ all_active: false, current_question_id: null, active_question_ids: [] });
                    toast.success("All questions deactivated");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to deactivate questions");
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive font-medium py-2 text-xs transition-all active:scale-[0.98]"
              >
                <Square className="h-3.5 w-3.5" />
                Deactivate All
              </button>
            </div>
          </div>
        )}

        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No questions yet. Add polls, word clouds, or quiz questions to activate live.
          </div>
        )}
        {questions.map((q, i) => {
          const active = q.id === currentId;
          const isQuestionLive = activeQuestionIds.includes(q.id);
          const isLive = session.status === "live" && (active || isAllMode || isQuestionLive);

          return (
            <div 
              key={q.id} 
              onClick={() => {
                setCheckedIds(prev => 
                  prev.includes(q.id) 
                    ? prev.filter(id => id !== q.id) 
                    : [...prev, q.id]
                );
              }} 
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition shadow-sm cursor-pointer select-none", 
                isLive 
                  ? "border-primary/80 bg-primary/10 shadow-[0_0_12px_rgba(59,130,246,0.15)] ring-1 ring-primary/30" 
                  : "border-border bg-card/40 hover:bg-card/60"
              )}
            >
              {/* Custom Checkbox */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setCheckedIds(prev => 
                    prev.includes(q.id) 
                      ? prev.filter(id => id !== q.id) 
                      : [...prev, q.id]
                  );
                }} 
                className={cn(
                  "h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition shrink-0",
                  checkedIds.includes(q.id)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30 bg-transparent hover:border-primary/50"
                )}
              >
                {checkedIds.includes(q.id) && (
                  <svg className="h-3.5 w-3.5 fill-none stroke-current stroke-[3px]" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold transition-colors shrink-0",
                isLive ? "bg-primary text-primary-foreground" : "bg-accent"
              )}>{i + 1}</div>
              {q.image_url && (
                <div className="h-10 w-10 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
                  <img src={q.image_url} alt="Question preview" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{q.title}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  {q.type}
                  {q.image_url && (
                    <span className="flex items-center gap-0.5 text-primary text-[10px] lowercase font-normal">
                      <ImageIcon className="h-3 w-3" /> with image
                    </span>
                  )}
                  {isLive && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/20 border border-primary/40 px-2 py-0.5 text-[10px] text-primary font-semibold uppercase tracking-wide">
                      ● Live
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(q);
                }} 
                className="text-muted-foreground hover:text-foreground p-1" 
                title="Edit Question"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  remove(q.id);
                }} 
                className="text-muted-foreground hover:text-destructive p-1" 
                title="Delete Question"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <AlertDialog open={isRetakeConfirmOpen} onOpenChange={setIsRetakeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retake Questions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to let students retake the selected {checkedIds.length} question(s)? This will permanently delete their existing responses for these questions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRetakeSelected} className="bg-amber-500 hover:bg-amber-600 text-white">
              Retake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteQuestionId} onOpenChange={(open) => !open && setDeleteQuestionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this question? This will also delete all student responses to this question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteQuestion} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── AI Generate Dialog ──────────────────────────────────────────────────────

type AIStep = "upload" | "generating" | "preview";

function AIGenerateDialog({
  sessionId,
  questionsCount,
  onReload,
}: {
  sessionId: string;
  questionsCount: number;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AIStep>("upload");

  // Step 1 — upload state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(
    () => (import.meta as any).env?.VITE_NVIDIA_API_KEY ?? 
          (import.meta as any).env?.VITE_GOOGLE_AI_KEY ?? 
          (import.meta as any).env?.VITE_GROQ_API_KEY ?? 
          ""
  );
  const [numQuestions, setNumQuestions] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<AIQType[]>([
    "quiz",
    "poll",
    "wordcloud",
  ]);

  // Step 2/3 — results state
  const [generatedQuestions, setGeneratedQuestions] = useState<
    GeneratedQuestion[]
  >([]);
  const [savingAll, setSavingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleType = (t: AIQType) => {
    setSelectedTypes((prev) =>
      prev.includes(t)
        ? prev.length === 1
          ? prev // must keep at least one
          : prev.filter((x) => x !== t)
        : [...prev, t]
    );
  };

  const resetDialog = () => {
    setStep("upload");
    setDocFile(null);
    setGeneratedQuestions([]);
    setSavingAll(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) resetDialog();
  };

  // ── Step 1 → 2: Extract text & call AI ─────────────────────────────────────
  const handleGenerate = async () => {
    if (!docFile) {
      toast.error("Please select a document file.");
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error("Select at least one question type.");
      return;
    }

    setStep("generating");
    try {
      const text = await extractTextFromDocument(docFile);
      const questions = await generateQuestionsFromText({
        text,
        count: numQuestions,
        types: selectedTypes,
        apiKey: apiKey.trim(),
      });
      setGeneratedQuestions(questions);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate questions.");
      setStep("upload");
    }
  };

  // ── Step 3: Bulk save to Supabase ───────────────────────────────────────────
  const handleSaveAll = async () => {
    if (generatedQuestions.length === 0) return;
    setSavingAll(true);
    try {
      const rows = generatedQuestions.map((q, i) => ({
        session_id: sessionId,
        type: q.type as "quiz" | "poll" | "wordcloud",
        title: q.title,
        options: q.options as any,
        correct_answer: q.correct_answer,
        order_index: questionsCount + i,
      }));
      const { error } = await supabase.from("questions").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} questions added to session! 🎉`);
      onReload();
      handleOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save questions.");
    } finally {
      setSavingAll(false);
    }
  };

  const removeQuestion = (idx: number) => {
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (
    idx: number,
    patch: Partial<GeneratedQuestion>
  ) => {
    setGeneratedQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  };

  const TYPE_LABELS: Record<AIQType, string> = {
    quiz: "Quiz",
    poll: "Poll",
    wordcloud: "Word Cloud",
  };

  const TYPE_COLORS: Record<AIQType, string> = {
    quiz: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    poll: "text-blue-400 border-blue-500/40 bg-blue-500/10",
    wordcloud: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 transition-all animate-ai-pulse"
        >
          <Sparkles className="h-4 w-4" />
          AI Generate
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Questions from Document
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2 text-xs text-amber-500/90 mt-1 select-none">
          <span className="text-sm shrink-0">⚠️</span>
          <p className="leading-normal font-medium">
            <strong>Disclaimer:</strong> AI can make mistakes. Please verify facts, options, and correct answers before publishing questions to students.
          </p>
        </div>

        {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-5 mt-2">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload Document</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all",
                  docFile
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/30"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
                {docFile ? (
                  <>
                    <FileText className="h-10 w-10 text-primary" />
                    <div className="text-center">
                      <div className="font-medium text-sm">{docFile.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(docFile.size / 1024).toFixed(1)} KB · Click to change
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div className="text-center">
                      <div className="font-medium text-sm">
                        Click to upload a document
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PDF, DOCX, or TXT — max 5 MB
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Question Types */}
            <div className="space-y-2">
              <Label>Question Types to Generate</Label>
              <div className="flex gap-2 flex-wrap">
                {(["quiz", "poll", "wordcloud"] as AIQType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                      selectedTypes.includes(t)
                        ? TYPE_COLORS[t]
                        : "border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of Questions */}
            <div className="space-y-2">
              <Label>
                Number of Questions:{" "}
                <span className="font-bold text-primary">{numQuestions}</span>
              </Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">1</span>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground w-5">15</span>
              </div>
            </div>

             <Button
               onClick={handleGenerate}
               disabled={!docFile}
               className="w-full gradient-bg gap-2"
             >
               <Sparkles className="h-4 w-4" />
               Generate {numQuestions} Questions {apiKey.trim() ? "with AI" : "with Local Browser Fallback"}
             </Button>
          </div>
        )}

        {/* ── STEP 2: Generating ─────────────────────────────────────────── */}
        {step === "generating" && (
          <div className="flex flex-col items-center justify-center gap-6 py-16">
            <div className="relative">
              <div className="h-20 w-20 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary opacity-80" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <div className="font-semibold text-lg">
                AI is reading your document...
              </div>
              <div className="text-sm text-muted-foreground">
                Generating {numQuestions} questions using{" "}
                <span className="text-primary font-mono">
                  meta/llama-3.3-70b-instruct
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                This may take 10–30 seconds
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview ────────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {generatedQuestions.length} questions generated — review &
                edit before saving
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep("upload")}
                className="gap-1 text-xs"
              >
                ↩ Regenerate
              </Button>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {generatedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card/50 p-4 space-y-3 relative group"
                >
                  {/* Remove button */}
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                    title="Remove this question"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* Type badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        TYPE_COLORS[q.type]
                      )}
                    >
                      {TYPE_LABELS[q.type]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Question title */}
                  <div className="space-y-1">
                    <Label className="text-xs">Question</Label>
                    <Input
                      value={q.title}
                      onChange={(e) =>
                        updateQuestion(idx, { title: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>

                  {/* Options */}
                  {q.type !== "wordcloud" && q.options.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Options (one per line)</Label>
                      <Textarea
                        value={q.options.join("\n")}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            options: e.target.value
                              .split("\n")
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={q.options.length}
                        className="text-sm resize-none"
                      />
                    </div>
                  )}

                  {/* Correct answer for quiz */}
                  {q.type === "quiz" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-emerald-400">
                        ✓ Correct Answer
                      </Label>
                      <Input
                        value={q.correct_answer ?? ""}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            correct_answer: e.target.value,
                          })
                        }
                        className="text-sm border-emerald-500/30 focus:border-emerald-500/60"
                      />
                    </div>
                  )}
                </div>
              ))}

              {generatedQuestions.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  All questions removed. Click "Regenerate" to start over.
                </div>
              )}
            </div>

            <Button
              onClick={handleSaveAll}
              disabled={savingAll || generatedQuestions.length === 0}
              className="w-full gradient-bg gap-2"
            >
              {savingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add {generatedQuestions.length} Questions to Session
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const responsesWithImages = responses.filter(r => r.image_url);

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
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

      {responsesWithImages.length > 0 && (
        <div className="border-t border-border/50 pt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Student Uploaded Images ({responsesWithImages.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {responsesWithImages.map((r) => (
              <div key={r.id} className="relative rounded-lg border border-border overflow-hidden bg-muted group flex flex-col">
                <a href={r.image_url!} target="_blank" rel="noopener noreferrer" className="block relative aspect-video flex-1 bg-black flex items-center justify-center">
                  <img src={r.image_url!} alt="Student response upload" className="max-h-24 w-full object-contain" />
                </a>
                <div className="p-2 text-xs truncate border-t border-border bg-card">
                  <span className="font-semibold">{nameById.get(r.participant_id) || "Student"}</span>: {r.answer || "Uploaded image"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Student Responses Name List ── */}
      <div className="border-t border-border/50 pt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Student Answers ({responses.length})</div>
        {responses.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No answers submitted yet...</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {responses.map((r) => {
              const studentName = nameById.get(r.participant_id) || "Anonymous Student";
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-accent/20 px-4 py-2.5 text-sm transition hover:bg-accent/40"
                >
                  <span className="font-semibold text-foreground/90">{studentName}</span>
                  <span className="rounded-lg bg-background/50 border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground select-all">
                    {r.answer}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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

interface ExamIntegrityProctoringProps {
  session: Session;
  participants: Participant[];
  recentHeartbeats: Record<string, { timestamp: string; latency_ms: number; status: string }>;
  onSelectStudent: (student: Participant) => void;
}

function ExamIntegrityProctoring({
  session,
  participants,
  recentHeartbeats,
  onSelectStudent,
}: ExamIntegrityProctoringProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");

  // Helper to determine connection state
  const getConnectionState = (studentId: string) => {
    const hb = recentHeartbeats[studentId];
    if (!hb) return { state: "offline", latency: 0, lastSeen: "Never" };
    
    const elapsedMs = Date.now() - new Date(hb.timestamp).getTime();
    if (elapsedMs > 15000) {
      return { state: "offline", latency: 0, lastSeen: `${Math.round(elapsedMs / 1000)}s ago` };
    }
    
    return {
      state: hb.status === "unstable" ? "idle" : "online",
      latency: hb.latency_ms,
      lastSeen: "Just now",
    };
  };

  // Compute stats
  const totalStudents = participants.length;
  const avgRisk = totalStudents > 0 
    ? Math.round(participants.reduce((acc, p) => acc + (p.risk_score || 0), 0) / totalStudents) 
    : 0;
  
  const highRiskCount = participants.filter(p => p.risk_level === "high").length;
  const offlineCount = participants.filter(p => getConnectionState(p.id).state === "offline").length;
  const onlineCount = totalStudents - offlineCount;

  // Filter list
  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const conn = getConnectionState(p.id);
      
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRisk = riskFilter === "all" || p.risk_level === riskFilter;
      const matchesStatus = statusFilter === "all" 
        || (statusFilter === "online" && conn.state !== "offline")
        || (statusFilter === "offline" && conn.state === "offline");

      return matchesSearch && matchesRisk && matchesStatus;
    });
  }, [participants, searchQuery, riskFilter, statusFilter, recentHeartbeats]);

  return (
    <div className="space-y-6 text-left">
      {/* Dynamic Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Total Proctoring</span>
          <div className="text-2xl font-extrabold text-foreground mt-1">{totalStudents}</div>
          <span className="text-[10px] text-muted-foreground">Students joined</span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Avg Session Risk</span>
          <div className={cn(
            "text-2xl font-extrabold mt-1",
            avgRisk >= 60 ? "text-rose-500" : avgRisk >= 25 ? "text-amber-500" : "text-emerald-500"
          )}>{avgRisk} pts</div>
          <span className="text-[10px] text-muted-foreground">Weighted session average</span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">High Risk Alerts</span>
          <div className={cn(
            "text-2xl font-extrabold mt-1",
            highRiskCount > 0 ? "text-rose-500 animate-pulse" : "text-foreground"
          )}>{highRiskCount}</div>
          <span className="text-[10px] text-rose-500/80 font-bold">{highRiskCount > 0 ? "⚠️ Inspect immediately" : "All clear"}</span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Connection Status</span>
          <div className="text-2xl font-extrabold text-foreground mt-1 flex items-center gap-2">
            <span className="text-emerald-500 font-bold">{onlineCount}</span>
            <span className="text-muted-foreground text-sm font-normal">/</span>
            <span className="text-rose-500 font-bold">{offlineCount}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Online vs Offline</span>
        </div>
      </div>

      {/* Grid Controller Header - Search & Filter */}
      <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-background/50 border-border h-10 text-sm"
          />
          <div className="flex gap-2">
            <Select value={riskFilter} onValueChange={(val: any) => setRiskFilter(val)}>
              <SelectTrigger className="w-[130px] bg-background/50 border-border text-xs h-10">
                <SelectValue placeholder="Risk Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-[130px] bg-background/50 border-border text-xs h-10">
                <SelectValue placeholder="Connection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Real-time Grid List */}
        <div className="border border-border/40 rounded-xl overflow-hidden bg-background/25">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/40 border-b border-border/40 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4 text-left">Student Name</div>
            <div className="col-span-2 text-center">Connection</div>
            <div className="col-span-2 text-center">Latency</div>
            <div className="col-span-2 text-center">Risk Score</div>
            <div className="col-span-2 text-right">Proctor Audit</div>
          </div>

          <div className="divide-y divide-border/30">
            {filteredParticipants.map((p) => {
              const conn = getConnectionState(p.id);
              
              return (
                <div key={p.id} className="grid grid-cols-12 gap-4 px-4 py-3 text-xs items-center hover:bg-muted/15 transition-colors">
                  <div className="col-span-4 font-bold text-foreground/90 truncate text-left">{p.name}</div>
                  
                  <div className="col-span-2 flex justify-center">
                    <span className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                      conn.state === "online" 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                        : conn.state === "idle"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                    )}>
                      <span className={cn("h-1 w-1 rounded-full", conn.state === "online" ? "bg-emerald-500" : conn.state === "idle" ? "bg-amber-500 animate-pulse" : "bg-rose-500")} />
                      {conn.state.toUpperCase()}
                    </span>
                  </div>

                  <div className="col-span-2 text-center font-mono text-[11px] text-muted-foreground">
                    {conn.state !== "offline" ? `${conn.latency} ms` : `--`}
                  </div>

                  <div className="col-span-2 text-center">
                    <span className={cn(
                      "font-extrabold font-mono text-[11px] px-2 py-0.5 rounded-full border",
                      p.risk_level === "high"
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                        : p.risk_level === "medium"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    )}>
                      {Math.round(p.risk_score ?? 0)} pts
                    </span>
                  </div>

                  <div className="col-span-2 text-right">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => onSelectStudent(p)}
                      className="h-7 px-2.5 text-[10px] rounded-lg border-border hover:bg-primary hover:text-primary-foreground font-bold flex items-center gap-1 ml-auto shadow-sm"
                    >
                      <FileText className="h-3 w-3" /> Audit Log
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredParticipants.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground italic bg-background/5">
                No students match the current proctoring filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}