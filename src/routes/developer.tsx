import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Key,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  participants_count?: number;
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

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer Monitor & Analytics · KCT PULSE" },
      { name: "description", content: "Developer system monitor and live analytics dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeveloperDashboard,
});

function DeveloperDashboard() {
  const [passkey, setPasskey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kct_dev_auth") === "true";
    }
    return false;
  });

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [liveLogs, setLiveLogs] = useState<{ id: string; msg: string; time: string; type: "info" | "success" | "warn" }[]>([]);

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

  // Load All System Analytics & Records
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Sessions
      const { data: sData } = await supabase
        .from("sessions")
        .select("id,title,code,status,creator_id,created_at,current_question_id")
        .order("created_at", { ascending: false });

      // 2. Fetch Participants
      const { data: pData } = await supabase
        .from("participants")
        .select("id,session_id,name,joined_at")
        .order("joined_at", { ascending: false });

      // 3. Fetch Responses
      const { data: rData } = await supabase
        .from("responses")
        .select("id,question_id,participant_id,answer,created_at,image_url")
        .order("created_at", { ascending: false });

      // 4. Fetch Profiles
      const { data: profData } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url,created_at")
        .order("created_at", { ascending: false });

      setSessions((sData as SessionRow[]) || []);
      setParticipants((pData as ParticipantRow[]) || []);
      setResponses((rData as ResponseRow[]) || []);
      setProfiles((profData as ProfileRow[]) || []);

      addLog("System telemetry loaded successfully", "info");
    } catch (err: any) {
      console.error("Developer dashboard error:", err);
      addLog(`Data fetch warning: ${err.message}`, "warn");
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg: string, type: "info" | "success" | "warn" = "info") => {
    setLiveLogs((prev) => [
      { id: crypto.randomUUID(), msg, time: new Date().toLocaleTimeString(), type },
      ...prev.slice(0, 40),
    ]);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();

    // Realtime listeners for Developer Dashboard
    const sessChannel = supabase
      .channel("dev-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        addLog(`Session ${payload.eventType}: ${payload.new?.title || payload.old?.id}`, "success");
        loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants" }, (payload) => {
        const p = payload.new as ParticipantRow;
        addLog(`Student '${p.name}' joined session`, "info");
        setParticipants((prev) => [p, ...prev]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses" }, (payload) => {
        const r = payload.new as ResponseRow;
        addLog(`New response logged: '${r.answer}'`, "success");
        setResponses((prev) => [r, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessChannel);
    };
  }, [isAuthenticated]);

  // Derived Analytics Computations
  const liveSessionsCount = useMemo(() => sessions.filter((s) => s.status === "live").length, [sessions]);
  const draftSessionsCount = useMemo(() => sessions.filter((s) => s.status === "draft").length, [sessions]);
  const endedSessionsCount = useMemo(() => sessions.filter((s) => s.status === "ended").length, [sessions]);

  // Unique Creators list
  const uniqueCreators = useMemo(() => {
    const map = new Map<string, { creator_id: string; profile?: ProfileRow; count: number; lastActive: string }>();
    sessions.forEach((s) => {
      const existing = map.get(s.creator_id) || {
        creator_id: s.creator_id,
        profile: profiles.find((p) => p.id === s.creator_id),
        count: 0,
        lastActive: s.created_at,
      };
      existing.count++;
      if (new Date(s.created_at) > new Date(existing.lastActive)) {
        existing.lastActive = s.created_at;
      }
      map.set(s.creator_id, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [sessions, profiles]);

  // Filtered Sessions for Search
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.creator_id.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

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
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-md">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> DEVELOPER MONITOR
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Real-time Platform Telemetry & Usage Analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={loadData} variant="outline" size="sm" className="gap-2 text-xs border-border">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button onClick={handleLockDeveloper} variant="destructive" size="sm" className="gap-2 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Lock Developer Portal
          </Button>
          <Link to="/dashboard">
            <Button size="sm" className="gradient-bg gap-2 text-xs font-semibold">
              <LayoutDashboard className="h-3.5 w-3.5" /> Back to App
            </Button>
          </Link>
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Main Monitoring Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* KPI Metrics Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Total Sessions</span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/30 grid place-items-center text-primary">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{sessions.length}</span>
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
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Active Faculty Users</span>
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 grid place-items-center text-emerald-500">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{uniqueCreators.length}</span>
              <span className="text-xs text-muted-foreground font-semibold">Creators</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Profiles Synced: {profiles.length} Accounts
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Student Joins</span>
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{participants.length}</span>
              <span className="text-xs text-blue-500 font-bold">Participants</span>
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
              <span className="text-3xl font-black">{responses.length}</span>
              <span className="text-xs text-purple-500 font-bold">Answers</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Polls, Word Clouds & Quizzes
            </div>
          </div>
        </div>

        {/* Detailed Tabs Control Center */}
        <Tabs defaultValue="sessions" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-3">
            <TabsList className="bg-card border border-border p-1 rounded-xl">
              <TabsTrigger value="sessions" className="gap-2 text-xs font-semibold">
                <Layers className="h-3.5 w-3.5" /> Sessions ({sessions.length})
              </TabsTrigger>
              <TabsTrigger value="creators" className="gap-2 text-xs font-semibold">
                <UserCheck className="h-3.5 w-3.5" /> Creators ({uniqueCreators.length})
              </TabsTrigger>
              <TabsTrigger value="responses" className="gap-2 text-xs font-semibold">
                <MessageSquare className="h-3.5 w-3.5" /> Submissions ({responses.length})
              </TabsTrigger>
              <TabsTrigger value="telemetry" className="gap-2 text-xs font-semibold">
                <Terminal className="h-3.5 w-3.5" /> Live Logs ({liveLogs.length})
              </TabsTrigger>
            </TabsList>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions/creators..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-card/60 border-border"
              />
            </div>
          </div>

          {/* TAB 1: ALL SESSIONS MONITOR */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Session Title</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Creator ID</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          No sessions match search query.
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-accent/40 transition">
                          <td className="px-4 py-3 font-semibold text-foreground max-w-[220px] truncate">{s.title}</td>
                          <td className="px-4 py-3 font-mono font-bold text-primary">{s.code}</td>
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
                          <td className="px-4 py-3 font-mono text-muted-foreground max-w-[140px] truncate select-all">{s.creator_id}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right space-x-2">
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
                      ))
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
                      <strong className="text-foreground text-sm font-extrabold">{item.count}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Last Session</span>
                      <span className="text-foreground text-[11px] font-mono">{new Date(item.lastActive).toLocaleDateString()}</span>
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
                <MessageSquare className="h-4 w-4 text-purple-500" /> Recent Student Answers ({responses.length})
              </h3>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {responses.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-card/60 border border-border/40 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary font-mono bg-primary/10 border border-primary/30 px-2 py-0.5 rounded text-[11px]">
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

          {/* TAB 4: LIVE SYSTEM LOGS TELEMETRY */}
          <TabsContent value="telemetry" className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-border/60 space-y-4 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-2 text-emerald-500">
                  <Terminal className="h-4 w-4" /> Live Realtime Telemetry Stream
                </span>
                <span className="text-muted-foreground">Auto-updating via Supabase Realtime</span>
              </div>

              <div className="bg-black/80 rounded-xl p-4 text-xs space-y-2 max-h-[400px] overflow-y-auto border border-border/60 text-slate-200">
                {liveLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <span className="text-slate-500 text-[10px] select-none">[{log.time}]</span>
                    <span
                      className={cn(
                        log.type === "success"
                          ? "text-emerald-400"
                          : log.type === "warn"
                          ? "text-amber-400"
                          : "text-blue-400"
                      )}
                    >
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
