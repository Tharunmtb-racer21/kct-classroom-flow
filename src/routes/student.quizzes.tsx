import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  BookOpen, 
  Calendar, 
  Clock, 
  Play, 
  CheckCircle, 
  Lock, 
  ArrowRight,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/quizzes")({
  head: () => ({
    meta: [
      { title: "Student Quizzes · KCT PULSE" },
      { name: "description", content: "Access your class quizzes and assessments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudentQuizzesPage,
});

const AUDIENCE_OPTIONS = [
  "CSE-A", "CSE-B", "CSE-C",
  "IT-A", "IT-B",
  "ECE-A", "ECE-B", "ECE-C",
  "EEE-A", "EEE-B",
  "MECH-A", "MECH-B",
  "CIVIL-A", "MCT-A"
];

function StudentQuizzesPage() {
  const navigate = Route.useNavigate();
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  // Restore saved student profile from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("kctpulse-student-info");
    if (saved) {
      const parsed = JSON.parse(saved) as { name: string; section: string };
      setName(parsed.name);
      setSection(parsed.section);
      setIsRegistered(true);
    }
  }, []);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!section) {
      toast.error("Please select your class/section.");
      return;
    }
    
    // Save to local storage
    localStorage.setItem(
      "kctpulse-student-info", 
      JSON.stringify({ name: name.trim(), section })
    );
    setIsRegistered(true);
    toast.success("Profile saved! Accessing your class quizzes.");
  };

  const handleClearProfile = () => {
    localStorage.removeItem("kctpulse-student-info");
    setIsRegistered(false);
    setName("");
    setSection("");
  };

  // Fetch quizzes using React Query
  const { data: quizzes = [], isLoading: loadingQuizzes, refetch } = useQuery({
    queryKey: ["student-quizzes", section],
    queryFn: async () => {
      if (!section) return [];
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, description, code, start_datetime, end_datetime, time_limit_minutes, max_attempts")
        .eq("target_audience", section)
        .order("start_datetime", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!section && isRegistered,
  });

  // Fetch student attempts to show attempt count/status
  const { data: studentAttempts = {}, isLoading: loadingAttempts, refetch: refetchAttempts } = useQuery({
    queryKey: ["student-attempts", name, section],
    queryFn: async () => {
      if (!name || !section) return {};
      
      // 1. Fetch student ID
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("name", name.trim())
        .eq("section", section)
        .maybeSingle();

      if (!student) return {};

      // 2. Fetch attempts
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, score")
        .eq("student_id", student.id);

      const mapping: Record<string, { count: number; completed: boolean; score?: number }> = {};
      attempts?.forEach((a) => {
        if (!mapping[a.quiz_id]) {
          mapping[a.quiz_id] = { count: 0, completed: false };
        }
        mapping[a.quiz_id].count += 1;
        if (a.status === "submitted") {
          mapping[a.quiz_id].completed = true;
          mapping[a.quiz_id].score = Number(a.score);
        }
      });
      return mapping;
    },
    enabled: isRegistered && !!name && !!section,
  });

  // Calculate current date/time status of a quiz
  const getQuizStatus = (start: string, end: string) => {
    const now = new Date().getTime();
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (now < startTime) return "upcoming";
    if (now > endTime) return "closed";
    return "open";
  };

  // Start or resume quiz attempt
  const handleStartQuiz = async (quizId: string) => {
    setLoading(true);
    try {
      // 1. Ensure student exists in student table
      let { data: student, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("name", name.trim())
        .eq("section", section)
        .maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        // Create new student
        const { data: newStudent, error: createError } = await supabase
          .from("students")
          .insert({ name: name.trim(), section })
          .select("id")
          .single();
        if (createError) throw createError;
        student = newStudent;
      }

      const studentId = student.id;

      // 2. Check for an active (in_progress) attempt
      const { data: existingAttempt } = await supabase
        .from("quiz_attempts")
        .select("id")
        .eq("quiz_id", quizId)
        .eq("student_id", studentId)
        .eq("status", "in_progress")
        .maybeSingle();

      if (existingAttempt) {
        // Resume existing attempt
        navigate({ to: "/quiz/$id", params: { id: quizId } });
        return;
      }

      // Check remaining attempts
      const quizInfo = quizzes.find((q) => q.id === quizId);
      const attemptsCount = studentAttempts[quizId]?.count || 0;
      if (quizInfo && attemptsCount >= quizInfo.max_attempts) {
        toast.error("You have reached the maximum number of attempts allowed for this quiz.");
        setLoading(false);
        return;
      }

      // Create a new attempt
      const { data: newAttempt, error: attemptError } = await supabase
        .from("quiz_attempts")
        .insert({
          quiz_id: quizId,
          student_id: studentId,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (attemptError) throw attemptError;

      toast.success("Attempt started!");
      navigate({ to: "/quiz/$id", params: { id: quizId } });
    } catch (err: any) {
      toast.error(err.message || "Failed to start quiz.");
    } finally {
      setLoading(false);
    }
  };

  const openQuizzes = quizzes.filter(q => getQuizStatus(q.start_datetime, q.end_datetime) === "open");
  const upcomingQuizzes = quizzes.filter(q => getQuizStatus(q.start_datetime, q.end_datetime) === "upcoming");
  const closedQuizzes = quizzes.filter(q => getQuizStatus(q.start_datetime, q.end_datetime) === "closed");

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex flex-col"
      style={{ backgroundImage: "url('/kct-landing-bg.jpg')" }}
    >
      <div className="absolute inset-0 pointer-events-none bg-background/90 backdrop-blur-sm" />

      {/* Top Header */}
      <header className="relative z-10 border-b border-border/40 bg-sidebar/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl overflow-hidden shadow-lg border border-border/40">
              <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-12 w-12 object-cover" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="ghost" />
            {isRegistered && (
              <Button variant="ghost" size="sm" onClick={handleClearProfile} className="text-muted-foreground hover:text-foreground">
                Logout
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 flex-1 mx-auto w-full max-w-4xl px-6 py-8">
        {!isRegistered ? (
          /* Profile Registration Form */
          <div className="max-w-md mx-auto mt-12 glass rounded-2xl border border-border/60 p-8 space-y-6 shadow-xl">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Users className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold">Student Verification</h2>
              <p className="text-sm text-muted-foreground">Enter details to see assigned quizzes for your class.</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-name">Full Name (as per KCT records) *</Label>
                <Input 
                  id="student-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="rounded-xl border border-border/60"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-section">Class/Section *</Label>
                <Select onValueChange={(val) => setSection(val)} value={section}>
                  <SelectTrigger id="student-section" className="rounded-xl border border-border/60">
                    <SelectValue placeholder="Select Class/Section" />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full gradient-bg font-bold py-3 shadow-md shadow-primary/20">
                Access Quizzes
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </form>
          </div>
        ) : (
          /* Quizzes List Dashboard */
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/30 backdrop-blur border border-border/60 p-6 rounded-2xl shadow-md">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Welcome, {name}!
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Showing quizzes assigned to section <span className="font-extrabold text-primary">{section}</span>.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refetch} className="font-semibold gap-1 shrink-0">
                Refresh List
              </Button>
            </div>

            {loadingQuizzes ? (
              <div className="text-center py-12 space-y-2">
                <LoaderIcon />
                <p className="text-xs text-muted-foreground">Loading quizzes...</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* 1. Open Quizzes */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">● Open Quizzes</h3>
                  {openQuizzes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-card/10">
                      No active quizzes currently open.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {openQuizzes.map((q) => {
                        const statusInfo = studentAttempts[q.id];
                        const isMaxed = statusInfo?.count >= q.max_attempts;

                        return (
                          <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-border/60 bg-card/40 backdrop-blur gap-4 shadow-sm hover:border-primary/50 transition">
                            <div className="space-y-1">
                              <h4 className="font-bold text-base">{q.title}</h4>
                              <p className="text-sm text-muted-foreground max-w-lg line-clamp-2">{q.description || "No description provided."}</p>
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1.5">
                                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Limit: {q.time_limit_minutes ? `${q.time_limit_minutes}m` : "No limit"}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Ends: {new Date(q.end_datetime).toLocaleString()}</span>
                                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Attempts: {statusInfo?.count || 0}/{q.max_attempts}</span>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                              {statusInfo?.completed && (
                                <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Score: {statusInfo.score}%
                                </span>
                              )}
                              <Button 
                                onClick={() => handleStartQuiz(q.id)}
                                disabled={loading || isMaxed}
                                className={cn("font-bold gap-1.5 shadow-sm rounded-xl px-5", statusInfo?.count > 0 && !isMaxed ? "bg-amber-600 hover:bg-amber-700" : "gradient-bg")}
                              >
                                <Play className="h-4 w-4 fill-current" />
                                {statusInfo?.count > 0 && !isMaxed ? "Retake Quiz" : "Start Quiz"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Upcoming Quizzes */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">○ Upcoming Quizzes</h3>
                  {upcomingQuizzes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-card/10">
                      No upcoming quizzes scheduled.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {upcomingQuizzes.map((q) => (
                        <div key={q.id} className="flex items-center justify-between p-5 rounded-2xl border border-border/40 bg-card/20 opacity-70 gap-4">
                          <div className="space-y-1">
                            <h4 className="font-bold text-base text-muted-foreground">{q.title}</h4>
                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
                              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Limit: {q.time_limit_minutes ? `${q.time_limit_minutes}m` : "No limit"}</span>
                              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Starts: {new Date(q.start_datetime).toLocaleString()}</span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-muted-foreground bg-accent px-3 py-1.5 rounded-lg flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5" /> Locked
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Closed Quizzes */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">✕ Closed Quizzes</h3>
                  {closedQuizzes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-card/10">
                      No past quizzes.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {closedQuizzes.map((q) => {
                        const statusInfo = studentAttempts[q.id];
                        return (
                          <div key={q.id} className="flex items-center justify-between p-5 rounded-2xl border border-border/30 bg-card/10 opacity-60 gap-4">
                            <div className="space-y-1">
                              <h4 className="font-semibold text-base text-muted-foreground">{q.title}</h4>
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
                                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Ended: {new Date(q.end_datetime).toLocaleString()}</span>
                              </div>
                            </div>
                            {statusInfo?.completed ? (
                              <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5" /> Scored: {statusInfo.score}%
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-muted-foreground">Closed</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/20 py-6 text-center text-xs text-muted-foreground mt-12 bg-sidebar/20">
        © {new Date().getFullYear()} KCT PULSE · Kumaraguru College of Technology
      </footer>
    </div>
  );
}

function LoaderIcon() {
  return (
    <svg className="animate-spin h-6 w-6 text-primary mx-auto" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
