import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  CheckSquare, 
  Square,
  AlertTriangle,
  Award,
  CheckCircle,
  XCircle,
  FileDown,
  Loader2,
  BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quiz/$id")({
  head: () => ({
    meta: [
      { title: "Quiz Session · KCT PULSE" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuizPlayerPage,
});

function QuizPlayerPage() {
  const { id: quizId } = Route.useParams();
  const navigate = Route.useNavigate();

  // Local student state
  const [studentInfo, setStudentInfo] = useState<{ name: string; section: string } | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  
  // Quiz taking states
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({}); // questionId -> original keys comma separated
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Load student profile & verify attempt on mount
  useEffect(() => {
    const saved = localStorage.getItem("kctpulse-student-info");
    if (!saved) {
      toast.error("Please verify your name and section to access the quiz.");
      navigate({ to: "/student/quizzes" });
      return;
    }
    const info = JSON.parse(saved) as { name: string; section: string };
    setStudentInfo(info);

    (async () => {
      try {
        // 1. Fetch student ID
        const { data: student, error: studentErr } = await supabase
          .from("students")
          .select("id")
          .eq("name", info.name.trim())
          .eq("section", info.section)
          .maybeSingle();

        if (studentErr || !student) {
          throw new Error("Student record not found. Please register first.");
        }

        setStudentId(student.id);

        // 2. Fetch quiz details
        const { data: quiz, error: quizErr } = await supabase
          .from("quizzes")
          .select("*")
          .eq("id", quizId)
          .single();

        if (quizErr || !quiz) {
          throw new Error("Quiz not found.");
        }

        // Check if quiz is currently open
        const now = Date.now();
        const start = new Date(quiz.start_datetime).getTime();
        const end = new Date(quiz.end_datetime).getTime();
        if (now < start || now > end) {
          throw new Error("This quiz is not currently open for submissions.");
        }

        // 3. Fetch or verify in_progress attempt
        const { data: activeAttempt, error: attemptErr } = await supabase
          .from("quiz_attempts")
          .select("*")
          .eq("quiz_id", quizId)
          .eq("student_id", student.id)
          .eq("status", "in_progress")
          .maybeSingle();

        if (attemptErr) throw attemptErr;
        if (!activeAttempt) {
          throw new Error("No active attempt found. Start the quiz from the portal.");
        }

        // 4. Fetch all questions for this quiz
        const { data: qList, error: qErr } = await supabase
          .from("quiz_questions")
          .select("*")
          .eq("quiz_id", quizId)
          .order("question_no", { ascending: true });

        if (qErr || !qList || qList.length === 0) {
          throw new Error("No questions found in this quiz.");
        }

        // 5. Setup Shuffling
        let questionOrder = activeAttempt.question_order as string[];
        let optionOrder = activeAttempt.option_order as Record<string, string[]>;

        let updateNeeded = false;

        // Shuffle questions if needed
        if (!questionOrder) {
          const ids = qList.map((q) => q.id);
          if (quiz.shuffle_questions) {
            // Fisher-Yates Shuffle
            for (let i = ids.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [ids[i], ids[j]] = [ids[j], ids[i]];
            }
          }
          questionOrder = ids;
          updateNeeded = true;
        }

        // Shuffle options per question if needed
        if (!optionOrder) {
          optionOrder = {};
          qList.forEach((q) => {
            const keys = ["A", "B", "C", "D", "E"].filter((k) => {
              const optVal = q[`option_${k.toLowerCase()}` as keyof typeof q];
              return optVal !== null && optVal !== undefined && String(optVal).trim() !== "";
            });

            if (quiz.shuffle_answers) {
              for (let i = keys.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [keys[i], keys[j]] = [keys[j], keys[i]];
              }
            }
            optionOrder[q.id] = keys;
          });
          updateNeeded = true;
        }

        // Persist shuffled orders to DB
        if (updateNeeded) {
          const { error: patchErr } = await supabase
            .from("quiz_attempts")
            .update({
              question_order: questionOrder,
              option_order: optionOrder
            })
            .eq("id", activeAttempt.id);

          if (patchErr) throw patchErr;
        }

        // Reorder questions list locally based on questionOrder
        const orderedQuestions = questionOrder
          .map((id) => qList.find((q) => q.id === id))
          .filter(Boolean);

        setQuestions(orderedQuestions);
        setAttempt({ ...activeAttempt, question_order: questionOrder, option_order: optionOrder });

        // Load existing answers (autosave recovery)
        const { data: savedResponses } = await supabase
          .from("quiz_responses")
          .select("question_id, selected_answer")
          .eq("attempt_id", activeAttempt.id);

        const initialAnswers: Record<string, string> = {};
        savedResponses?.forEach((r) => {
          initialAnswers[r.question_id] = r.selected_answer || "";
        });
        setSelectedAnswers(initialAnswers);

        // Setup timer countdown
        if (quiz.time_limit_minutes) {
          const elapsedMs = Date.now() - new Date(activeAttempt.started_at).getTime();
          const limitMs = quiz.time_limit_minutes * 60 * 1000;
          const leftMs = limitMs - elapsedMs;

          if (leftMs <= 0) {
            setSecondsLeft(0);
          } else {
            setSecondsLeft(Math.floor(leftMs / 1000));
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Authentication error.");
        navigate({ to: "/student/quizzes" });
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId, navigate]);

  // Live Timer Countdown Effect
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleSubmitQuiz(true); // Auto submit on expiry
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Autosave response to Supabase
  const handleAnswerSelect = async (questionId: string, answerKeys: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answerKeys }));

    try {
      // 1. Check if response already exists
      const { data: existingResponse } = await supabase
        .from("quiz_responses")
        .select("id")
        .eq("attempt_id", attempt.id)
        .eq("question_id", questionId)
        .maybeSingle();

      if (existingResponse) {
        await supabase
          .from("quiz_responses")
          .update({ selected_answer: answerKeys })
          .eq("id", existingResponse.id);
      } else {
        await supabase
          .from("quiz_responses")
          .insert({
            attempt_id: attempt.id,
            question_id: questionId,
            selected_answer: answerKeys
          });
      }
    } catch (err) {
      console.error("Autosave response failed:", err);
    }
  };

  const handleToggleOption = (question: any, optionKey: string) => {
    const isMulti = question.question_type === "Multiple Correct";
    const currentAnswer = selectedAnswers[question.id] || "";
    
    let nextAnswer = "";
    if (isMulti) {
      const keys = currentAnswer ? currentAnswer.split(",") : [];
      if (keys.includes(optionKey)) {
        nextAnswer = keys.filter(k => k !== optionKey).sort().join(",");
      } else {
        nextAnswer = [...keys, optionKey].sort().join(",");
      }
    } else {
      nextAnswer = optionKey;
    }

    handleAnswerSelect(question.id, nextAnswer);
  };

  // Grade & Submit Quiz
  const handleSubmitQuiz = async (isAutoSubmit = false) => {
    if (submitting) return;
    setSubmitting(true);

    if (isAutoSubmit) {
      toast.warning("Time's up! Submitting your quiz automatically.");
    }

    try {
      // 1. Fetch all questions for scoring reference
      const { data: qList } = await supabase
        .from("quiz_questions")
        .select("id, correct_answer, points")
        .eq("quiz_id", quizId);

      if (!qList) throw new Error("Failed to load questions for grading.");

      // 2. Fetch all saved student responses
      const { data: responses } = await supabase
        .from("quiz_responses")
        .select("*")
        .eq("attempt_id", attempt.id);

      let totalPoints = 0;
      let awardedPoints = 0;

      // Grade each question
      const gradingPromises = qList.map(async (q) => {
        totalPoints += Number(q.points);
        
        const response = responses?.find((r) => r.question_id === q.id);
        const selected = response?.selected_answer || "";
        
        const isCorrect = selected === q.correct_answer;
        const ptsAwarded = isCorrect ? Number(q.points) : 0;
        
        if (isCorrect) {
          awardedPoints += ptsAwarded;
        }

        // Update individual response grading in DB
        if (response) {
          await supabase
            .from("quiz_responses")
            .update({
              is_correct: isCorrect,
              points_awarded: ptsAwarded
            })
            .eq("id", response.id);
        } else {
          // If student didn't answer, create empty graded response
          await supabase
            .from("quiz_responses")
            .insert({
              attempt_id: attempt.id,
              question_id: q.id,
              selected_answer: "",
              is_correct: false,
              points_awarded: 0
            });
        }
      });

      await Promise.all(gradingPromises);

      // Calculate final percentage score
      const finalScore = totalPoints > 0 ? Math.round((awardedPoints / totalPoints) * 100) : 0;

      // 3. Mark attempt as submitted
      const { error: submitErr } = await supabase
        .from("quiz_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          status: "submitted",
          score: finalScore
        })
        .eq("id", attempt.id);

      if (submitErr) throw submitErr;

      toast.success("Quiz submitted successfully!");
      
      // Reload attempt data to show results
      const { data: updatedAttempt } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("id", attempt.id)
        .single();
      
      setAttempt(updatedAttempt);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format remaining seconds into MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  };

  // Generate jsPDF Report
  const handleExportPDF = async () => {
    if (!attempt || attempt.status !== "submitted") return;

    try {
      const doc = new jsPDF();
      const title = "KCT PULSE Quiz Results Report";
      const studentName = studentInfo?.name || "Student";
      const sectionName = studentInfo?.section || "N/A";
      const score = attempt.score !== null ? `${attempt.score}%` : "N/A";
      const date = new Date(attempt.submitted_at).toLocaleString();

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text(title, 20, 20);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Student Name: ${studentName}`, 20, 32);
      doc.text(`Class/Section: ${sectionName}`, 20, 38);
      doc.text(`Completed At: ${date}`, 20, 44);
      doc.text(`Total Score: ${score}`, 20, 50);

      // Fetch graded review rows
      const { data: quiz } = await supabase.from("quizzes").select("title").eq("id", quizId).single();
      doc.text(`Quiz Title: ${quiz?.title || "N/A"}`, 20, 56);

      // Add questions list table
      const { data: reviewQuestions } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("question_no");

      const { data: reviewResponses } = await supabase
        .from("quiz_responses")
        .select("*")
        .eq("attempt_id", attempt.id);

      const tableData = reviewQuestions?.map((q, idx) => {
        const resp = reviewResponses?.find(r => r.question_id === q.id);
        return [
          q.question_no || idx + 1,
          q.question_text,
          resp?.selected_answer || "Unanswered",
          q.correct_answer,
          resp?.is_correct ? "Correct" : "Incorrect",
          resp?.points_awarded || 0
        ];
      }) || [];

      autoTable(doc, {
        startY: 65,
        head: [["No.", "Question", "Your Answer", "Correct Answer", "Result", "Points"]],
        body: tableData,
      });

      doc.save(`${studentName.replace(/\s+/g, "_")}_Quiz_Report.pdf`);
      toast.success("PDF report downloaded!");
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-semibold">Initializing quiz attempt...</p>
      </div>
    );
  }

  const currentQ = questions[currentIdx];

  // RENDER: Review Results Mode
  if (attempt && attempt.status === "submitted") {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-12">
        <header className="border-b border-border/40 py-4 bg-sidebar/20 backdrop-blur-md sticky top-0 z-20">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6">
            <h1 className="font-extrabold text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Quiz Results
            </h1>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/student/quizzes" })} className="font-semibold">
              Return to Portal
            </Button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
          <div className="glass rounded-2xl border border-border/60 p-8 text-center space-y-4 shadow-xl">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Award className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">Quiz Completed!</h2>
              <p className="text-sm text-muted-foreground">Thank you for submitting. Here is your grading report summary.</p>
            </div>

            <div className="grid grid-cols-2 max-w-sm mx-auto p-4 rounded-xl border border-border/40 bg-accent/20">
              <div className="border-r border-border/40">
                <div className="text-2xl font-black text-primary">{attempt.score}%</div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Your Score</div>
              </div>
              <div>
                <div className="text-2xl font-black text-foreground">
                  {questions.length}
                </div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Questions</div>
              </div>
            </div>

            <Button onClick={handleExportPDF} className="gradient-bg gap-2 font-bold px-6 shadow-md shadow-primary/20">
              <FileDown className="h-4.5 w-4.5" />
              Download PDF Report
            </Button>
          </div>

          <h3 className="text-lg font-bold border-b border-border/40 pb-2 pt-4">Question Review</h3>

          <div className="space-y-4">
            <QuizReviewList attemptId={attempt.id} quizId={quizId} questions={questions} />
          </div>
        </main>
      </div>
    );
  }

  // RENDER: Active Quiz Player Mode
  return (
    <div className="min-h-screen bg-background flex flex-col pb-12 select-none">
      {/* Top Header */}
      <header className="border-b border-border/40 py-4 bg-sidebar/20 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-sm tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
            <span className="text-xs text-muted-foreground border-l border-border pl-3 font-semibold">{studentInfo?.name}</span>
          </div>

          {/* Live Timer */}
          {secondsLeft !== null && (
            <div className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold font-mono tracking-wider shadow-sm",
              secondsLeft < 60 
                ? "bg-destructive/10 text-destructive border-destructive/30 animate-pulse" 
                : "bg-primary/5 text-primary border-primary/20"
            )}>
              <Clock className="h-4 w-4" />
              {formatTime(secondsLeft)}
            </div>
          )}
        </div>
      </header>

      {/* Quiz Player Board */}
      {currentQ && (
        <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
          
          {/* Question Navigator Tracker */}
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <span className="bg-accent px-2.5 py-1 rounded-lg uppercase tracking-wider">{currentQ.question_type}</span>
          </div>

          {/* Question Text Card */}
          <div className="glass rounded-2xl border border-border/60 p-6 space-y-6 shadow-md">
            <h2 className="text-xl font-bold leading-relaxed">{currentQ.question_text}</h2>

            {/* Shuffled Options List */}
            <div className="space-y-3">
              {(() => {
                const optOrder = attempt.option_order?.[currentQ.id] || ["A", "B", "C", "D", "E"];
                return optOrder.map((key: string, idx: number) => {
                  const optText = currentQ[`option_${key.toLowerCase()}`];
                  if (!optText) return null;

                  const isSelected = (selectedAnswers[currentQ.id] || "")
                    .split(",")
                    .includes(key);

                  return (
                    <button
                      key={key}
                      onClick={() => handleToggleOption(currentQ, key)}
                      className={cn(
                        "w-full flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all hover:bg-muted/30 font-medium text-sm shadow-sm",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/20"
                          : "border-border bg-card/10 hover:border-primary/40"
                      )}
                    >
                      <span className="shrink-0">
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-primary fill-primary/10" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                      </span>
                      <span>{optText}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-border/40">
            <Button
              variant="outline"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => i - 1)}
              className="gap-1 font-semibold rounded-xl"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
              Previous
            </Button>

            {currentIdx < questions.length - 1 ? (
              <Button
                variant="outline"
                onClick={() => setCurrentIdx((i) => i + 1)}
                className="gap-1 font-semibold rounded-xl"
              >
                Next
                <ChevronRight className="h-4.5 w-4.5" />
              </Button>
            ) : (
              <Button
                onClick={() => handleSubmitQuiz(false)}
                disabled={submitting}
                className="gradient-bg gap-1.5 font-bold shadow-md shadow-primary/20 rounded-xl px-6"
              >
                {submitting ? "Submitting..." : "Submit Quiz"}
                <CheckSquare className="h-4.5 w-4.5 fill-current" />
              </Button>
            )}
          </div>

        </main>
      )}
    </div>
  );
}

// ==========================================
// Graded Quiz Review Component
// ==========================================

function QuizReviewList({ 
  attemptId, 
  quizId, 
  questions 
}: { 
  attemptId: string; 
  quizId: string; 
  questions: any[] 
}) {
  const { data: responses = [] } = useQuery({
    queryKey: ["graded-responses", attemptId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_responses")
        .select("*")
        .eq("attempt_id", attemptId);
      return data || [];
    }
  });

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => {
        const resp = responses.find((r) => r.question_id === q.id);
        const isCorrect = resp?.is_correct || false;
        const selectedStr = resp?.selected_answer || "";

        return (
          <div 
            key={q.id} 
            className={cn(
              "p-5 rounded-2xl border bg-card/25 shadow-sm space-y-3",
              isCorrect 
                ? "border-emerald-500/30 bg-emerald-500/5" 
                : "border-destructive/30 bg-destructive/5"
            )}
          >
            <div className="flex items-center justify-between border-b border-border/20 pb-2">
              <span className="text-xs font-bold text-muted-foreground bg-accent px-2 py-0.5 rounded-lg">
                Question {idx + 1}
              </span>
              <span className={cn(
                "text-xs font-bold px-2 py-1 rounded flex items-center gap-1",
                isCorrect ? "text-emerald-500 bg-emerald-500/10" : "text-destructive bg-destructive/10"
              )}>
                {isCorrect ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {isCorrect ? `Correct (+${q.points} pts)` : `Incorrect (+0 pts)`}
              </span>
            </div>

            <h4 className="font-bold text-sm leading-relaxed">{q.question_text}</h4>

            {/* Display list of options with original keys */}
            <div className="grid gap-2 text-xs">
              {["A", "B", "C", "D", "E"].map((k) => {
                const optText = q[`option_${k.toLowerCase()}`];
                if (!optText) return null;

                const isSelected = selectedStr.split(",").includes(k);
                const isCorrectOption = q.correct_answer.split(",").includes(k);

                return (
                  <div 
                    key={k} 
                    className={cn(
                      "p-2.5 rounded-lg border font-medium flex items-center justify-between",
                      isSelected && isCorrectOption && "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      isSelected && !isCorrectOption && "border-destructive bg-destructive/10 text-destructive",
                      !isSelected && isCorrectOption && "border-emerald-500/50 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
                      !isSelected && !isCorrectOption && "border-border/40 bg-transparent text-muted-foreground"
                    )}
                  >
                    <span>{k}. {optText}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent">
                        Your Answer
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {q.explanation && (
              <div className="pt-2 border-t border-border/20 text-xs space-y-1">
                <span className="font-extrabold text-muted-foreground uppercase tracking-wide block">Explanation:</span>
                <p className="text-muted-foreground font-medium leading-relaxed">{q.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
