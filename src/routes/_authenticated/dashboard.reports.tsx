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
  FileText,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  CartesianGrid,
  Cell,
} from "recharts";
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
import { formatDisplayName, throttle } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateSessionPDF } from "@/lib/pdf-generator";
import { exportSessionToCSV, exportSessionToExcel } from "@/lib/export-utils";

import type { Response, Question, Participant, Row } from "@/types/reports.types";
import { SessionDetailPanel } from "@/components/reports/session-detail-panel";
import { QuestionAnalyticsCard } from "@/components/reports/question-analytics-card";

const OTHER_PROGRAM_VALUE = "others";
const SEMESTER_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const PROGRAM_OPTIONS = [
  { degree: "B.E. Aeronautical Engineering", department: "Department of Aeronautical Engineering" },
  { degree: "B.E. Automobile Engineering", department: "Department of Automobile Engineering" },
  { degree: "B.E. Civil Engineering", department: "Department of Civil Engineering" },
  {
    degree: "B.E. Computer Science and Engineering",
    department: "Department of Computer Science and Engineering",
  },
  {
    degree: "B.E. Electrical and Electronics Engineering",
    department: "Department of Electrical and Electronics Engineering",
  },
  {
    degree: "B.E. Electronics and Communication Engineering",
    department: "Department of Electronics and Communication Engineering",
  },
  {
    degree: "B.E. Electronics and Instrumentation Engineering",
    department: "Department of Electronics and Instrumentation Engineering",
  },
  { degree: "B.E. Mechanical Engineering", department: "Department of Mechanical Engineering" },
  { degree: "B.E. Mechatronics Engineering", department: "Department of Mechatronics Engineering" },
  {
    degree: "B.Tech. Artificial Intelligence and Data Science",
    department: "Department of Artificial Intelligence and Data Science",
  },
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
  const [departmentSelection, setDepartmentSelection] = useState(
    "Department of Computer Science and Engineering",
  );
  const [departmentName, setDepartmentName] = useState(
    "Department of Computer Science and Engineering",
  );
  const [reportTitle, setReportTitle] = useState("Student Assessment Report");
  const [registerNumber, setRegisterNumber] = useState("");
  const [semester, setSemester] = useState("Semester 5");
  const [courseSelection, setCourseSelection] = useState("B.E. Computer Science and Engineering");
  const [courseName, setCourseName] = useState("B.E. Computer Science and Engineering");
  const [subject, setSubject] = useState("");
  const [facultyName, setFacultyName] = useState("");
  const [questionOverrides, setQuestionOverrides] = useState<
    Record<string, { marks: number; feedback: string }>
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [customizeMarksModalOpen, setCustomizeMarksModalOpen] = useState(false);
  const [sessionForMarksCustomization, setSessionForMarksCustomization] = useState<Row | null>(null);
  const [customMarksMap, setCustomMarksMap] = useState<Record<string, number>>({});
  const [isSavingCustomMarks, setIsSavingCustomMarks] = useState(false);

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
            options,
            correct_answer,
            order_index,
            points,
            responses (
              id,
              answer,
              participant_id,
              created_at
            )
          )
        `,
        )
        .eq("creator_id", user.uid)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error fetching reports:", error);
        const { toast } = await import("sonner");
        toast.error("Failed to load reports: " + error.message);
        throw error;
      }

      // Ensure questions are sorted by order_index
      const formattedData =
        (data as unknown as Row[])?.map((session) => ({
          ...session,
          questions: [...(session.questions ?? [])].sort((a, b) => a.order_index - b.order_index),
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

    const throttledLoadReports = throttle(loadReports, 10000);

    const channel = supabase
      .channel(`reports-live-sync-${user.uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `creator_id=eq.${user.uid}` },
        () => {
          throttledLoadReports();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => {
        throttledLoadReports();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, () => {
        throttledLoadReports();
      })
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
    setSemester("Semester 5");
    setCourseSelection("B.E. Computer Science and Engineering");
    setCourseName("B.E. Computer Science and Engineering");
    setSubject(session.title);
    setFacultyName(formatDisplayName(user?.displayName, user?.email));

    // Initialize marks allocation for each question from persisted marks
    const overrides: Record<string, { marks: number; feedback: string }> = {};
    session.questions.forEach((q) => {
      overrides[q.id] = { marks: q.marks ?? q.points ?? 1, feedback: "" };
    });
    setQuestionOverrides(overrides);

    setModalOpen(true);
  };

  // Helper: compute total marks for a participant using question's persisted marks
  const computeMarks = (participant: Participant, session: Row) => {
    let obtained = 0;
    let total = 0;
    session.questions.forEach((q) => {
      const persistedMarks = q.marks ?? q.points ?? 1;
      // If modal is actively open and has an override for this session, use it; otherwise persisted
      const qMarks = (modalOpen && selectedSession?.id === session.id && questionOverrides[q.id]?.marks != null)
        ? questionOverrides[q.id].marks
        : persistedMarks;

      if (q.type === "quiz") {
        total += qMarks;
        const response = q.responses?.find((r) => r.participant_id === participant.id);
        if (response && response.answer === q.correct_answer) {
          obtained += qMarks;
        }
      } else if (q.type === "wordcloud") {
        // Word cloud: participation marks — if they responded, full marks
        total += qMarks;
        const response = q.responses?.find((r) => r.participant_id === participant.id);
        if (response) {
          obtained += qMarks;
        }
      }
    });
    return { obtained, total };
  };

  const openCustomizeMarks = (session: Row) => {
    setSessionForMarksCustomization(session);
    const initialMap: Record<string, number> = {};
    session.questions.forEach((q) => {
      initialMap[q.id] = q.marks ?? q.points ?? 1;
    });
    setCustomMarksMap(initialMap);
    setCustomizeMarksModalOpen(true);
  };

  const handleSaveCustomMarks = async () => {
    if (!sessionForMarksCustomization) return;
    setIsSavingCustomMarks(true);
    try {
      const updatePromises = sessionForMarksCustomization.questions.map((q) => {
        const newMarks = customMarksMap[q.id] !== undefined ? Math.max(0, Number(customMarksMap[q.id]) || 0) : (q.marks ?? q.points ?? 1);
        return supabase
          .from("questions")
          .update({ points: newMarks })
          .eq("id", q.id);
      });

      const results = await Promise.all(updatePromises);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const { toast } = await import("sonner");
      toast.success("Marks customized and saved to database! All scores updated.");
      setCustomizeMarksModalOpen(false);
      await loadReports();
    } catch (err: any) {
      console.error("Failed to save custom marks:", err);
      const { toast } = await import("sonner");
      toast.error(err.message || "Failed to update marks");
    } finally {
      setIsSavingCustomMarks(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!selectedSession) return;
    setIsGenerating(true);

    try {
      // 1. Pre-index responses for O(1) lookups
      const respMap = new Map<string, Map<string, Response>>();
      selectedSession.questions.forEach((q) => {
        q.responses?.forEach((r) => {
          let pMap = respMap.get(r.participant_id);
          if (!pMap) {
            pMap = new Map();
            respMap.set(r.participant_id, pMap);
          }
          pMap.set(q.id, r);
        });
      });

      const totalQuestionsCount = selectedSession.questions.length;
      let totalQuizMarks = 0;
      let totalWordcloudMarks = 0;
      const quizQuestionsList: Question[] = [];

      selectedSession.questions.forEach((q) => {
        const persistedMarks = q.marks ?? q.points ?? 1;
        const qMarks =
          questionOverrides[q.id]?.marks != null ? questionOverrides[q.id].marks : persistedMarks;

        if (q.type === "quiz") {
          quizQuestionsList.push(q);
          totalQuizMarks += qMarks;
        } else if (q.type === "wordcloud") {
          totalWordcloudMarks += qMarks;
        }
      });
      const marksTotal = totalQuizMarks + totalWordcloudMarks;
      const quizQuestionsCount = quizQuestionsList.length;

      // 2. Map students in a single linear pass
      const studentsList = selectedSession.participants.map((p) => {
        const pMap = respMap.get(p.id);
        let attempted = 0;
        let correct = 0;
        let wrong = 0;
        let marksObtained = 0;

        selectedSession.questions.forEach((q) => {
          const persistedMarks = q.marks ?? q.points ?? 1;
          const qMarks =
            questionOverrides[q.id]?.marks != null ? questionOverrides[q.id].marks : persistedMarks;

          const response = pMap?.get(q.id);
          if (response) {
            attempted++;
            if (q.type === "quiz") {
              if (response.answer === q.correct_answer) {
                correct++;
                marksObtained += qMarks;
              } else {
                wrong++;
              }
            } else if (q.type === "wordcloud") {
              marksObtained += qMarks;
            }
          }
        });

        const unanswered = totalQuestionsCount - attempted;
        const accuracy =
          quizQuestionsCount > 0
            ? (correct / quizQuestionsCount) * 100
            : (attempted / (totalQuestionsCount || 1)) * 100;

        let status: "Excellent" | "Good" | "Average" | "Needs Improvement" | "Absent" = "Average";
        if (accuracy >= 85) status = "Excellent";
        else if (accuracy >= 70) status = "Good";
        else if (accuracy >= 50) status = "Average";
        else status = "Needs Improvement";

        return {
          studentName: p.name,
          attendance: "Present" as const,
          totalQuestions: totalQuestionsCount,
          attempted,
          correct,
          wrong,
          unanswered,
          accuracy,
          status,
          marksObtained,
          marksTotal,
        };
      });

      // 3. Map questions
      const questionsList = selectedSession.questions.map((q, idx) => {
        let correctResponses = 0;
        let wrongResponses = 0;

        if (q.type === "quiz") {
          q.responses?.forEach((r) => {
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
          wrongResponses,
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
        questionsList,
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
      <p className="mt-1 text-sm text-muted-foreground">
        Detailed analytics and responses across your sessions.
      </p>

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
            const totalResponses = r.questions.reduce(
              (sum, q) => sum + (q.responses?.length ?? 0),
              0,
            );

            return (
              <div
                key={r.id}
                className="glass rounded-2xl overflow-hidden transition-all duration-300 border border-white/5 hover:border-white/10"
              >
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
                      <span className="font-mono tracking-widest bg-accent/50 px-2 py-0.5 rounded">
                        {r.code}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />{" "}
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 self-end md:self-auto">
                    <div className="flex gap-4 text-center">
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Participants
                        </div>
                        <div className="text-lg font-bold">{r.participants?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Questions
                        </div>
                        <div className="text-lg font-bold">{r.questions?.length ?? 0}</div>
                      </div>
                      <div className="px-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Total Resp.
                        </div>
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

                {/* Expanded Session Analytics Panel with Tabs (Memoized & Indexed) */}
                {isExpanded && (
                  <SessionDetailPanel
                    session={r}
                    openCustomizeMarks={openCustomizeMarks}
                    exportSessionToCSV={exportSessionToCSV}
                    exportSessionToExcel={exportSessionToExcel}
                    handleOpenModal={handleOpenModal}
                    questionOverrides={questionOverrides}
                    modalOpen={modalOpen}
                    selectedSessionId={selectedSession?.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PDF customization Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        {" "}
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border text-card-foreground scrollbar-thin p-6 rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
              <FileText className="h-5 w-5 text-primary" /> Customize Session Assessment Report
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Customize the details below to generate a professional, consolidated PDF report for
              the entire session.
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
                  <Label htmlFor="departmentName" className="text-xs text-foreground">
                    Department Name
                  </Label>
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
                  <Label htmlFor="reportTitle" className="text-xs text-foreground">
                    Report Title
                  </Label>
                  <Input
                    id="reportTitle"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="semester" className="text-xs text-foreground">
                    Year / Semester
                  </Label>
                  <Select value={semester} onValueChange={setSemester}>
                    <SelectTrigger id="semester" className="bg-card/40 border-border text-sm">
                      <SelectValue placeholder="Select Semester" />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      avoidCollisions={false}
                    >
                      {SEMESTER_OPTIONS.map((semesterNumber) => (
                        <SelectItem key={semesterNumber} value={`Semester ${semesterNumber}`}>
                          Semester {semesterNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="courseName" className="text-xs text-foreground">
                    Course/Degree Name
                  </Label>
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
                  <Label htmlFor="facultyName" className="text-xs text-foreground">
                    Faculty/Instructor Name
                  </Label>
                  <Input
                    id="facultyName"
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                    className="bg-card/40 border-border text-sm"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="subject" className="text-xs text-foreground">
                    Subject / Course Topic
                  </Label>
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

            {/* Section 2: Marks Allocation per Question */}
            {selectedSession && selectedSession.questions.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/50 pb-1 flex items-center gap-2">
                  <Award className="h-4 w-4" /> Marks Allocation per Question
                </h4>
                <p className="text-xs text-muted-foreground">
                  Set custom marks for each question. These marks will be used to calculate student scores in the report and PDF.
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                  {selectedSession.questions.map((q, idx) => {
                    const typeLabel = q.type === "quiz" ? "Quiz" : q.type === "poll" ? "Poll" : "Word Cloud";
                    const typeColor = q.type === "quiz" ? "text-emerald-400" : q.type === "poll" ? "text-blue-400" : "text-purple-400";
                    return (
                      <div
                        key={q.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">Q{idx + 1}</span>
                            <span className={`text-[10px] font-semibold uppercase ${typeColor}`}>{typeLabel}</span>
                          </div>
                          <p className="text-xs text-foreground truncate mt-0.5">{q.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Label className="text-xs text-muted-foreground">Marks:</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={questionOverrides[q.id]?.marks ?? 1}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                              setQuestionOverrides((prev) => ({
                                ...prev,
                                [q.id]: { ...prev[q.id], marks: val, feedback: prev[q.id]?.feedback ?? "" },
                              }));
                            }}
                            className="w-16 bg-card/40 border-border text-sm text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <span className="text-xs font-semibold text-amber-400">Total Marks</span>
                  <span className="text-sm font-bold text-amber-400">
                    {Object.values(questionOverrides).reduce((sum, o) => sum + (o.marks ?? 0), 0)}
                  </span>
                </div>
              </div>
            )}

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

      {/* Quick Customize Marks Modal */}
      <Dialog open={customizeMarksModalOpen} onOpenChange={setCustomizeMarksModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-background border border-border text-foreground p-6 sm:p-7 rounded-2xl shadow-2xl scrollbar-thin">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-400">
              <Award className="h-5 w-5" /> Customize Question Marks
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Adjust how many marks each question is worth in &ldquo;{sessionForMarksCustomization?.title}&rdquo;, or set 0 for No Marks / Ungraded questions.
              Changes are saved directly to the database and will immediately recalculate all student scores and rankings.
            </DialogDescription>
          </DialogHeader>

          {sessionForMarksCustomization && (
            <div className="space-y-4 py-2">
              {/* Summary and Presets Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Calculated Total Marks</div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400 flex items-center gap-2 flex-wrap">
                    <span>{Object.values(customMarksMap).reduce((sum, v) => sum + (Number(v) || 0), 0)} Marks</span>
                    {Object.values(customMarksMap).reduce((sum, v) => sum + (Number(v) || 0), 0) === 0 && (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        No Marks (Ungraded)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground mr-1">Presets:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 px-2.5"
                    onClick={() => {
                      const updated: Record<string, number> = {};
                      sessionForMarksCustomization.questions.forEach((q) => {
                        updated[q.id] = 0;
                      });
                      setCustomMarksMap(updated);
                    }}
                  >
                    No Marks (0)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2.5"
                    onClick={() => {
                      const updated: Record<string, number> = {};
                      sessionForMarksCustomization.questions.forEach((q) => {
                        updated[q.id] = 1;
                      });
                      setCustomMarksMap(updated);
                    }}
                  >
                    All 1 Mark
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2.5"
                    onClick={() => {
                      const updated: Record<string, number> = {};
                      sessionForMarksCustomization.questions.forEach((q) => {
                        updated[q.id] = 2;
                      });
                      setCustomMarksMap(updated);
                    }}
                  >
                    All 2 Marks
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2.5"
                    onClick={() => {
                      const updated: Record<string, number> = {};
                      sessionForMarksCustomization.questions.forEach((q) => {
                        updated[q.id] = 5;
                      });
                      setCustomMarksMap(updated);
                    }}
                  >
                    All 5 Marks
                  </Button>
                </div>
              </div>

              {/* Questions List with Marks Inputs */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin">
                {sessionForMarksCustomization.questions.map((q, idx) => {
                  const currentVal = customMarksMap[q.id] ?? (q.marks ?? q.points ?? 1);
                  const typeLabel = q.type === "quiz" ? "Quiz" : q.type === "poll" ? "Poll" : "Word Cloud";
                  const typeColor =
                    q.type === "quiz"
                      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                      : q.type === "poll"
                        ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                        : "text-purple-400 border-purple-500/20 bg-purple-500/10";

                  return (
                    <div
                      key={q.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60 hover:bg-card/90 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold text-muted-foreground">Q{idx + 1}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${typeColor}`}>
                            {typeLabel}
                          </span>
                          {currentVal === 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground border border-border">
                              No Marks
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground font-medium leading-snug break-words">{q.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCustomMarksMap((prev) => ({
                              ...prev,
                              [q.id]: currentVal === 0 ? 1 : 0,
                            }));
                          }}
                          className={`h-8 text-xs px-2.5 font-medium border ${
                            currentVal === 0
                              ? "border-muted-foreground/30 text-muted-foreground bg-muted/40 hover:bg-muted/60"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {currentVal === 0 ? "Set 1 Mark" : "No Marks (0)"}
                        </Button>
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`marks-input-${q.id}`} className="text-xs text-muted-foreground font-medium">
                            Marks:
                          </Label>
                          <Input
                            id={`marks-input-${q.id}`}
                            type="number"
                            min={0}
                            step={1}
                            value={currentVal}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setCustomMarksMap((prev) => ({
                                ...prev,
                                [q.id]: isNaN(val) ? 0 : Math.max(0, val),
                              }));
                            }}
                            className="w-20 h-8 text-center font-mono font-bold bg-background border-border text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border/50 pt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setCustomizeMarksModalOpen(false)}
              className="text-xs border-border"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveCustomMarks}
              disabled={isSavingCustomMarks}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1.5"
            >
              {isSavingCustomMarks ? "Saving Marks..." : "Save & Update Scores"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

