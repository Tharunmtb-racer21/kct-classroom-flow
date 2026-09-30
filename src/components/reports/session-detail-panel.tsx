import { useMemo } from "react";
import { Users, Award, BarChart3, Download, FileText } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  CartesianGrid,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Question, Response, Row, Participant } from "@/types/reports.types";
import { QuestionAnalyticsCard } from "./question-analytics-card";

export interface SessionDetailPanelProps {
  session: Row;
  openCustomizeMarks: (session: Row) => void;
  exportSessionToCSV: (session: Row) => void;
  exportSessionToExcel: (session: Row) => void;
  handleOpenModal: (session: Row) => void;
  questionOverrides: Record<string, { marks: number; feedback: string }>;
  modalOpen: boolean;
  selectedSessionId: string | null | undefined;
}

export function SessionDetailPanel({
  session,
  openCustomizeMarks,
  exportSessionToCSV,
  exportSessionToExcel,
  handleOpenModal,
  questionOverrides,
  modalOpen,
  selectedSessionId,
}: SessionDetailPanelProps) {
  // Pre-index responses and memoize derived calculations
  const { participantStats, questionChartData } = useMemo(() => {
    // 1. Pre-index responses by participant: participantId -> Map<questionId, Response>
    const respMap = new Map<string, Map<string, Response>>();
    const quizQuestions = session.questions.filter((q) => q.type === "quiz");

    session.questions.forEach((q) => {
      q.responses?.forEach((resp) => {
        let pMap = respMap.get(resp.participant_id);
        if (!pMap) {
          pMap = new Map();
          respMap.set(resp.participant_id, pMap);
        }
        pMap.set(q.id, resp);
      });
    });

    // 2. Pre-calculate statistics per participant in a single linear pass
    const stats = new Map<
      string,
      {
        responsesCount: number;
        correctAnswers: number;
        marksObt: number;
        marksTot: number;
        quizTotal: number;
      }
    >();

    session.participants.forEach((p) => {
      const pResponses = respMap.get(p.id);
      let responsesCount = 0;
      let correctAnswers = 0;
      let marksObt = 0;
      let marksTot = 0;

      session.questions.forEach((q) => {
        const persistedMarks = q.points ?? q.marks ?? 0;
        const overrideMarks =
          modalOpen && selectedSessionId === session.id
            ? questionOverrides[q.id]?.marks
            : undefined;
        const qMarks: number = overrideMarks != null ? overrideMarks : persistedMarks;

        const resp = pResponses?.get(q.id);
        if (resp) {
          responsesCount++;
        }

        if (q.type === "quiz") {
          marksTot += qMarks;
          if (resp && resp.answer === q.correct_answer) {
            correctAnswers++;
            marksObt += qMarks;
          }
        } else if (q.type === "wordcloud") {
          marksTot += qMarks;
          if (resp) {
            marksObt += qMarks;
          }
        }
      });

      stats.set(p.id, {
        responsesCount,
        correctAnswers,
        marksObt,
        marksTot,
        quizTotal: quizQuestions.length,
      });
    });

    // 3. Pre-calculate chart data
    const chartData = session.questions.map((q, qIdx) => {
      const totalAnswers = q.responses?.length || 0;
      let correctAnswers = 0;
      if (q.type === "quiz") {
        q.responses?.forEach((resp) => {
          if (resp.answer === q.correct_answer) correctAnswers++;
        });
      } else {
        correctAnswers = totalAnswers;
      }

      return {
        name: `Q${qIdx + 1}`,
        title: q.title,
        type: q.type,
        responses: totalAnswers,
        correct: correctAnswers,
        incorrect: Math.max(0, totalAnswers - correctAnswers),
      };
    });

    return { participantStats: stats, questionChartData: chartData };
  }, [session, questionOverrides, modalOpen, selectedSessionId]);

  return (
    <div className="border-t border-white/5 bg-black/10 p-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-200">
      <Tabs defaultValue="analytics" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-white/5 border border-white/5 p-1 rounded-xl">
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 rounded-lg py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground text-xs font-semibold"
            >
              <BarChart3 className="h-4 w-4" /> Session Analytics
            </TabsTrigger>
            <TabsTrigger
              value="students"
              className="flex items-center gap-2 rounded-lg py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-foreground text-xs font-semibold"
            >
              <Users className="h-4 w-4" /> Student Reports
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            <Button
              onClick={() => openCustomizeMarks(session)}
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold rounded-xl"
            >
              <Award className="h-4 w-4" /> Customize Marks
            </Button>
            <Button
              onClick={() => exportSessionToCSV(session)}
              size="sm"
              variant="outline"
              className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold rounded-xl"
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              onClick={() => exportSessionToExcel(session)}
              size="sm"
              variant="outline"
              className="gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10 text-xs font-semibold rounded-xl"
            >
              <Download className="h-4 w-4" /> Export Excel (.xlsx)
            </Button>
            <Button
              onClick={() => handleOpenModal(session)}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-xl cursor-pointer shadow-lg shadow-blue-500/20 transition hover:shadow-blue-500/30"
            >
              <FileText className="h-4 w-4" /> PDF Report
            </Button>
          </div>
        </div>

        <TabsContent value="analytics" className="space-y-6">
          {session.questions.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-primary" /> Session Question Accuracy & Response Stream
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {session.questions.length} Questions Plotted
                </span>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={questionChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: "currentColor", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 10 }} />
                    <RechartsTooltip
                      allowEscapeViewBox={{ x: true, y: true }}
                      offset={14}
                      wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "0.75rem",
                        fontSize: "0.75rem",
                        color: "hsl(var(--foreground))",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                      }}
                      formatter={(val: any, name: any) => [
                        `${val} submissions`,
                        name === "correct" ? "Correct / Positive" : "Incorrect / Other",
                      ]}
                      labelFormatter={(label, payload) => `${label}: ${payload?.[0]?.payload?.title || ""}`}
                    />
                    <RechartsLegend
                      verticalAlign="bottom"
                      height={28}
                      formatter={(val) => (
                        <span className="text-[11px] font-semibold text-foreground/90">
                          {val === "correct" ? "Correct Answers" : "Incorrect / Other"}
                        </span>
                      )}
                    />
                    <Bar dataKey="correct" fill="#10b981" radius={[4, 4, 0, 0]} name="correct" />
                    <Bar dataKey="incorrect" fill="#f43f5e" radius={[4, 4, 0, 0]} name="incorrect" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4" /> Question Breakdown
          </h4>

          {session.questions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No questions were configured for this session.
            </div>
          ) : (
            <div className="grid gap-6">
              {session.questions.map((q, idx) => (
                <QuestionAnalyticsCard
                  key={q.id}
                  index={idx}
                  question={q}
                  participants={session.participants}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="students" className="space-y-6">
          <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2 mb-4">
            <Users className="h-4 w-4" /> Student Performance Register
          </h4>

          {session.participants.length === 0 ? (
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
                    <th className="px-4 py-3 font-semibold text-center">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {session.participants.map((p) => {
                    const stats = participantStats.get(p.id) || {
                      responsesCount: 0,
                      correctAnswers: 0,
                      marksObt: 0,
                      marksTot: 0,
                      quizTotal: 0,
                    };

                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition">
                        <td className="px-4 py-3.5 font-medium text-foreground">{p.name}</td>
                        <td className="px-4 py-3.5 text-xs">
                          {new Date(p.joined_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-center font-mono">
                          {stats.responsesCount} / {session.questions.length}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-emerald-400">
                          {stats.quizTotal > 0 ? (
                            <span>
                              {stats.correctAnswers} / {stats.quizTotal}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              N/A (No Quizzes)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold">
                          {stats.marksTot > 0 ? (
                            <span className="text-amber-400">
                              {stats.marksObt} / {stats.marksTot}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">N/A</span>
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
  );
}

