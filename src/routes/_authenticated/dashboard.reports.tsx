import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusPill } from "./dashboard.index";
import { auth } from "@/lib/firebase";
import { 
  Users, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Award, 
  CheckCircle2, 
  MessageSquare,
  BarChart3,
  Calendar,
  Sparkles,
  Download,
  FileText
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDisplayName } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateSessionPDF } from "@/lib/pdf-generator";
import { exportSessionToCSV, exportSessionToExcel } from "@/lib/export-utils";

type Response = {
  id: string;
  answer: string;
  participant_id: string;
  created_at: string;
};

type Question = {
  id: string;
  title: string;
  type: "wordcloud" | "poll" | "quiz";
  options: string[];
  correct_answer: string | null;
  order_index: number;
  responses: Response[];
};

type Participant = {
  id: string;
  name: string;
  joined_at: string;
};

type Row = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  created_at: string;
  participants: Participant[];
  questions: Question[];
};

const OTHER_PROGRAM_VALUE = "others";

const PROGRAM_OPTIONS = [
  { degree: "B.E. Aeronautical Engineering", department: "Department of Aeronautical Engineering" },
  { degree: "B.E. Automobile Engineering", department: "Department of Automobile Engineering" },
  { degree: "B.E. Civil Engineering", department: "Department of Civil Engineering" },
  { degree: "B.E. Computer Science and Engineering", department: "Department of Computer Science and Engineering" },
  { degree: "B.E. Electrical and Electronics Engineering", department: "Department of Electrical and Electronics Engineering" },
  { degree: "B.E. Electronics and Communication Engineering", department: "Department of Electronics and Communication Engineering" },
  { degree: "B.E. Electronics and Instrumentation Engineering", department: "Department of Electronics and Instrumentation Engineering" },
  { degree: "B.E. Mechanical Engineering", department: "Department of Mechanical Engineering" },
  { degree: "B.E. Mechatronics Engineering", department: "Department of Mechatronics Engineering" },
  { degree: "B.Tech. Artificial Intelligence and Data Science", department: "Department of Artificial Intelligence and Data Science" },
  { degree: "B.Tech. Biotechnology", department: "Department of Biotechnology" },
  { degree: "B.Tech. Fashion Technology", department: "Department of Fashion Technology" },
  { degree: "B.Tech. Information Technology", department: "Department of Information Technology" },
  { degree: "B.Tech. Textile Technology", department: "Department of Textile Technology" },
];

