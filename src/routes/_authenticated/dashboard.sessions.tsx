import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Users,
  Share2,
  Copy,
  Sparkles,
  Building2,
  FolderGit2,
  Layers,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { generateSessionCode, autoDraftStaleSessions } from "@/lib/session-utils";
import { toast } from "sonner";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";
import { useSessions, sessionsKeys } from "@/hooks/queries/use-sessions";
import { queryClient } from "@/lib/query-client";
import { type SessionListRow as Row } from "@/services/sessions/session-service";
import { throttle } from "@/lib/utils";

type SharedTemplate = {
  id: string;
  department: string;
  title: string;
  code: string;
  questionsCount: number;
  author: string;
  sampleQuestions: string[];
};

const DEPARTMENT_TEMPLATES: SharedTemplate[] = [
  {
    id: "tmpl-cse-01",
    department: "Computer Science & Engineering",
    title: "Data Structures & Algorithms Midterm Review",
    code: "KCTCSE1",
    questionsCount: 5,
    author: "Dept of CSE",
    sampleQuestions: [
      "Array vs Linked List Lookup Time",
      "Binary Search Tree Traversal Order",
      "Time Complexity of QuickSort",
    ],
  },
  {
    id: "tmpl-eee-02",
    department: "Electrical & Electronics Engineering",
    title: "Three Phase Transformers & Voltage Regulation",
    code: "KCTEEE2",
    questionsCount: 4,
    author: "Dept of EEE",
    sampleQuestions: [
      "Primary Voltage Step Down Ratio",
      "Transformer Core Losses Formula",
      "Phase Difference in Delta Connection",
    ],
  },
  {
    id: "tmpl-math-03",
    department: "Mathematics & Humanities",
    title: "Linear Partial Differential Equations (PDE)",
    code: "KCTMAT3",
    questionsCount: 6,
    author: "Dept of Maths",
    sampleQuestions: [
      "Order of Lagrange Linear Equation",
      "Boundary Conditions for Wave Equation",
      "Fourier Series Coefficient Calculation",
    ],
  },
  {
    id: "tmpl-chem-04",
    department: "Physical Sciences & Chemistry",
    title: "Electrochemistry & Corrosion Prevention",
    code: "KCTCHM4",
    questionsCount: 4,
    author: "Dept of Chemistry",
    sampleQuestions: [
      "Nernst Equation Cell Potential",
      "Galvanic Anode Protection",
      "Standard Hydrogen Electrode Reference",
    ],
  },
];

export const Route = createFileRoute("/_authenticated/dashboard/sessions")({
  component: SessionsPage,
});

