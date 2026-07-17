import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateSessionCode } from "@/lib/session-utils";
import { toast } from "sonner";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";

type Row = { id: string; title: string; code: string; status: "draft" | "live" | "ended"; created_at: string; participants: { count: number }[] };

export const Route = createFileRoute("/_authenticated/dashboard/sessions")({
  component: SessionsPage,
});

function SessionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = Route.useNavigate();

  const load = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const { data } = await supabase
      .from("sessions")
      .select("id,title,code,status,created_at,participants(count)")
      .eq("creator_id", user.uid)
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("sessions-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");
      let code = generateSessionCode();
      // simple retry on collision
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase.from("sessions").select("id").eq("code", code).maybeSingle();
        if (!data) break;
        code = generateSessionCode();
      }
      const { data: inserted, error } = await supabase
        .from("sessions")
        .insert({ title, code, creator_id: user.uid, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Session created");
      setOpen(false);
      setTitle("");
      navigate({ to: "/dashboard/session/$id", params: { id: inserted.id } });
    } catch (err) {
      console.error("Create session error:", err);
      // Show full error details for debugging
      try {
        const errDetails = typeof err === "object" && err !== null ? JSON.stringify(err, null, 2) : String(err);
        toast.error(errDetails);
      } catch {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session and all its data?")) return;
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Session deleted");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage every classroom session.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-bg font-semibold"><Plus className="mr-2 h-4 w-4" />New Session</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Session</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Session title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Electrochemistry Lecture" />
              </div>
              <Button type="submit" disabled={saving || !title.trim()} className="w-full gradient-bg">
                {saving ? "Creating..." : "Create Session"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 glass rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/60">
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Code</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Participants</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">No sessions yet. Create one above.</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-4 items-center px-5 py-4 border-b border-border/40 last:border-0 hover:bg-accent/40 transition">
            <Link to="/dashboard/session/$id" params={{ id: r.id }} className="col-span-5 font-medium truncate">{r.title}</Link>
            <div className="col-span-2 font-mono text-sm tracking-widest">{r.code}</div>
            <div className="col-span-2"><StatusPill status={r.status} /></div>
            <div className="col-span-2 text-sm text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {r.participants?.[0]?.count ?? 0}</div>
            <div className="col-span-1 text-right">
              <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}