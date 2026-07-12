import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusPill } from "./dashboard.index";

type Row = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: { count: number }[];
  questions: { count: number }[];
};

export const Route = createFileRoute("/_authenticated/dashboard/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from("sessions")
        .select("id,title,code,status,created_at,participants(count),questions(count)")
        .eq("creator_id", user.user.id)
        .order("created_at", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">Engagement across your sessions.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {rows.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground md:col-span-2">
            Run a session first — analytics will appear here.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <div className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">{r.code}</div>
              </div>
              <StatusPill status={r.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-accent/40 p-3">
                <div className="text-xs text-muted-foreground">Participants</div>
                <div className="mt-1 text-2xl font-bold">{r.participants?.[0]?.count ?? 0}</div>
              </div>
              <div className="rounded-xl bg-accent/40 p-3">
                <div className="text-xs text-muted-foreground">Questions</div>
                <div className="mt-1 text-2xl font-bold">{r.questions?.[0]?.count ?? 0}</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}