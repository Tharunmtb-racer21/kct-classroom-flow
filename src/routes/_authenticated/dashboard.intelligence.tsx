/**
 * dashboard.intelligence.tsx
 * 🧠 Classroom Intelligence Dashboard for Faculty
 * Truthful, deterministic classroom interaction and engagement diagnostics.
 * Powered by authentic question responses, attempt rates, and concept accuracy.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { auth } from "@/lib/firebase";
import {
  calculateStudentEngagement,
  calculateClassroomEngagement,
  type StudentEngagementAnalysis,
  type ClassroomEngagementBreakdown,
} from "@/lib/ml-engine";
import { analyzeWeakTopics, type WeakTopicAnalysis } from "@/lib/weak-topic-engine";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Users,
  RefreshCw,
  Sparkles,
  BookOpen,
  PieChart as PieChartIcon,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { throttle } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/intelligence")({
  component: ClassroomIntelligenceDashboard,
});

export default function ClassroomIntelligenceDashboard() {
  let routeUser: any = null;
  try {
    const routeContext = Route.useRouteContext();
    routeUser = (routeContext as any)?.user;
  } catch {
    // Fallback if rendered outside RouterProvider tree
  }
  const facultyUid = routeUser?.uid || auth.currentUser?.uid;

  const [sessions, setSessions] = useState<
    Array<{ id: string; title: string; code: string; created_at: string }>
  >([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [studentAnalyses, setStudentAnalyses] = useState<StudentEngagementAnalysis[]>([]);
  const [classroomStats, setClassroomStats] = useState<ClassroomEngagementBreakdown | null>(null);
  const [weakTopicData, setWeakTopicData] = useState<WeakTopicAnalysis | null>(null);

  // 1. Load Sessions scoped strictly to the authenticated faculty
  useEffect(() => {
    async function loadFacultySessions() {
      if (!facultyUid) return;
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("id, title, code, created_at")
          .eq("creator_id", facultyUid)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[Classroom Intelligence] Failed to load faculty sessions:", error);
          setLoadError("Failed to load faculty sessions: " + error.message);
          return;
        }

        if (data) {
          setSessions(data);
          if (data.length > 0) {
            setSelectedSessionId("all");
          }
        }
      } catch (err: any) {
        console.error("[Classroom Intelligence] Unexpected session fetch error:", err);
        setLoadError(err?.message || "Failed to load sessions");
      }
    }
    loadFacultySessions();
  }, [facultyUid]);

  // 2. Fetch and Compute Classroom Intelligence Analytics
  const runAnalytics = useCallback(async () => {
    if (!facultyUid) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      // Scoped reports-style embedded query — resolves parent + children in a single scoped request
      let query = supabase
        .from("sessions")
        .select(`
          id,
          title,
          code,
          created_at,
          participants (
            id,
            name,
            session_id,
            joined_at
          ),
          questions!session_id (
            id,
            title,
            type,
            correct_answer,
            responses (
              id,
              answer,
              participant_id,
              question_id
            )
          )
        `)
        .eq("creator_id", facultyUid);

      if (selectedSessionId !== "all") {
        query = query.eq("id", selectedSessionId);
      }

      const { data: scopedSessions, error: queryErr } = await query;

      if (queryErr) {
        console.error("[Classroom Intelligence] Query failure:", queryErr);
        throw new Error(queryErr.message);
      }

      if (!scopedSessions || scopedSessions.length === 0) {
        setStudentAnalyses([]);
        setClassroomStats(null);
        setWeakTopicData(null);
        setIsLoading(false);
        return;
      }

      // Flatten items for the selected scope
      const allQuestions = scopedSessions.flatMap((s: any) => s.questions || []);
      const allParticipants = scopedSessions.flatMap((s: any) => s.participants || []);
      const allResponses = allQuestions.flatMap((q: any) => q.responses || []);

      if (allParticipants.length === 0 || allQuestions.length === 0) {
        setStudentAnalyses([]);
        setClassroomStats(null);
        setWeakTopicData(null);
        setIsLoading(false);
        return;
      }

      // Pre-index questions by ID
      const questionsById = new Map<string, (typeof allQuestions)[0]>();
      allQuestions.forEach((q: any) => {
        questionsById.set(q.id, q);
      });

      // Pre-index responses by participant and by question in an O(R) pass
      const responsesByParticipant = new Map<string, typeof allResponses>();
      const responsesByQuestion = new Map<string, typeof allResponses>();

      allResponses.forEach((r: any) => {
        let pList = responsesByParticipant.get(r.participant_id);
        if (!pList) {
          pList = [];
          responsesByParticipant.set(r.participant_id, pList);
        }
        pList.push(r);

        let qList = responsesByQuestion.get(r.question_id);
        if (!qList) {
          qList = [];
          responsesByQuestion.set(r.question_id, qList);
        }
        qList.push(r);
      });

      // Compute Student Engagement Scores using authentic observable features
      const studentMap: StudentEngagementAnalysis[] = allParticipants.map((p: any) => {
        // Scope session questions to the student's specific session
        const sessionQuestions =
          selectedSessionId === "all"
            ? scopedSessions.find((s: any) => s.id === p.session_id)?.questions || allQuestions
            : allQuestions;
        const totalSessionQuestions = sessionQuestions.length;
        const totalQuizQuestions = sessionQuestions.filter((q: any) => q.type === "quiz").length;

        const studentResponses = responsesByParticipant.get(p.id) || [];
        const attemptedQuestions = new Set(studentResponses.map((r: any) => r.question_id)).size;

        let correctCount = 0;
        let quizCount = 0;
        let pollCount = 0;
        let wordcloudCount = 0;

        for (const resp of studentResponses) {
          const matchedQ = questionsById.get(resp.question_id);
          if (matchedQ) {
            if (matchedQ.type === "quiz") {
              quizCount += 1;
              if (
                matchedQ.correct_answer &&
                resp.answer.trim().toLowerCase() === matchedQ.correct_answer.trim().toLowerCase()
              ) {
                correctCount += 1;
              }
            } else if (matchedQ.type === "poll") {
              pollCount += 1;
            } else if (matchedQ.type === "wordcloud") {
              wordcloudCount += 1;
            }
          }
        }

        return calculateStudentEngagement({
          participantId: p.id,
          name: p.name,
          sessionId: p.session_id,
          joinedAt: p.joined_at,
          totalSessionQuestions,
          attemptedQuestions,
          skippedQuestions: Math.max(0, totalSessionQuestions - attemptedQuestions),
          correctAnswers: correctCount,
          totalQuizQuestions,
          pollParticipationCount: pollCount,
          wordcloudParticipationCount: wordcloudCount,
          responseTimingsMs: [], // Authentically empty (not tracked)
          historicalAccuracyPercentages: [], // Authentically empty (not faked)
        });
      });

      setStudentAnalyses(studentMap);

      // Compute Classroom Aggregates
      const classEng = calculateClassroomEngagement(studentMap);
      setClassroomStats(classEng);

      // Compute Question & Concept Performance & Pedagogical Recommendations
      const questionPerfList = allQuestions.map((q: any) => {
        const qResponses = responsesByQuestion.get(q.id) || [];
        return {
          questionId: q.id,
          title: q.title,
          type: q.type as "quiz" | "poll" | "wordcloud",
          correctAnswer: q.correct_answer,
          responses: qResponses.map((r: any) => ({ answer: r.answer })),
          totalParticipantsInSession:
            allParticipants.filter((p: any) => {
              const parent = scopedSessions.find((s: any) =>
                s.questions?.some((sq: any) => sq.id === q.id),
              );
              return parent ? p.session_id === parent.id : false;
            }).length || allParticipants.length,
        };
      });

      const weakTopicsAnalysis = analyzeWeakTopics(questionPerfList);
      setWeakTopicData(weakTopicsAnalysis);
    } catch (err: any) {
      console.error("[Classroom Intelligence] Failed to compute analytics:", err);
      setLoadError(err?.message || "Failed to load classroom analytics");
    } finally {
      setIsLoading(false);
    }
  }, [facultyUid, selectedSessionId]);

  useEffect(() => {
    runAnalytics();
  }, [runAnalytics]);

  // Realtime subscription scoped to current faculty's sessions
  useEffect(() => {
    if (!facultyUid) return;
    const throttledRun = throttle(runAnalytics, 10000);
    const channel = supabase
      .channel(`classroom-intelligence-sync-${facultyUid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `creator_id=eq.${facultyUid}` },
        () => throttledRun(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, () => {
        throttledRun();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => {
        throttledRun();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [facultyUid, runAnalytics]);

  // Memoized Chart Data: Cohort Engagement Distribution
  const engagementDistributionData = useMemo(() => {
    if (!classroomStats) return [];
    return [
      {
        name: "Highly Engaged (≥75%)",
        value: classroomStats.studentDistribution.highlyEngaged,
        color: "#10b981",
      },
      {
        name: "Moderately Engaged (45–74%)",
        value: classroomStats.studentDistribution.moderatelyEngaged,
        color: "#f59e0b",
      },
      {
        name: "Needs Attention (<45%)",
        value: classroomStats.studentDistribution.needsAttention,
        color: "#f43f5e",
      },
    ].filter((d) => d.value > 0);
  }, [classroomStats]);

  // Memoized Chart Data: Question Concept Accuracy Comparison
  const topicChartData = useMemo(() => {
    if (!weakTopicData?.topics || weakTopicData.topics.length === 0) return [];
    return weakTopicData.topics.map((t) => ({
      name: t.topicName.length > 14 ? `${t.topicName.slice(0, 14)}…` : t.topicName,
      fullName: t.topicName,
      accuracy: t.accuracyPercentage,
      skipRate: t.skipRatePercentage,
      attemptedCount: t.attemptedCount,
      questionCount: t.questionCount,
      color:
        t.status === "weak"
          ? "#f43f5e"
          : t.status === "moderate"
            ? "#f59e0b"
            : "#10b981",
    }));
  }, [weakTopicData]);

  // Memoized Chart Data: Student Score Spectrum
  const scoreSpectrumData = useMemo(() => {
    const brackets = [
      { range: "0–25%", label: "Starter", count: 0 },
      { range: "26–50%", label: "Developing", count: 0 },
      { range: "51–75%", label: "Active", count: 0 },
      { range: "76–100%", label: "Mastery", count: 0 },
    ];
    if (studentAnalyses.length === 0) {
      return brackets;
    }
    studentAnalyses.forEach((s) => {
      const sc = s.engagementScore;
      if (sc <= 25) brackets[0].count++;
      else if (sc <= 50) brackets[1].count++;
      else if (sc <= 75) brackets[2].count++;
      else brackets[3].count++;
    });
    return brackets;
  }, [studentAnalyses]);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Classroom <span className="gradient-text">Intelligence</span>
              </h1>
              <p className="text-sm text-muted-foreground">
                Deterministic student engagement model, learning insights, and performance diagnostics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select Session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sessions Combined ({sessions.length})</SelectItem>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={runAnalytics} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Query Error State */}
      {loadError && (
        <Card className="border-rose-500/50 bg-rose-500/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Telemetry Query Error</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={runAnalytics}
              className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Stats & Graphical Engagement Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Engagement Donut Chart Card */}
        <Card className="shadow-md hover:shadow-lg transition lg:col-span-1 flex flex-col justify-between">
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center justify-between font-semibold">
              <span>Cohort Distribution</span>
              <PieChartIcon className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-xl font-bold flex items-center justify-between pt-1">
              <span>Overall Score</span>
              <span className="text-2xl font-black text-primary">
                {classroomStats ? `${classroomStats.overallScore}%` : "—"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-36 w-full flex items-center justify-center">
              {engagementDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={engagementDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {engagementDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
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
                        padding: "8px 12px",
                      }}
                      formatter={(val: any) => [`${val} participants`, "Cohort"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-muted-foreground italic text-center py-6">
                  {isLoading
                    ? "Evaluating cohorts..."
                    : classroomStats?.hasSufficientData
                      ? "Evaluating cohorts..."
                      : "Awaiting participant responses..."}
                </div>
              )}
            </div>
            <Progress value={classroomStats?.overallScore || 0} className="h-1.5 mb-1.5" />
            <p className="text-[11px] text-muted-foreground leading-tight">
              Derived from attempt rate (35%), quiz accuracy (35%), format variety (18%), and presence (12%). Response timing is not recorded.
            </p>
          </CardContent>
        </Card>

        {/* Highly Engaged Card */}
        <Card className="shadow-md border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between font-semibold text-emerald-600 dark:text-emerald-400">
              <span>Highly Engaged 🟢</span>
              <CheckCircle2 className="h-4 w-4" />
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-foreground">
              {classroomStats?.studentDistribution.highlyEngaged ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Participants scoring ≥ 75% in engagement model with consistent responses.
            </p>
          </CardContent>
        </Card>

        {/* Moderately Engaged Card */}
        <Card className="shadow-md border-l-4 border-l-amber-500 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between font-semibold text-amber-600 dark:text-amber-400">
              <span>Moderately Engaged 🟡</span>
              <Users className="h-4 w-4" />
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-foreground">
              {classroomStats?.studentDistribution.moderatelyEngaged ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Participants scoring 45–74% consistency. Likely to benefit from interactive prompts.
            </p>
          </CardContent>
        </Card>

        {/* Needs Attention Card */}
        <Card className="shadow-md border-l-4 border-l-rose-500 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between font-semibold text-rose-600 dark:text-rose-400">
              <span>Needs Attention 🔴</span>
              <AlertTriangle className="h-4 w-4" />
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-foreground">
              {classroomStats?.studentDistribution.needsAttention ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Participants with high skip rate or score &lt;45%. Flagged for gentle mentoring.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pedagogical Recommendation Banner */}
      <Card className="bg-gradient-to-r from-primary/10 via-accent/30 to-background border-primary/20 shadow-md">
        <CardContent className="pt-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="p-3 rounded-xl bg-primary text-primary-foreground shadow-lg shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base">Faculty Pedagogical Recommendation</h3>
              <Badge variant="secondary" className="text-xs">
                Rule-Based Recommendation
              </Badge>
            </div>
            <p className="text-sm text-foreground/90 font-medium">
              {weakTopicData?.recommendation ||
                "Insufficient classroom responses to generate pedagogical recommendations. Host live questions to collect data."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Topic Performance & Learning Trend Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Weak Topic Detection */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Question & Concept Performance</CardTitle>
                <CardDescription>
                  Evaluates concept accuracy, skip rate, and student error patterns
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {weakTopicData?.topics && weakTopicData.topics.length > 0 ? (
              <div className="space-y-4">
                {/* Visual Topic Accuracy Bar Chart */}
                <div className="rounded-xl border border-border/60 bg-accent/20 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" /> Concept Accuracy Comparison (%)
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topicChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="name" angle={-15} textAnchor="end" tick={{ fill: "currentColor", fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: "currentColor", fontSize: 10 }} unit="%" />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "0.75rem",
                            color: "hsl(var(--foreground))",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                          }}
                          formatter={(val: any, name: any, item: any) => [
                            `${val}% (Attempted: ${item.payload.attemptedCount}, Skip: ${item.payload.skipRate}%)`,
                            "Accuracy",
                          ]}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                        />
                        <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                          {topicChartData.map((entry, index) => (
                            <Cell key={`bar-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {weakTopicData.topics.map((t) => (
                  <div
                    key={t.topicName}
                    className="p-3.5 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <span>{t.statusBadge}</span>
                        <span>{t.topicName}</span>
                      </div>
                      <span
                        className={`text-sm font-extrabold ${
                          t.status === "weak"
                            ? "text-rose-500"
                            : t.status === "moderate"
                              ? "text-amber-500"
                              : "text-emerald-500"
                        }`}
                      >
                        {t.accuracyPercentage}%
                      </span>
                    </div>
                    <Progress
                      value={t.accuracyPercentage}
                      className={`h-2 ${
                        t.status === "weak"
                          ? "[&>div]:bg-rose-500"
                          : t.status === "moderate"
                            ? "[&>div]:bg-amber-500"
                            : "[&>div]:bg-emerald-500"
                      }`}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>Questions: {t.questionCount}</span>
                      <span>Attempted: {t.attemptedCount}</span>
                      <span>Skip Rate: {t.skipRatePercentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="font-semibold text-sm">Not enough historical concept data</p>
                <p className="text-xs">Host quiz questions to analyze concept performance.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Participant Learning Scores & Distribution */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Participant Engagement Scores</CardTitle>
                <CardDescription>Scoped session participant records breakdown</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {studentAnalyses.length > 0 ? (
              <div className="space-y-4">
                {/* Visual Score Spectrum Area Chart */}
                <div className="rounded-xl border border-border/60 bg-accent/20 p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" /> Class Score Distribution Curve
                    </span>
                    <span className="font-mono text-primary font-bold">{studentAnalyses.length} Participants</span>
                  </div>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scoreSpectrumData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scoreCurveGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="range" tick={{ fill: "currentColor", fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 10 }} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "0.75rem",
                            color: "hsl(var(--foreground))",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                          }}
                          formatter={(val: any) => [`${val} participants`, "Cohort"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#scoreCurveGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                  {studentAnalyses.map((s) => (
                    <div
                      key={s.participantId}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background hover:bg-accent/30 transition"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{s.name}</span>
                          <Badge
                            variant="outline"
                            className={
                              s.engagementLevel === "highly_engaged"
                                ? "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                                : s.engagementLevel === "moderately_engaged"
                                  ? "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                                  : "border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30"
                            }
                          >
                            {s.engagementLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Attempt Rate: {s.attemptRatePercentage}% | Accuracy: {s.accuracyPercentage}%
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-extrabold text-base text-primary">
                          {s.engagementScore}{" "}
                          <span className="text-xs font-normal text-muted-foreground">/100</span>
                        </div>
                        <div className="text-xs font-medium text-muted-foreground flex items-center justify-end gap-1">
                          <span>Trend: {s.trendIcon}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="font-semibold text-sm">
                  {sessions.length === 0 ? "No sessions created" : "No participant activity recorded"}
                </p>
                <p className="text-xs">
                  {sessions.length === 0
                    ? "Create and launch a classroom session to begin tracking intelligence."
                    : "Participants joining live sessions will appear here automatically."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