export const Route = createFileRoute("/_authenticated/dashboard/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  
  // Custom PDF states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Row | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  const [collegeName, setCollegeName] = useState("Kumaraguru College of Technology");
  const [collegeLogoUrl, setCollegeLogoUrl] = useState("/kct-logo-pdf.png");
  const [departmentSelection, setDepartmentSelection] = useState("Department of Computer Science and Engineering");
  const [departmentName, setDepartmentName] = useState("Department of Computer Science and Engineering");
  const [reportTitle, setReportTitle] = useState("Student Assessment Report");
  const [registerNumber, setRegisterNumber] = useState("");
  const [semester, setSemester] = useState("III Year / V Semester");
  const [courseSelection, setCourseSelection] = useState("B.E. Computer Science and Engineering");
  const [courseName, setCourseName] = useState("B.E. Computer Science and Engineering");
  const [subject, setSubject] = useState("");
  const [facultyName, setFacultyName] = useState("");
  const [questionOverrides, setQuestionOverrides] = useState<Record<string, { marks: number; feedback: string }>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Use user from the route context (loaded securely in _authenticated beforeLoad)
  const { user } = Route.useRouteContext() as { user: any };

  const loadReports = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select(`
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
            options,
            correct_answer,
            order_index,
            responses (
              id,
              answer,
              participant_id,
              created_at
            )
          )
        `)
        .eq("creator_id", user.uid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error fetching reports:", error);
        const { toast } = await import("sonner");
        toast.error("Failed to load reports: " + error.message);
        throw error;
      }

      // Ensure questions are sorted by order_index
      const formattedData = (data as unknown as Row[])?.map(session => ({
        ...session,
        questions: [...(session.questions ?? [])].sort((a, b) => a.order_index - b.order_index)
      })) ?? [];

      setRows(formattedData);
    } catch (err: any) {
      console.error("Failed to load reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();

    if (!user) return;
    const channel = supabase
      .channel("reports-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `creator_id=eq.${user.uid}` }, loadReports)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, loadReports)
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, loadReports)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const toggleExpand = (id: string) => {
    setExpandedSessionId(expandedSessionId === id ? null : id);
  };

  const handleOpenModal = (session: Row) => {
    setSelectedSession(session);
    
    // Set sensible defaults
    setCollegeName("Kumaraguru College of Technology");
    setCollegeLogoUrl("/kct-logo-pdf.png");
    setDepartmentSelection("Department of Computer Science and Engineering");
    setDepartmentName("Department of Computer Science and Engineering");
    setReportTitle("Session Engagement & Performance Report");
    setSemester("III Year / V Semester");
    setCourseSelection("B.E. Computer Science and Engineering");
    setCourseName("B.E. Computer Science and Engineering");
    setSubject(session.title);
    setFacultyName(formatDisplayName(user?.displayName, user?.email));

    setModalOpen(true);
  };

  const handleGeneratePDF = async () => {
    if (!selectedSession) return;
    setIsGenerating(true);

    try {
      // 1. Map students
      const studentsList = selectedSession.participants.map(p => {
        let attempted = 0;
        let correct = 0;
        let wrong = 0;
        let quizQuestionsCount = 0;

        selectedSession.questions.forEach(q => {
          const response = q.responses?.find(r => r.participant_id === p.id);
          if (response) {
            attempted++;
            if (q.type === "quiz") {
              quizQuestionsCount++;
              if (response.answer === q.correct_answer) {
                correct++;
              } else {
                wrong++;
              }
            }
          }
        });

        const unanswered = selectedSession.questions.length - attempted;
        const accuracy = quizQuestionsCount > 0 
          ? (correct / quizQuestionsCount) * 100 
          : (attempted / (selectedSession.questions.length || 1)) * 100;
        
        let status: "Excellent" | "Good" | "Average" | "Needs Improvement" | "Absent" = "Average";
        if (accuracy >= 85) status = "Excellent";
        else if (accuracy >= 70) status = "Good";
        else if (accuracy >= 50) status = "Average";
        else status = "Needs Improvement";

        return {
          studentName: p.name,
          attendance: "Present" as const,
          totalQuestions: selectedSession.questions.length,
          attempted,
          correct,
          wrong,
          unanswered,
          accuracy,
          status
        };
      });

      // 2. Map questions
      const questionsList = selectedSession.questions.map((q, idx) => {
        let correctResponses = 0;
        let wrongResponses = 0;

        if (q.type === "quiz") {
          q.responses?.forEach(r => {
            if (r.answer === q.correct_answer) {
              correctResponses++;
            } else {
              wrongResponses++;
            }
          });
        } else {
          correctResponses = q.responses?.length || 0;
          wrongResponses = 0;
        }

        return {
          index: idx + 1,
          title: q.title,
          type: q.type,
          correctResponses,
          wrongResponses
        };
      });

      await generateSessionPDF(
        {
          sessionName: selectedSession.title,
          sessionCode: selectedSession.code,
          sessionDate: new Date(selectedSession.created_at).toLocaleDateString(),
          totalParticipants: selectedSession.participants.length,
          totalQuestions: selectedSession.questions.length,
          collegeName,
          departmentName,
          courseName,
          semester,
          subject,
          facultyName,
          reportTitle,
          logoUrl: collegeLogoUrl || null,
        },
        studentsList,
        questionsList
      );

      const { toast } = await import("sonner");
      toast.success("Session report generated and downloaded successfully!");
      setModalOpen(false);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      const { toast } = await import("sonner");
      toast.error("Failed to generate PDF: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">Detailed analytics and responses across your sessions.</p>

      {loading ? (
        <div className="mt-8 flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass mt-8 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Run a session first — analytics will appear here.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {rows.map((r) => {
            const isExpanded = expandedSessionId === r.id;
            const totalResponses = r.questions.reduce((sum, q) => sum + (q.responses?.length ?? 0), 0);
            
            return (
              <div key={r.id} className="glass rounded-2xl overflow-hidden transition-all duration-300 border border-white/5 hover:border-white/10">
                {/* Session Header Card */}
                <div 
                  onClick={() => toggleExpand(r.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none hover:bg-white/[0.02] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg truncate">{r.title}</h3>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono tracking-widest bg-accent/50 px-2 py-0.5 rounded">{r.code}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 self-end md:self-auto">
                    <div className="flex gap-4 text-center">
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Participants</div>
                        <div className="text-lg font-bold">{r.participants?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Questions</div>
                        <div className="text-lg font-bold">{r.questions?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Resp.</div>
                        <div className="text-lg font-bold">{totalResponses}</div>
                      </div>
                    </div>
                    <div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Session Analytics Panel with Tabs */}
                {isExpanded && (
                  <div className="border-t border-white/5 bg-black/10 p-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-200">
                    <Tabs defaultValue="analytics" className="w-full">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                        <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-white/5 border border-white/5 p-1 rounded-xl">
                          <TabsTrigger value="analytics" className="flex items-center gap-2 rounded-lg py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground text-xs font-semibold">
                            <BarChart3 className="h-4 w-4" /> Session Analytics
                          </TabsTrigger>
                          <TabsTrigger value="students" className="flex items-center gap-2 rounded-lg py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground text-xs font-semibold">
                            <Users className="h-4 w-4" /> Student Reports
                          </TabsTrigger>
                        </TabsList>
                        
                        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                          <Button
                            onClick={() => exportSessionToCSV(r)}
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold rounded-xl"
                          >
                            <Download className="h-4 w-4" /> Export CSV
                          </Button>
                          <Button
                            onClick={() => exportSessionToExcel(r)}
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10 text-xs font-semibold rounded-xl"
                          >
                            <Download className="h-4 w-4" /> Export Excel (.xlsx)
                          </Button>
                          <Button
                            onClick={() => handleOpenModal(r)}
                            size="sm"
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer shadow-lg shadow-blue-500/20 transition hover:shadow-blue-500/30"
                          >
                            <FileText className="h-4 w-4" /> PDF Report
                          </Button>
                        </div>
                      </div>
 
                      <TabsContent value="analytics" className="space-y-6">
                        <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2 mb-4">
                          <BarChart3 className="h-4 w-4" /> Question Breakdown
                        </h4>
 
                        {r.questions.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-4 text-center">
                            No questions were configured for this session.
                          </div>
                        ) : (
                          <div className="grid gap-6">
                            {r.questions.map((q, idx) => (
                              <QuestionAnalyticsCard key={q.id} index={idx} question={q} participants={r.participants} />
                            ))}
                          </div>
                        )}
                      </TabsContent>
 
                      <TabsContent value="students" className="space-y-6">
                        <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2 mb-4">
                          <Users className="h-4 w-4" /> Student Performance Register
                        </h4>
 
                        {r.participants.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-4 text-center">
                            No participants joined this session.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.01]">
                            <table className="w-full border-collapse text-left text-sm text-muted-foreground">
                              <thead className="border-b border-white/5 bg-white/[0.02] text-xs uppercase tracking-wider text-muted-foreground">
                                <tr>
                                  <th className="px-4 py-3 font-semibold">Student Name</th>
                                  <th className="px-4 py-3 font-semibold">Joined At</th>
                                  <th className="px-4 py-3 font-semibold text-center">Questions Attempted</th>
                                  <th className="px-4 py-3 font-semibold text-center">Quiz Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {r.participants.map((p) => {
                                  const quizQuestions = r.questions.filter((q) => q.type === "quiz");
                                  const responsesCount = r.questions.reduce((sum, q) => {
                                    const hasResponse = q.responses?.some((resp) => resp.participant_id === p.id);
                                    return sum + (hasResponse ? 1 : 0);
                                  }, 0);
                                  const correctAnswers = quizQuestions.reduce((sum, q) => {
                                    const response = q.responses?.find((resp) => resp.participant_id === p.id);
                                    const isCorrect = response && response.answer === q.correct_answer;
                                    return sum + (isCorrect ? 1 : 0);
                                  }, 0);
 
                                  return (
                                    <tr key={p.id} className="hover:bg-white/[0.02] transition">
                                      <td className="px-4 py-3.5 font-medium text-foreground">{p.name}</td>
                                      <td className="px-4 py-3.5 text-xs">
                                        {new Date(p.joined_at).toLocaleString()}
                                      </td>
                                      <td className="px-4 py-3.5 text-center font-mono">
                                        {responsesCount} / {r.questions.length}
                                      </td>
                                      <td className="px-4 py-3.5 text-center font-semibold text-emerald-400">
                                        {quizQuestions.length > 0 ? (
                                          <span>{correctAnswers} / {quizQuestions.length}</span>
                                        ) : (
                                          <span className="text-muted-foreground text-xs italic">N/A (No Quizzes)</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
 
      {/* PDF customization Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border text-card-foreground scrollbar-thin p-6 rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
              <FileText className="h-5 w-5 text-primary" /> Customize Session Assessment Report
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Customize the details below to generate a professional, consolidated PDF report for the entire session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Section 1: College Header */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/50 pb-1">
                College Header & Academic Info
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="departmentName" className="text-xs text-foreground">Department Name</Label>
                  <Select
                    value={departmentSelection}
                    onValueChange={(value) => {
                      setDepartmentSelection(value);
                      setDepartmentName(value === OTHER_PROGRAM_VALUE ? "" : value);
                    }}
                  >
                    <SelectTrigger id="departmentName" className="bg-card/40 border-border text-sm">
                      <SelectValue placeholder="Select Department Name" />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      avoidCollisions={false}
                      className="max-h-64"
                    >
                      {PROGRAM_OPTIONS.map((program) => (
                        <SelectItem key={program.department} value={program.department}>
                          {program.department}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_PROGRAM_VALUE}>Others</SelectItem>
                    </SelectContent>
                  </Select>
                  {departmentSelection === OTHER_PROGRAM_VALUE && (
                    <Input
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      placeholder="Type department name"
                      className="bg-card/40 border-border text-sm"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reportTitle" className="text-xs text-foreground">Report Title</Label>
                  <Input
                    id="reportTitle"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="semester" className="text-xs text-foreground">Year / Semester</Label>
                  <Input
                    id="semester"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="courseName" className="text-xs text-foreground">Course/Degree Name</Label>
                  <Select
                    value={courseSelection}
                    onValueChange={(value) => {
                      setCourseSelection(value);
                      setCourseName(value === OTHER_PROGRAM_VALUE ? "" : value);
                    }}
                  >
                    <SelectTrigger id="courseName" className="bg-card/40 border-border text-sm">
                      <SelectValue placeholder="Select Course/Degree Name" />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      avoidCollisions={false}
                      className="max-h-64"
                    >
                      {PROGRAM_OPTIONS.map((program) => (
                        <SelectItem key={program.degree} value={program.degree}>
                          {program.degree}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_PROGRAM_VALUE}>Others</SelectItem>
                    </SelectContent>
                  </Select>
                  {courseSelection === OTHER_PROGRAM_VALUE && (
                    <Input
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="Type course/degree name"
                      className="bg-card/40 border-border text-sm"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="facultyName" className="text-xs text-foreground">Faculty/Instructor Name</Label>
                  <Input
                    id="facultyName"
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="subject" className="text-xs text-foreground">Subject / Course Topic</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/50 pt-4">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="border-border hover:bg-accent text-foreground text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGeneratePDF}
              disabled={isGenerating}
              className="gap-2 text-xs cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Download PDF Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionAnalyticsCard({ index, question, participants }: { index: number; question: Question; participants: Participant[] }) {
  const responses = question.responses ?? [];
  const totalResp = responses.length;

  const typeLabels = {
    poll: "Poll (MCQ)",
    quiz: "Quiz",
    wordcloud: "Word Cloud"
  };

  const typeStyles = {
    poll: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    quiz: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    wordcloud: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
      {/* Question Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${typeStyles[question.type]}`}>
              {typeLabels[question.type]}
            </span>
          </div>
          <h5 className="font-medium text-foreground">{question.title}</h5>
        </div>
        <div className="text-xs text-muted-foreground text-left sm:text-right shrink-0">
          <span className="font-semibold text-foreground">{totalResp}</span> / {participants.length} responses
        </div>
      </div>

      {/* Render Analytics by Type */}
      <div className="pt-2">
        {question.type === "poll" && (
          <PollAnalytics options={question.options} responses={responses} />
        )}
        {question.type === "quiz" && (
          <QuizAnalytics options={question.options} correct={question.correct_answer} responses={responses} participants={participants} />
        )}
        {question.type === "wordcloud" && (
          <WordCloudAnalytics responses={responses} />
        )}
      </div>

      {/* ── Student Responses breakdown list ── */}
      <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Student Submissions ({responses.length})
        </div>
        {responses.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-1">No responses captured for this question.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {responses.map((r) => {
              const studentName = participants.find((p) => p.id === r.participant_id)?.name || "Anonymous Student";
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-xs hover:bg-white/[0.03] transition"
                >
                  <span className="font-semibold text-foreground/80 truncate max-w-[150px]">{studentName}</span>
                  <span className="rounded bg-black/40 border border-white/5 px-2 py-0.5 font-mono text-[11px] text-muted-foreground truncate max-w-[180px] select-all">
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

function PollAnalytics({ options, responses }: { options: string[]; responses: Response[] }) {
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
          <div key={o} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{o}</span>
              <span className="font-semibold">{c} ({pct}%)</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizAnalytics({ options, correct, responses, participants }: { options: string[]; correct: string | null; responses: Response[]; participants: Participant[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    options.forEach((o) => m.set(o, 0));
    responses.forEach((r) => m.set(r.answer, (m.get(r.answer) ?? 0) + 1));
    return m;
  }, [options, responses]);

  const total = responses.length || 1;
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  // Calculate scores for leaderboard
  const scores = useMemo(() => {
    const m = new Map<string, number>();
    responses.forEach((r) => {
      if (r.answer === correct) {
        m.set(r.participant_id, (m.get(r.participant_id) ?? 0) + 1);
      }
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [responses, correct]);

  return (
    <div className="space-y-5">
      {/* Option Breakdown */}
      <div className="space-y-3">
        {options.map((o) => {
          const c = counts.get(o) ?? 0;
          const pct = Math.round((c / total) * 100);
          const isCorrect = o === correct;

          return (
            <div key={o} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={`flex items-center gap-1.5 ${isCorrect ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}>
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  {o}
                  {isCorrect && <span className="text-[10px] uppercase font-bold text-emerald-500/80 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Correct</span>}
                </span>
                <span className="font-semibold">{c} ({pct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${isCorrect ? "bg-emerald-500" : "bg-neutral-500"}`} 
                  style={{ width: `${pct}%` }} 
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quiz Leaderboard */}
      {correct && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
            <Award className="h-3.5 w-3.5 text-amber-400" /> TOP PARTICIPANTS (CORRECT ANSWERS)
          </div>
          <div className="space-y-1.5">
            {scores.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">No correct responses submitted yet.</div>
            ) : (
              scores.map(([pid, s], idx) => (
                <div key={pid} className="flex items-center justify-between rounded bg-white/[0.01] border border-white/5 px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-amber-500">#{idx + 1}</span>
                    <span>{nameById.get(pid) ?? "Anonymous"}</span>
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{s} pt</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WordCloudAnalytics({ responses }: { responses: Response[] }) {
  const words = useMemo(() => {
    const counts = new Map<string, number>();
    responses.forEach((r) => {
      r.answer.split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).forEach((w) => {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [responses]);

  if (words.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">No words submitted yet.</div>;
  }

  const maxCount = words[0]?.[1] ?? 1;

  return (
    <div className="space-y-4">
      {/* Cloud-like frequency layout */}
      <div className="flex flex-wrap items-center justify-center gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.01]">
        {words.map(([w, c]) => {
          // Scale size between 0.8rem and 1.8rem
          const scale = 0.8 + (c / maxCount) * 1.0;
          const colors = [
            "text-purple-400", "text-pink-400", "text-blue-400", 
            "text-indigo-400", "text-cyan-400", "text-teal-400"
          ];
          const colorClass = colors[Math.abs(w.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length];

          return (
            <span 
              key={w} 
              className={`font-semibold transition-all hover:scale-110 duration-200 cursor-default ${colorClass}`}
              style={{ fontSize: `${scale}rem` }}
              title={`Submitted ${c} time${c > 1 ? "s" : ""}`}
            >
              {w}
              <span className="text-[10px] opacity-40 ml-0.5">({c})</span>
            </span>
          );
        })}
      </div>

      {/* Linear frequency ranking */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {words.slice(0, 9).map(([w, c]) => (
          <div key={w} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.01] border border-white/5 text-xs">
            <span className="text-muted-foreground truncate">{w}</span>
            <span className="font-semibold bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded font-mono">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
