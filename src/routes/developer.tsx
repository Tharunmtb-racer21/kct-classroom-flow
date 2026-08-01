import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Flame,
  Globe,
  HardDrive,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquare,
  PieChart,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { auth } from "@/lib/firebase";
import { autoDraftStaleSessions } from "@/lib/session-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type SessionRow = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  creator_id: string;
  created_at: string;
  current_question_id?: string | null;
  expires_at?: string | null;
};

type QuestionRow = {
  id: string;
  session_id: string;
  type: "wordcloud" | "poll" | "quiz";
  title: string;
  created_at?: string;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  name: string;
  joined_at: string;
};

type ResponseRow = {
  id: string;
  question_id: string;
  participant_id: string;
  answer: string;
  created_at: string;
  image_url?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at?: string;
};

type AuditLogItem = {
  index: number;
  id: string;
  tag: "AUTH" | "SESSION" | "RESPONSE" | "QUESTION" | "SYSTEM";
  msg: string;
  timestamp: string;
  isoDate: string;
  type: "info" | "success" | "warn" | "error";
};

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer Telemetry & System Analytics · KCT PULSE" },
      { name: "description", content: "Developer system monitor, Firebase/Supabase analytics, and live telemetry log suite." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeveloperDashboard,
});

function DeveloperDashboard() {
  const [passkey, setPasskey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setIsAuthenticated(localStorage.getItem("kct_dev_auth") === "true");
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [timeframe, setTimeframe] = useState<"1D" | "7D" | "30D" | "ALL">("ALL");
  const [logFilterTag, setLogFilterTag] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<SessionRow | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Passkey Login Handler
  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkey.trim() === "Pulse_2026") {
      setIsAuthenticated(true);
      setErrorMsg("");
      localStorage.setItem("kct_dev_auth", "true");
    } else {
      setErrorMsg("Access Denied: Incorrect developer password.");
    }
  };

  const handleLockDeveloper = () => {
    localStorage.removeItem("kct_dev_auth");
    setIsAuthenticated(false);
    setPasskey("");
  };

  const addAuditLog = (
    msg: string,
    tag: "AUTH" | "SESSION" | "RESPONSE" | "QUESTION" | "SYSTEM" = "SYSTEM",
    type: "info" | "success" | "warn" | "error" = "info",
    isoDate?: string
  ) => {
    const logIso = isoDate || new Date().toISOString();
    setAuditLogs((prev) => {
      const nextIdx = prev.length + 1;
      return [
        {
          index: nextIdx,
          id: `LOG-${String(nextIdx).padStart(4, "0")}`,
          tag,
          msg,
          timestamp: new Date(logIso).toLocaleString(),
          isoDate: logIso,
          type,
        },
        ...prev,
      ];
    });
  };

  // Load All System Analytics & Records
  const loadData = async () => {
    setLoading(true);
    const startPing = performance.now();
    try {
      // 1. Fetch Sessions
      const { data: sData } = await supabase
        .from("sessions")
        .select("id,title,code,status,creator_id,created_at,current_question_id,expires_at")
        .order("created_at", { ascending: false });

      // 2. Fetch Questions
      const { data: qData } = await supabase
        .from("questions")
        .select("id,session_id,type,title,created_at")
        .order("created_at", { ascending: false });

      // 3. Fetch Participants
      const { data: pData } = await supabase
        .from("participants")
        .select("id,session_id,name,joined_at")
        .order("joined_at", { ascending: false });

      // 4. Fetch Responses
      const { data: rData } = await supabase
        .from("responses")
        .select("id,question_id,participant_id,answer,created_at,image_url")
        .order("created_at", { ascending: false });

      // 5. Fetch Profiles
      const { data: profData } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url,created_at")
        .order("created_at", { ascending: false });

      const pingEnd = performance.now();
      setApiLatencyMs(Math.round(pingEnd - startPing));

      const sRows = (sData as SessionRow[]) || [];
      const qRows = (qData as QuestionRow[]) || [];
      const pRows = (pData as ParticipantRow[]) || [];
      const rRows = (rData as ResponseRow[]) || [];
      const profRows = (profData as ProfileRow[]) || [];

      setSessions(sRows);
      setQuestions(qRows);
      setParticipants(pRows);
      setResponses(rRows);
      setProfiles(profRows);

      // Re-populate audit log history
      const initialLogs: AuditLogItem[] = [];
      let counter = 1;

      sRows.slice(0, 15).forEach((s) => {
        const cId = (s.creator_id || "anonymous").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "SESSION",
          msg: `Session '${s.title || "Untitled"}' (${s.code || "----"}) created by creator ${cId}... [Status: ${s.status}]`,
          timestamp: s.created_at ? new Date(s.created_at).toLocaleString() : new Date().toLocaleString(),
          isoDate: s.created_at || new Date().toISOString(),
          type: s.status === "live" ? "success" : "info",
        });
      });

      pRows.slice(0, 15).forEach((p) => {
        const sId = (p.session_id || "unknown").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "AUTH",
          msg: `Student participant '${p.name || "Student"}' joined session ID ${sId}...`,
          timestamp: p.joined_at ? new Date(p.joined_at).toLocaleString() : new Date().toLocaleString(),
          isoDate: p.joined_at || new Date().toISOString(),
          type: "info",
        });
      });

      rRows.slice(0, 15).forEach((r) => {
        const qId = (r.question_id || "unknown").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "RESPONSE",
          msg: `Student response recorded for question ${qId}... -> Answer: '${r.answer || ""}'`,
          timestamp: r.created_at ? new Date(r.created_at).toLocaleString() : new Date().toLocaleString(),
          isoDate: r.created_at || new Date().toISOString(),
          type: "success",
        });
      });

      initialLogs.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
      setAuditLogs(initialLogs);

    } catch (err: any) {
      console.error("Developer dashboard error:", err);
      addAuditLog(`Data telemetry error: ${err.message}`, "SYSTEM", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRunCleanup = async () => {
    await autoDraftStaleSessions();
    addAuditLog("Manual stale sessions cleanup executed (Sessions active > 1h auto-drafted)", "SYSTEM", "warn");
    await loadData();
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();

    const sysChannel = supabase
      .channel("dev-telemetry-suite")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        const s = payload.new as SessionRow;
        addAuditLog(`Session state updated: '${s?.title || payload.old?.id}' -> [Status: ${s?.status}]`, "SESSION", "success");
        loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants" }, (payload) => {
        const p = payload.new as ParticipantRow;
        addAuditLog(`Live Student '${p?.name || "Student"}' joined session`, "AUTH", "info");
        setParticipants((prev) => [p, ...prev]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses" }, (payload) => {
        const r = payload.new as ResponseRow;
        addAuditLog(`New response received: '${r?.answer || ""}'`, "RESPONSE", "success");
        setResponses((prev) => [r, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sysChannel);
    };
  }, [isAuthenticated]);

  // Map Profile Helper
  const getFacultyInfo = (creatorId?: string | null) => {
    if (!creatorId) {
      return { name: "Faculty (Unknown)", email: "unknown@kct.ac.in" };
    }
    const prof = profiles.find((p) => p.id === creatorId);
    if (prof && (prof.full_name || prof.email)) {
      return { name: prof.full_name || prof.email, email: prof.email || "" };
    }
    const currentFirebaseUser = auth.currentUser;
    if (currentFirebaseUser && currentFirebaseUser.uid === creatorId) {
      const email = currentFirebaseUser.email || "";
      const derivedName = currentFirebaseUser.displayName || email.split("@")[0].replace(/[._-]/g, " ");
      const formatted = derivedName ? derivedName.charAt(0).toUpperCase() + derivedName.slice(1) : "Faculty";
      return { name: formatted, email };
    }
    return { name: `Prof. ${creatorId.slice(0, 6).toUpperCase()}`, email: `faculty_${creatorId.slice(0, 5)}@kct.ac.in` };
  };

  // Map Session Participants Helper
  const getSessionParticipants = (sessionId: string) => {
    return participants.filter((p) => p.session_id === sessionId);
  };

  // Filter Data by Timeframe (1D, 7D, 30D, ALL)
  const filterByTimeframe = <T extends { created_at?: string; joined_at?: string }>(items: T[]) => {
    if (timeframe === "ALL") return items;
    const now = Date.now();
    const limits: Record<string, number> = {
      "1D": 24 * 60 * 60 * 1000,
      "7D": 7 * 24 * 60 * 60 * 1000,
      "30D": 30 * 24 * 60 * 60 * 1000,
    };
    const maxDiff = limits[timeframe] || Infinity;

    return items.filter((item) => {
      const dateStr = item.created_at || item.joined_at;
      if (!dateStr) return true;
      return now - new Date(dateStr).getTime() <= maxDiff;
    });
  };

  const filteredSessionsByTime = useMemo(() => filterByTimeframe(sessions), [sessions, timeframe]);
  const filteredQuestionsByTime = useMemo(() => filterByTimeframe(questions), [questions, timeframe]);
  const filteredParticipantsByTime = useMemo(() => filterByTimeframe(participants), [participants, timeframe]);
  const filteredResponsesByTime = useMemo(() => filterByTimeframe(responses), [responses, timeframe]);

  // Metrics Computations
  const liveSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "live").length, [filteredSessionsByTime]);
  const draftSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "draft").length, [filteredSessionsByTime]);
  const endedSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "ended").length, [filteredSessionsByTime]);

  const pollQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "poll").length, [filteredQuestionsByTime]);
  const wordcloudQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "wordcloud").length, [filteredQuestionsByTime]);
  const quizQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "quiz").length, [filteredQuestionsByTime]);

  // Unique Faculty Creators with Total Students Taught
  const uniqueCreators = useMemo(() => {
    const map = new Map<string, { creator_id: string; profile?: ProfileRow; count: number; totalStudents: number; lastActive: string }>();
    sessions.forEach((s) => {
      const cId = s.creator_id || "anonymous";
      const sessParts = participants.filter((p) => p.session_id === s.id).length;
      const existing = map.get(cId) || {
        creator_id: cId,
        profile: profiles.find((p) => p.id === cId),
        count: 0,
        totalStudents: 0,
        lastActive: s.created_at || new Date().toISOString(),
      };
      existing.count++;
      existing.totalStudents += sessParts;
      if (s.created_at && new Date(s.created_at) > new Date(existing.lastActive)) {
        existing.lastActive = s.created_at;
      }
      map.set(cId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [sessions, profiles, participants]);

  // Filtered Sessions for Search Input
  const searchedSessions = useMemo(() => {
    if (!searchQuery.trim()) return filteredSessionsByTime;
    const q = searchQuery.toLowerCase();
    return filteredSessionsByTime.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.creator_id.toLowerCase().includes(q) ||
        getFacultyInfo(s.creator_id).name.toLowerCase().includes(q)
    );
  }, [filteredSessionsByTime, searchQuery, profiles]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (logFilterTag !== "ALL" && log.tag !== logFilterTag) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return log.msg.toLowerCase().includes(q) || log.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [auditLogs, logFilterTag, searchQuery]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">Initializing Developer Telemetry Portal...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground relative selection:bg-primary/20">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle variant="ghost" />
        </div>
        <div className="w-full max-w-md glass rounded-3xl p-8 shadow-2xl border border-border/60 text-center space-y-6">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 border border-primary/30 text-primary mx-auto shadow-inner">
            <ShieldCheck className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">KCT PULSE Developer Portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">Internal system monitoring & live telemetry dashboard.</p>
          </div>

          <form onSubmit={handleAuthenticate} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Developer Password Required
              </label>
              <Input
                type="password"
                placeholder="Enter Developer Password"
                value={passkey}
                onChange={(e) => {
                  setPasskey(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                className="h-11 bg-card/50 border-border text-center font-mono tracking-widest"
              />
              {errorMsg && (
                <p className="text-xs font-semibold text-destructive mt-1 text-center animate-shake">
                  {errorMsg}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full h-11 gradient-bg font-semibold gap-2">
              <Key className="h-4 w-4" /> Authenticate Developer Access
            </Button>
          </form>

          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5 text-emerald-500" /> Authorized Admin & Developer Use Only
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Top Telemetry Bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-xl px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-md">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> DEVELOPER TELEMETRY SUITE
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Real-time Faculty, Session & Student Join Analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-card border border-border rounded-xl p-1 text-xs">
            {(["1D", "7D", "30D", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-extrabold transition",
                  timeframe === tf ? "gradient-bg text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          <Button onClick={handleRunCleanup} variant="outline" size="sm" className="gap-2 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Auto-Draft Cleanup
          </Button>

          <Button onClick={loadData} variant="outline" size="sm" className="gap-2 text-xs border-border">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>

          <Button onClick={handleLockDeveloper} variant="destructive" size="sm" className="gap-2 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Lock Portal
          </Button>

          <Link to="/dashboard">
            <Button size="sm" className="gradient-bg gap-2 text-xs font-semibold">
              <LayoutDashboard className="h-3.5 w-3.5" /> Back to App
            </Button>
          </Link>
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Main Developer Telemetry Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* Realtime API & Storage Health Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 grid place-items-center text-emerald-500">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">API Latency Ping</div>
              <div className="text-lg font-black">{apiLatencyMs !== null ? `${apiLatencyMs} ms` : "--"}</div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Supabase Realtime</div>
              <div className="text-lg font-black text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 grid place-items-center text-purple-500">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Faculty Creators</div>
              <div className="text-lg font-black text-foreground">{uniqueCreators.length} Faculty</div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 grid place-items-center text-amber-500">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Total Students Joined</div>
              <div className="text-lg font-black text-foreground">{participants.length} Students</div>
            </div>
          </div>
        </div>

        {/* Primary KPI Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Classroom Sessions ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/30 grid place-items-center text-primary">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{filteredSessionsByTime.length}</span>
              <span className="text-xs text-emerald-500 font-bold">({liveSessionsCount} Live Now)</span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-3 pt-1 border-t border-border/40">
              <span>{draftSessionsCount} Drafts</span>
              <span>•</span>
              <span>{endedSessionsCount} Completed</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Questions Created</span>
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 grid place-items-center text-cyan-500">
                <HelpCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{filteredQuestionsByTime.length}</span>
              <span className="text-xs text-cyan-500 font-bold">Questions</span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/40">
              <span>{pollQuestionsCount} Polls</span>
              <span>•</span>
              <span>{wordcloudQuestionsCount} Word Clouds</span>
              <span>•</span>
              <span>{quizQuestionsCount} Quizzes</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Student Joins ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{filteredParticipantsByTime.length}</span>
              <span className="text-xs text-blue-500 font-bold">Students Joined</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Across all classroom sessions
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Responses Submitted</span>
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/30 grid place-items-center text-purple-500">
                <MessageSquare className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{filteredResponsesByTime.length}</span>
              <span className="text-xs text-purple-500 font-bold">Answers</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Recorded answers across all sessions
            </div>
          </div>
        </div>

        {/* Detailed Tabs Suite */}
        <Tabs defaultValue="sessions" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-3">
            <TabsList className="bg-card border border-border p-1 rounded-xl flex-wrap">
              <TabsTrigger value="sessions" className="gap-2 text-xs font-semibold">
                <Layers className="h-3.5 w-3.5" /> Sessions & Faculty ({searchedSessions.length})
              </TabsTrigger>
              <TabsTrigger value="creators" className="gap-2 text-xs font-semibold">
                <UserCheck className="h-3.5 w-3.5" /> Faculty Breakdown ({uniqueCreators.length})
              </TabsTrigger>
              <TabsTrigger value="responses" className="gap-2 text-xs font-semibold">
                <MessageSquare className="h-3.5 w-3.5" /> Submissions ({filteredResponsesByTime.length})
              </TabsTrigger>
              <TabsTrigger value="telemetry" className="gap-2 text-xs font-semibold">
                <Terminal className="h-3.5 w-3.5" /> Telemetry Logs ({auditLogs.length})
              </TabsTrigger>
            </TabsList>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions/faculty/students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-card/60 border-border"
              />
            </div>
          </div>

          {/* TAB 1: ALL SESSIONS & FACULTY MONITOR */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Session Title</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Faculty / Creator Name</th>
                      <th className="px-4 py-3">Students Joined</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {searchedSessions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
                          No sessions match filter query.
                        </td>
                      </tr>
                    ) : (
                      searchedSessions.map((s) => {
                        const faculty = getFacultyInfo(s.creator_id);
                        const sessParts = getSessionParticipants(s.id);

                        return (
                          <tr key={s.id} className="hover:bg-accent/40 transition">
                            <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">{s.title}</td>
                            <td className="px-4 py-3 font-mono font-black text-primary">{s.code}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                                  s.status === "live"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    : s.status === "draft"
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                    : "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[180px] truncate">
                              <div className="font-bold text-foreground">{faculty.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{faculty.email}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-extrabold text-blue-500 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" /> {sessParts.length} Students
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right space-x-2">
                              {/* View Student List Dialog */}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1 text-primary">
                                    <Eye className="h-3.5 w-3.5" /> View Students ({sessParts.length})
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-base">
                                      <Users className="h-4 w-4 text-primary" /> Students Joined — {s.title} ({s.code})
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 my-2">
                                    <div className="text-xs text-muted-foreground">
                                      Faculty Creator: <strong className="text-foreground">{faculty.name}</strong>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                                      {sessParts.length === 0 ? (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                          No students joined this session yet.
                                        </div>
                                      ) : (
                                        sessParts.map((p, pIdx) => (
                                          <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary grid place-items-center text-[10px] font-bold">
                                                {pIdx + 1}
                                              </span>
                                              <span className="font-bold text-foreground">{p.name}</span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                              {new Date(p.joined_at).toLocaleTimeString()}
                                            </span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>

                              <Link
                                to="/embed/$code"
                                params={{ code: s.code }}
                                target="_blank"
                                className="text-xs text-primary font-bold hover:underline"
                              >
                                Embed View
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: FACULTY CREATORS MONITOR */}
          <TabsContent value="creators" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uniqueCreators.map((item) => (
                <div key={item.creator_id} className="glass rounded-2xl p-5 border border-border/60 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/20 text-primary font-bold text-base">
                      {item.profile?.full_name?.charAt(0) || "F"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm truncate">{item.profile?.full_name || "Faculty Creator"}</h4>
                      <p className="text-xs text-muted-foreground truncate">{item.profile?.email || item.creator_id}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Sessions Created</span>
                      <strong className="text-foreground text-sm font-extrabold">{item.count} Sessions</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Total Students Taught</span>
                      <strong className="text-blue-500 text-sm font-extrabold">{item.totalStudents} Students</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* TAB 3: SUBMISSIONS MONITOR */}
          <TabsContent value="responses" className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-border/60 space-y-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500" /> Recent Student Answers ({filteredResponsesByTime.length})
              </h3>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredResponsesByTime.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-card/60 border border-border/40 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary font-mono bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg text-xs">
                        {r.answer}
                      </span>
                      <span className="text-muted-foreground truncate max-w-[250px]">Participant ID: {r.participant_id.slice(0, 8)}...</span>
                    </div>
                    <span className="text-muted-foreground text-[11px] font-mono">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: TELEMETRY LOGS */}
          <TabsContent value="telemetry" className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-border/60 space-y-4 font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold flex items-center gap-2 text-emerald-500">
                    <Terminal className="h-4 w-4" /> Live Realtime Telemetry & Audit Stream
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["ALL", "AUTH", "SESSION", "RESPONSE", "QUESTION", "SYSTEM"] as const).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setLogFilterTag(tag)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase transition border",
                        logFilterTag === tag
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card/50 text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/90 rounded-xl p-4 text-xs space-y-2.5 max-h-[500px] overflow-y-auto border border-border/60 text-slate-200 shadow-inner">
                {filteredAuditLogs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 italic">No telemetry logs found for current filter.</div>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 hover:bg-slate-900/60 p-1 rounded transition">
                      <span className="text-slate-500 text-[10px] select-none font-bold">{log.id}</span>
                      <span className="text-slate-400 text-[10px] select-none">[{log.timestamp}]</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider select-none",
                          log.tag === "AUTH"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : log.tag === "SESSION"
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : log.tag === "RESPONSE"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        )}
                      >
                        {log.tag}
                      </span>
                      <span
                        className={cn(
                          "flex-1 break-all",
                          log.type === "success"
                            ? "text-emerald-400"
                            : log.type === "warn"
                            ? "text-amber-300"
                            : log.type === "error"
                            ? "text-rose-400"
                            : "text-slate-200"
                        )}
                      >
                        {log.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
