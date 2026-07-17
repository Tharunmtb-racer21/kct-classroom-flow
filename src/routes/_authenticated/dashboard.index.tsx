import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Radio, CheckCircle2, Clock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";

type Session = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: { count: number }[];
};

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const { data } = await supabase
      .from("sessions")
      .select("id,title,code,status,created_at,participants(count)")
      .eq("creator_id", user.uid)
      .order("created_at", { ascending: false });
    setSessions((data as unknown as Session[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dashboard-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const active = sessions.filter((s) => s.status === "live");
  const drafts = sessions.filter((s) => s.status === "draft");
  const ended = sessions.filter((s) => s.status === "ended");

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your live classroom sessions.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white px-3 py-1.5 rounded shadow-sm">
            <img src="/kumaraguru-logo.jpg" alt="Kumaraguru Institutions" className="h-8 object-contain" />
          </div>
          <Link to="/dashboard/sessions">
            <Button className="gradient-bg font-semibold"><Plus className="mr-2 h-4 w-4" /> New Session</Button>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard label="Active" value={active.length} icon={Radio} accent="text-[color:var(--accent-emerald)]" />
        <StatCard label="Drafts" value={drafts.length} icon={Clock} accent="text-[color:var(--primary-glow)]" />
        <StatCard label="Completed" value={ended.length} icon={CheckCircle2} accent="text-muted-foreground" />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Active Sessions</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {active.length === 0 && !loading && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground md:col-span-2">
              No active sessions. Create one to get started.
            </div>
          )}
          {active.map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Previous Sessions</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[...drafts, ...ended].length === 0 && !loading && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground md:col-span-2">
              Your past sessions will appear here.
            </div>
          )}
          {[...drafts, ...ended].map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function SessionCard({ s }: { s: Session }) {
  const count = s.participants?.[0]?.count ?? 0;
  return (
    <Link to="/dashboard/session/$id" params={{ id: s.id }} className="glass rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-primary/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{s.title}</h3>
          <div className="mt-1 font-mono text-xs tracking-[0.2em] text-muted-foreground">{s.code}</div>
        </div>
        <StatusPill status={s.status} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {count} participants</span>
        <span>{new Date(s.created_at).toLocaleDateString()}</span>
      </div>
    </Link>
  );
}

export function StatusPill({ status }: { status: "draft" | "live" | "ended" }) {
  const map = {
    live: "bg-[color:var(--accent-emerald)]/20 text-[color:var(--accent-emerald)] border-[color:var(--accent-emerald)]/40",
    draft: "bg-[color:var(--primary-glow)]/20 text-[color:var(--primary-glow)] border-[color:var(--primary-glow)]/40",
    ended: "bg-muted text-muted-foreground border-border",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", map[status])}>
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {status}
    </span>
  );
}