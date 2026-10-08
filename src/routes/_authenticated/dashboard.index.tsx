import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Radio,
  CheckCircle2,
  Clock,
  Users,
  HelpCircle,
  MessageSquare,
  BarChart3,
  Sparkles,
  Calendar,
  Activity,
  Brain,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn, throttle } from "@/lib/utils";
import { auth } from "@/lib/firebase";

type Session = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: { id: string; name: string; joined_at: string }[];
  questions: { id: string; title: string; type: string; responses: { id: string }[] }[];
};

type FacultyMetrics = {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  draftSessions: number;
  totalStudentsEngaged: number;
  totalQuestionsCreated: number;
  totalResponsesReceived: number;
  avgParticipationPct: number;
  avgAttendanceCount: number;
  lastLoginTime: string | null;
};

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLoginTime, setLastLoginTime] = useState<string | null>(null);

  const loadFacultyData = async () => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch logged in faculty's sessions with detailed participants and questions/responses
      const { data, error } = await supabase
        .from("sessions")
        .select(
          `
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
          questions!session_id (
            id,
            title,
            type,
            responses (
              id
            )
          )
        `,
        )
        .eq("creator_id", user.uid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading faculty dashboard:", error);
      } else {
        setSessions((data as unknown as Session[]) ?? []);
      }

      // 2. Fetch last login record from login_logs
      const { data: logsData } = await supabase
        .from("login_logs")
        .select("login_time")
        .eq("user_id", user.uid)
        .order("login_time", { ascending: false })
        .limit(2);

      if (logsData && logsData.length > 0) {
        // Use the second most recent login (or current) for last login display
        const targetLog = logsData.length > 1 ? logsData[1] : logsData[0];
        setLastLoginTime(new Date(targetLog.login_time).toLocaleString());
      }
    } catch (err) {
      console.error("Failed to load faculty analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFacultyData();

    // Supabase Realtime listeners for live updates
    const user = auth.currentUser;
    if (!user) return;

    const throttledLoad = throttle(loadFacultyData, 5000);

    const channel = supabase
      .channel(`faculty-dashboard-sync-${user.uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `creator_id=eq.${user.uid}` },
        () => {
          throttledLoad();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants" },
        () => {
          throttledLoad();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, () => {
        throttledLoad();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => {
        throttledLoad();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Compute Live Metrics from Single Source of Truth
  const metrics: FacultyMetrics = useMemo(() => {
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter((s) => s.status === "live").length;
    const completedSessions = sessions.filter((s) => s.status === "ended").length;
    const draftSessions = sessions.filter((s) => s.status === "draft").length;

    const totalStudentsSet = new Set<string>();
    let totalQuestionsCreated = 0;
    let totalResponsesReceived = 0;
    let totalPossibleResponses = 0;
    let sumAttendance = 0;

    sessions.forEach((s) => {
      const partsCount = s.participants?.length ?? 0;
      sumAttendance += partsCount;

      s.participants?.forEach((p) => totalStudentsSet.add(p.id));

      const qList = s.questions ?? [];
      totalQuestionsCreated += qList.length;

      qList.forEach((q) => {
        const respCount = q.responses?.length ?? 0;
        totalResponsesReceived += respCount;
        totalPossibleResponses += partsCount;
      });
    });

    const avgParticipationPct =
      totalPossibleResponses > 0
        ? Math.min(100, Math.round((totalResponsesReceived / totalPossibleResponses) * 100))
        : 0;

    const avgAttendanceCount = totalSessions > 0 ? Math.round(sumAttendance / totalSessions) : 0;

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      draftSessions,
      totalStudentsEngaged: totalStudentsSet.size,
      totalQuestionsCreated,
      totalResponsesReceived,
      avgParticipationPct,
      avgAttendanceCount,
      lastLoginTime,
    };
  }, [sessions, lastLoginTime]);

  const activeSessionsList = useMemo(() => sessions.filter((s) => s.status === "live"), [sessions]);
  const recentSessionsList = useMemo(() => sessions.slice(0, 6), [sessions]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 pb-24 sm:pb-10 relative space-y-6 sm:space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight">
              Faculty Analytics & Dashboard
            </h1>
            <span className="hidden sm:inline-flex rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-wider items-center gap-1 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              DATABASE SYNC
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Realtime metrics for your classrooms •{" "}
            {lastLoginTime ? `Last Login: ${lastLoginTime}` : "Active Session"}
          </p>
          <div className="mt-2.5 sm:hidden">
            <span className="inline-flex rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-wider items-center gap-1 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              DATABASE SYNC
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="bg-white h-10 px-3.5 flex items-center justify-center rounded-xl shadow-sm shrink-0">
            <img
              src="/kumaraguru-logo.jpg"
              alt="Kumaraguru Institutions"
              className="h-5 sm:h-6 object-contain"
            />
          </div>
          <Link to="/dashboard/sessions" className="flex-1 sm:flex-initial min-w-0">
            <Button className="w-full sm:w-auto gradient-bg font-semibold h-10 rounded-xl px-4 text-xs sm:text-sm">
              <Plus className="mr-1.5 h-4 w-4 shrink-0" /> New Session
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Row 1: Session Status Breakdown */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="My Sessions"
          value={metrics.totalSessions}
          icon={Layers}
          accent="text-primary"
          description="Total created"
        />
        <StatCard
          label="Active Sessions"
          value={metrics.activeSessions}
          icon={Radio}
          accent="text-emerald-400"
          description="Live classroom"
        />
        <StatCard
          label="Completed"
          value={metrics.completedSessions}
          icon={CheckCircle2}
          accent="text-blue-400"
          description="Conducted"
        />
        <StatCard
          label="Draft Sessions"
          value={metrics.draftSessions}
          icon={Clock}
          accent="text-amber-400"
          description="Saved drafts"
        />
      </div>

      {/* KPI Cards Row 2: Live Database Student Engagement */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Students Engaged"
          value={metrics.totalStudentsEngaged}
          icon={Users}
          accent="text-purple-400"
          description="Total distinct students"
        />
        <StatCard
          label="Questions Created"
          value={metrics.totalQuestionsCreated}
          icon={HelpCircle}
          accent="text-cyan-400"
          description="Across all sessions"
        />
        <StatCard
          label="Responses Collected"
          value={metrics.totalResponsesReceived}
          icon={MessageSquare}
          accent="text-emerald-400"
          description="Total student submissions"
        />
        <StatCard
          label="Avg Participation"
          value={`${metrics.avgParticipationPct}%`}
          icon={BarChart3}
          accent="text-indigo-400"
          description="Engagement rate"
        />
      </div>

      {/* Classroom Intelligence Discovery Card */}
      <div className="glass rounded-2xl p-5 sm:p-6 border border-white/5 hover:border-primary/40 transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Classroom Intelligence
              </h2>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                Pedagogical Analytics
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 max-w-xl">
              Understand student engagement, participant distribution, and question concept performance across your classrooms.
            </p>
          </div>
        </div>
        <Link to="/dashboard/intelligence" className="shrink-0 w-full sm:w-auto">
          <Button
            variant="outline"
            className="w-full sm:w-auto border-primary/30 hover:bg-primary/10 text-primary font-semibold text-xs sm:text-sm h-10 rounded-xl px-4 gap-1.5"
          >
            Open Intelligence <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Active Sessions Section */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" /> Active Live Sessions (
            {activeSessionsList.length})
          </h2>
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
          {activeSessionsList.length === 0 && !loading && (
            <div className="glass rounded-2xl p-6 sm:p-8 text-center text-xs sm:text-sm text-muted-foreground md:col-span-2">
              No live sessions currently running. Launch a session from your session manager.
            </div>
          )}
          {activeSessionsList.map((s) => (
            <SessionCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      {/* Recent Classroom Sessions List */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Recent Sessions & Analytics (
            {recentSessionsList.length})
          </h2>
          <Link
            to="/dashboard/sessions"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            View All <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
          {recentSessionsList.length === 0 && !loading && (
            <div className="glass rounded-2xl p-6 sm:p-8 text-center text-xs sm:text-sm text-muted-foreground md:col-span-2">
              Your classroom sessions will appear here.
            </div>
          )}
          {recentSessionsList.map((s) => (
            <SessionCard key={s.id} s={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  description,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5 border border-white/5 hover:border-white/10 transition-all duration-200">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold truncate">
          {label}
        </span>
        <div className={cn("p-1.5 sm:p-2 rounded-xl bg-white/[0.03] shrink-0", accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-1.5 sm:mt-3 text-2xl sm:text-3xl font-black tracking-tight">{value}</div>
      {description && (
        <div className="mt-0.5 sm:mt-1 text-[11px] text-muted-foreground truncate">{description}</div>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: Session }) {
  const participantCount = s.participants?.length ?? 0;
  const questionCount = s.questions?.length ?? 0;
  const totalResponses = (s.questions ?? []).reduce(
    (acc, q) => acc + (q.responses?.length ?? 0),
    0,
  );

  return (
    <Link
      to="/dashboard/session/$id"
      params={{ id: s.id }}
      className="glass rounded-2xl p-4 sm:p-5 transition hover:-translate-y-0.5 hover:border-primary/50 border border-white/5 space-y-3 block"
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-foreground text-sm sm:text-base">{s.title}</h3>
          <div className="mt-1 font-mono text-xs tracking-[0.2em] text-primary font-bold">
            {s.code}
          </div>
        </div>
        <StatusPill status={s.status} />
      </div>

      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-foreground/80 font-medium">
            <Users className="h-3.5 w-3.5 text-primary" /> {participantCount} Students
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-cyan-400" /> {questionCount} Qs
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> {totalResponses} Resp.
          </span>
        </div>
        <span className="text-[11px] font-mono shrink-0">{new Date(s.created_at).toLocaleDateString()}</span>
      </div>
    </Link>
  );
}

export function StatusPill({ status }: { status: "draft" | "live" | "ended" }) {
  const map = {
    live: "bg-[color:var(--accent-emerald)]/20 text-[color:var(--accent-emerald)] border-[color:var(--accent-emerald)]/40",
    draft:
      "bg-[color:var(--primary-glow)]/20 text-[color:var(--primary-glow)] border-[color:var(--primary-glow)]/40",
    ended: "bg-muted text-muted-foreground border-border",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0",
        map[status],
      )}
    >
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {status}
    </span>
  );
}
