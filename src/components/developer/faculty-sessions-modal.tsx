import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/routes/_authenticated/dashboard.index";
import { fetchFacultyReports } from "@/services/reports/report-service";
import type { Row, Question, Participant, Response } from "@/types/reports.types";
import { exportSessionToCSV, exportSessionToExcel } from "@/lib/export-utils";
import { generateSessionPDF } from "@/lib/pdf-generator";
import { isAnswerCorrect } from "@/lib/answer-evaluator";
import { formatStudentDisplayName, cn } from "@/lib/utils";
import {
  FileText,
  FileSpreadsheet,
  Download,
  Search,
  Users,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Award,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";

export interface FacultySessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  faculty: {
    creator_id: string;
    name: string;
    email: string;
    isOnline?: boolean;
  } | null;
}

export function FacultySessionsModal({
  isOpen,
  onClose,
  faculty,
}: FacultySessionsModalProps) {
  const [sessions, setSessions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!faculty?.creator_id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFacultyReports(faculty.creator_id);
      setSessions(data);
    } catch (err: any) {
      console.error("[FacultySessionsModal] Failed to fetch reports:", err);
      setError(err?.message || "Failed to load faculty sessions");
    } finally {
      setLoading(false);
    }
  }, [faculty?.creator_id]);

  useEffect(() => {
    if (isOpen && faculty?.creator_id) {
      setSearchQuery("");
      setExpandedSessionId(null);
      loadReports();
    } else {
      setSessions([]);
    }
  }, [isOpen, faculty?.creator_id, loadReports]);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  // Aggregate totals
  const totalStats = useMemo(() => {
    const totalSess = sessions.length;
    let totalParts = 0;
    let totalQuestions = 0;
    let totalResponses = 0;

    sessions.forEach((s) => {
      totalParts += s.participants.length;
      totalQuestions += s.questions.length;
      s.questions.forEach((q) => {
        totalResponses += q.responses?.length || 0;
      });
    });

    return { totalSess, totalParts, totalQuestions, totalResponses };
  }, [sessions]);

  // PDF Generator for a single session
  const handleDownloadPDF = async (session: Row) => {
    setDownloadingPdfId(session.id);
    try {
      const respMap = new Map<string, Map<string, Response>>();
      session.questions.forEach((q) => {
        q.responses?.forEach((r) => {
          let pMap = respMap.get(r.participant_id);
          if (!pMap) {
            pMap = new Map();
            respMap.set(r.participant_id, pMap);
          }
          pMap.set(q.id, r);
        });
      });

      const totalQuestionsCount = session.questions.length;
      let totalQuizMarks = 0;
      let totalWordcloudMarks = 0;
      const quizQuestionsList: Question[] = [];

      session.questions.forEach((q) => {
        const persistedMarks = q.marks ?? q.points ?? 0;
        if (q.type === "quiz") {
          quizQuestionsList.push(q);
          totalQuizMarks += persistedMarks;
        } else if (q.type === "wordcloud") {
          totalWordcloudMarks += persistedMarks;
        }
      });
      const marksTotal = totalQuizMarks + totalWordcloudMarks;
      const quizQuestionsCount = quizQuestionsList.length;

      const studentsList = session.participants.map((p) => {
        const pMap = respMap.get(p.id);
        let attempted = 0;
        let correct = 0;
        let wrong = 0;
        let marksObtained = 0;

        session.questions.forEach((q) => {
          const persistedMarks = q.marks ?? q.points ?? 0;
          const response = pMap?.get(q.id);
          if (response) {
            attempted++;
            if (q.type === "quiz") {
              if (isAnswerCorrect(response.answer, q.correct_answer, q.options)) {
                correct++;
                marksObtained += persistedMarks;
              } else {
                wrong++;
              }
            } else if (q.type === "wordcloud") {
              marksObtained += persistedMarks;
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
          studentName: formatStudentDisplayName(p.name, p.id),
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

      const questionsList = session.questions.map((q, idx) => {
        let correctResponses = 0;
        let wrongResponses = 0;

        if (q.type === "quiz") {
          q.responses?.forEach((r) => {
            if (isAnswerCorrect(r.answer, q.correct_answer, q.options)) {
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
          sessionName: session.title,
          sessionCode: session.code,
          sessionDate: new Date(session.created_at).toLocaleDateString(),
          totalParticipants: session.participants.length,
          totalQuestions: session.questions.length,
          collegeName: "Kumaraguru College of Technology",
          departmentName: "Department of Computer Science and Engineering",
          courseName: "B.E. Computer Science and Engineering",
          semester: "Semester 5",
          subject: session.title,
          facultyName: faculty?.name || "Faculty",
          reportTitle: "Session Engagement & Performance Report",
          logoUrl: "/kct-logo-pdf.png",
        },
        studentsList,
        questionsList
      );

      const { toast } = await import("sonner");
      toast.success(`PDF report downloaded for "${session.title}"`);
    } catch (err: any) {
      console.error("[FacultySessionsModal] PDF download error:", err);
      const { toast } = await import("sonner");
      toast.error("Failed to generate PDF: " + (err?.message || "Unknown error"));
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleDownloadExcel = async (session: Row) => {
    try {
      exportSessionToExcel(session);
      const { toast } = await import("sonner");
      toast.success(`Excel report downloaded for "${session.title}"`);
    } catch (err: any) {
      const { toast } = await import("sonner");
      toast.error("Failed to export Excel: " + (err?.message || "Unknown error"));
    }
  };

  const handleDownloadCSV = async (session: Row) => {
    try {
      exportSessionToCSV(session);
      const { toast } = await import("sonner");
      toast.success(`CSV report downloaded for "${session.title}"`);
    } catch (err: any) {
      const { toast } = await import("sonner");
      toast.error("Failed to export CSV: " + (err?.message || "Unknown error"));
    }
  };

  if (!faculty) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl glass rounded-2xl sm:rounded-3xl border border-border/80 shadow-2xl p-5 sm:p-7 max-h-[90vh] overflow-y-auto min-w-0">
        <DialogHeader className="text-left border-b border-border/40 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/20 text-primary font-black text-lg shrink-0 border border-primary/30">
                {faculty.name.charAt(0) || "F"}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                  <span className="truncate">{faculty.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border shrink-0",
                      faculty.isOnline
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {faculty.isOnline ? "● Online" : "Offline"}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {faculty.email}
                </p>
              </div>
            </div>

            {/* Quick Refresh */}
            <Button
              size="sm"
              variant="outline"
              onClick={loadReports}
              disabled={loading}
              className="h-8 text-xs font-bold gap-1.5 self-start sm:self-center"
            >
              <Sparkles className={cn("h-3.5 w-3.5 text-primary", loading && "animate-spin")} />
              Refresh Data
            </Button>
          </div>

          {/* Aggregate Stat Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            <div className="bg-card/60 border border-border/60 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Sessions
              </span>
              <strong className="text-sm sm:text-base font-extrabold text-foreground">
                {totalStats.totalSess}
              </strong>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Students
              </span>
              <strong className="text-sm sm:text-base font-extrabold text-blue-400">
                {totalStats.totalParts}
              </strong>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Questions
              </span>
              <strong className="text-sm sm:text-base font-extrabold text-cyan-400">
                {totalStats.totalQuestions}
              </strong>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Responses
              </span>
              <strong className="text-sm sm:text-base font-extrabold text-purple-400">
                {totalStats.totalResponses}
              </strong>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="space-y-4 pt-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions by title or code..."
              className="pl-9 h-9 text-xs rounded-xl bg-card/60 border-border/60"
            />
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">
                Fetching session reports and responses...
              </p>
            </div>
          ) : error ? (
            <div className="glass rounded-xl p-6 text-center space-y-2 border border-destructive/20 bg-destructive/5">
              <p className="text-xs font-bold text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={loadReports} className="text-xs">
                Retry
              </Button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center text-xs text-muted-foreground">
              {searchQuery ? "No sessions match your search." : "No sessions conducted by this faculty yet."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((session) => {
                const isExpanded = expandedSessionId === session.id;
                const totalResponses = session.questions.reduce(
                  (sum, q) => sum + (q.responses?.length || 0),
                  0
                );

                return (
                  <div
                    key={session.id}
                    className="glass rounded-xl border border-border/60 overflow-hidden transition hover:border-border"
                  >
                    {/* Session Summary Card */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-foreground truncate">
                            {session.title}
                          </h4>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-bold">
                            {session.code}
                          </span>
                          <StatusPill status={session.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(session.created_at).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-blue-400" />
                            <strong>{session.participants.length}</strong> Students
                          </span>
                          <span className="flex items-center gap-1">
                            <HelpCircle className="h-3 w-3 text-cyan-400" />
                            <strong>{session.questions.length}</strong> Questions
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 text-purple-400" />
                            <strong>{totalResponses}</strong> Responses
                          </span>
                        </div>
                      </div>

                      {/* Download & Action Buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* Download PDF */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadPDF(session)}
                          disabled={downloadingPdfId === session.id}
                          className="h-7 px-2 text-[11px] font-bold gap-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          title="Download Official PDF Report"
                        >
                          {downloadingPdfId === session.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          PDF
                        </Button>

                        {/* Export Excel */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadExcel(session)}
                          className="h-7 px-2 text-[11px] font-bold gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                          title="Download Excel Spreadsheet (.xlsx)"
                        >
                          <FileSpreadsheet className="h-3 w-3" />
                          Excel
                        </Button>

                        {/* Export CSV */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadCSV(session)}
                          className="h-7 px-2 text-[11px] font-bold gap-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                          title="Download CSV file"
                        >
                          <Download className="h-3 w-3" />
                          CSV
                        </Button>

                        {/* Expand Details */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpandedSessionId(isExpanded ? null : session.id)
                          }
                          className="h-7 px-2 text-[11px] font-bold gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <>
                              Hide Details <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              View Analytics <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Session Analytics */}
                    {isExpanded && (
                      <div className="border-t border-border/40 p-4 bg-black/20 space-y-4">
                        {/* Questions Breakdown */}
                        <div>
                          <h5 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                            <HelpCircle className="h-3.5 w-3.5 text-primary" /> Questions Overview ({session.questions.length})
                          </h5>
                          {session.questions.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No questions created in this session.</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {session.questions.map((q, idx) => (
                                <div
                                  key={q.id}
                                  className="p-2.5 rounded-lg bg-card/60 border border-border/60 text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-foreground truncate">
                                      Q{idx + 1}. {q.title}
                                    </span>
                                    <span className="uppercase text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 font-bold">
                                      {q.type}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>
                                      Responses: <strong>{q.responses?.length || 0}</strong>
                                    </span>
                                    {q.correct_answer && (
                                      <span className="text-emerald-400 font-medium">
                                        Answer: {q.correct_answer}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Participants / Students Breakdown */}
                        <div>
                          <h5 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-blue-400" /> Joined Students ({session.participants.length})
                          </h5>
                          {session.participants.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No students joined this session.</p>
                          ) : (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-card/40">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-card text-muted-foreground uppercase text-[10px] font-bold border-b border-border/60 sticky top-0">
                                  <tr>
                                    <th className="p-2">#</th>
                                    <th className="p-2">Student Name</th>
                                    <th className="p-2">Joined At</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                  {session.participants.map((p, pIdx) => (
                                    <tr key={p.id} className="hover:bg-white/[0.02]">
                                      <td className="p-2 text-muted-foreground">{pIdx + 1}</td>
                                      <td className="p-2 font-medium text-foreground">
                                        {formatStudentDisplayName(p.name, p.id)}
                                      </td>
                                      <td className="p-2 text-muted-foreground">
                                        {p.joined_at ? new Date(p.joined_at).toLocaleTimeString() : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