function SessionsPage() {
  const user = auth.currentUser;
  const { data: sessionsData, isLoading, refetch } = useSessions(user?.uid);
  const rows = sessionsData ?? [];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Co-hosting Modal States
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedShareSession, setSelectedShareSession] = useState<Row | null>(null);
  const [coHostEmail, setCoHostEmail] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  // Rename Session Modal States
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [sessionToRename, setSessionToRename] = useState<Row | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const navigate = Route.useNavigate();

  useEffect(() => {
    autoDraftStaleSessions().then(() => refetch());
    if (!user?.uid) return;

    const throttledRefetch = throttle(() => {
      refetch();
    }, 2000);

    const ch = supabase
      .channel(`sessions-list-${user.uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `creator_id=eq.${user.uid}`,
        },
        () => {
          throttledRefetch();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.uid, refetch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    console.log("[CreateSession] Starting session creation flow. Title:", title);
    try {
      const user = auth.currentUser;
      console.log(
        "[CreateSession] Authenticated Firebase User:",
        user ? { uid: user.uid, email: user.email } : "NULL",
      );
      if (!user) throw new Error("Not signed in");

      // Verify if profiles table has this UID
      console.log("[CreateSession] Checking if Firebase UID exists in profiles table...");
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", user.uid)
        .maybeSingle();

      console.log("[CreateSession] Profile check result:", { profile, profileErr });
      if (profileErr) {
        console.error("[CreateSession] Error querying profiles table:", profileErr);
      }

      let code = generateSessionCode();
      console.log("[CreateSession] Generated initial code:", code);
      for (let i = 0; i < 5; i++) {
        console.log(`[CreateSession] Checking uniqueness of code (attempt ${i + 1}):`, code);
        const { data, error } = await supabase
          .from("sessions")
          .select("id")
          .eq("code", code)
          .maybeSingle();
        if (error) {
          console.error("[CreateSession] Error checking code uniqueness:", error);
        }
        if (!data) break;
        code = generateSessionCode();
        console.log("[CreateSession] Regenerated code:", code);
      }

      const payload = { title, code, creator_id: user.uid, status: "draft" as const };
      console.log("[CreateSession] Submitting payload to Supabase sessions table:", payload);

      const { data: inserted, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select("id")
        .single();

      console.log("[CreateSession] Supabase insert response:", { inserted, error });

      if (error) throw error;
      toast.success("Session created");
      setOpen(false);
      setTitle("");
      queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      navigate({ to: "/dashboard/session/$id", params: { id: inserted.id } });
    } catch (err) {
      console.error("[CreateSession] Create session error caught:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloneTemplate = async (tmpl: SharedTemplate) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");
      let code = generateSessionCode();
      const { data: inserted, error } = await supabase
        .from("sessions")
        .insert({ title: `[Copy] ${tmpl.title}`, code, creator_id: user.uid, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;

      // Create sample questions for cloned template
      const qRows = tmpl.sampleQuestions.map((qTitle, idx) => ({
        session_id: inserted.id,
        type: "poll" as const,
        title: qTitle,
        options: ["Option A", "Option B", "Option C", "Option D"],
        order_index: idx,
        points: 1,
      }));

      await supabase.from("questions").insert(qRows);

      toast.success(`Template '${tmpl.title}' cloned to your sessions!`);
      await queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      navigate({ to: "/dashboard/session/$id", params: { id: inserted.id } });
    } catch (err: any) {
      console.error("Clone template error:", err);
      toast.error("Failed to clone template: " + err.message);
    }
  };

  const handleShareCoHost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coHostEmail.trim()) return;
    toast.success(
      `Session '${selectedShareSession?.title}' shared with ${coHostEmail}! Co-host invite sent.`,
    );
    setCoHostEmail("");
    setShareModalOpen(false);
  };

  const handleOpenRename = (r: Row) => {
    setSessionToRename(r);
    setNewTitle(r.title);
    setRenameModalOpen(true);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToRename || !newTitle.trim()) return;
    setRenaming(true);
    try {
      const trimmed = newTitle.trim();
      const { error } = await supabase
        .from("sessions")
        .update({ title: trimmed })
        .eq("id", sessionToRename.id);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      toast.success("Session renamed successfully! ✏️");
      setRenameModalOpen(false);
      setSessionToRename(null);
    } catch (err: any) {
      console.error("Rename session error:", err);
      toast.error(err.message || "Failed to rename session.");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteSessionId(id);
  };

  const confirmDelete = async () => {
    if (!deleteSessionId) return;
    try {
      const { error } = await supabase.from("sessions").delete().eq("id", deleteSessionId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
      toast.success("Session deleted");
    } catch (err: any) {
      console.error("Delete session error:", err);
      toast.error("Failed to delete session. Please try again.");
    } finally {
      setDeleteSessionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Classroom Sessions & Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create sessions, share department templates, and co-host with faculty.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-bg font-semibold">
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Session</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Session title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Electrochemistry Lecture"
                />
              </div>
              <Button
                type="submit"
                disabled={saving || !title.trim()}
                className="w-full gradient-bg"
              >
                {saving ? "Creating..." : "Create Session"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="my-sessions" className="space-y-6">
        <TabsList className="bg-card border border-border p-1 rounded-xl">
          <TabsTrigger value="my-sessions" className="gap-2 text-xs font-semibold">
            <Layers className="h-3.5 w-3.5" /> My Personal Sessions ({rows.length})
          </TabsTrigger>
          <TabsTrigger value="department-templates" className="gap-2 text-xs font-semibold">
            <Building2 className="h-3.5 w-3.5 text-primary" /> Department Shared Workspaces (
            {DEPARTMENT_TEMPLATES.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MY PERSONAL SESSIONS */}
        <TabsContent value="my-sessions" className="space-y-4">
          <div className="glass rounded-2xl overflow-hidden border border-border/60">
            <div className="grid grid-cols-12 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <div className="col-span-4">Title</div>
              <div className="col-span-2">Code</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2">Participants</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>
            {rows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No sessions yet. Create one above.
              </div>
            )}
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-4 items-center px-5 py-4 border-b border-border/40 last:border-0 hover:bg-accent/40 transition"
              >
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <Link
                    to="/dashboard/session/$id"
                    params={{ id: r.id }}
                    className="font-semibold truncate hover:text-primary transition"
                    title={r.title}
                  >
                    {r.title}
                  </Link>
                  <button
                    onClick={() => handleOpenRename(r)}
                    className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-accent transition shrink-0 opacity-60 hover:opacity-100"
                    title="Rename Session"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="col-span-2 font-mono text-sm tracking-widest text-primary font-bold">
                  {r.code}
                </div>
                <div className="col-span-1">
                  <StatusPill status={r.status} />
                </div>
                <div className="col-span-2 text-sm text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {r.participants?.[0]?.count ?? 0} Students
                </div>
                <div className="col-span-3 text-right flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                  <Button
                    onClick={() => handleOpenRename(r)}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 border-border/80 text-foreground hover:bg-accent"
                    title="Rename Session"
                  >
                    <Pencil className="h-3 w-3 text-primary" /> Rename
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedShareSession(r);
                      setShareModalOpen(true);
                    }}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    title="Share with Department Co-Host"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Co-Host
                  </Button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition"
                    title="Delete Session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: DEPARTMENT SHARED WORKSPACES & TEMPLATES */}
        <TabsContent value="department-templates" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DEPARTMENT_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.id}
                className="glass rounded-2xl p-6 border border-border/60 space-y-4 hover:border-primary/40 transition flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {tmpl.department}
                    </span>
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {tmpl.code}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground tracking-tight">{tmpl.title}</h3>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <FolderGit2 className="h-3.5 w-3.5 text-primary" /> Curated by{" "}
                    <span className="font-semibold text-foreground">{tmpl.author}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sample Questions ({tmpl.questionsCount}):
                    </div>
                    <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                      {tmpl.sampleQuestions.map((q, idx) => (
                        <li key={idx} className="truncate">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Button
                  onClick={() => handleCloneTemplate(tmpl)}
                  className="w-full gradient-bg font-semibold text-xs gap-2"
                >
                  <Copy className="h-4 w-4" /> Clone Template to My Workspace
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Share / Co-Host Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-primary">
              <Share2 className="h-5 w-5" /> Share & Co-Host Lecture Session
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShareCoHost} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Session</Label>
              <div className="font-bold text-sm bg-accent/40 p-2.5 rounded-xl border border-border">
                {selectedShareSession?.title} ({selectedShareSession?.code})
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coHostEmail" className="text-xs font-semibold">
                Department Co-Host Email (@kct.ac.in)
              </Label>
              <Input
                id="coHostEmail"
                type="email"
                required
                value={coHostEmail}
                onChange={(e) => setCoHostEmail(e.target.value)}
                placeholder="prof.name@kct.ac.in"
                className="bg-card/50 border-border text-sm"
              />
            </div>

            <Button type="submit" className="w-full gradient-bg font-semibold text-xs gap-2">
              <Share2 className="h-4 w-4" /> Send Co-Host Access Invite
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Session Modal */}
      <Dialog open={renameModalOpen} onOpenChange={setRenameModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground p-6 rounded-2xl shadow-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Pencil className="h-5 w-5 text-primary" /> Rename Session
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRename} className="space-y-4 pt-2">
            <div className="space-y-2 text-left">
              <Label htmlFor="session-new-title" className="text-xs font-semibold text-muted-foreground">
                Session Title
              </Label>
              <Input
                id="session-new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                autoFocus
                placeholder="e.g. Data Structures & Algorithms - Lecture 4"
                className="bg-card/50 border-border text-sm rounded-xl h-10"
              />
              {sessionToRename && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>
                    Session Code:{" "}
                    <span className="font-mono font-bold text-primary">
                      {sessionToRename.code}
                    </span>
                  </span>
                  <span className="capitalize">
                    Status:{" "}
                    <span className="font-semibold text-foreground">
                      {sessionToRename.status}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameModalOpen(false)}
                className="rounded-xl text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  renaming ||
                  !newTitle.trim() ||
                  newTitle.trim() === sessionToRename?.title
                }
                className="gradient-bg text-white font-semibold rounded-xl text-xs h-9 gap-1.5 shadow-md"
              >
                {renaming ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteSessionId}
        onOpenChange={(open) => !open && setDeleteSessionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this session and all its data? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
