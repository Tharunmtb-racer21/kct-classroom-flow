import { useMemo } from "react";
import { Users, Award, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { Question, Participant, Response } from "@/types/reports.types";
import { formatStudentDisplayName } from "@/lib/utils";

export function QuestionAnalyticsCard({
  index,
  question,
  participants,
}: {
  index: number;
  question: Question;
  participants: Participant[];
}) {
  const responses = question.responses ?? [];
  const totalResp = responses.length;
  const maxMarks = question.marks ?? question.points ?? 0;

  const typeLabels = {
    poll: "Poll (MCQ)",
    quiz: "Quiz",
    wordcloud: "Word Cloud",
  };

  const typeStyles = {
    poll: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    quiz: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    wordcloud: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  // Map responses by participant_id
  const responseByParticipant = useMemo(() => {
    const map = new Map<string, Response>();
    responses.forEach((r) => {
      if (r.participant_id) {
        map.set(r.participant_id, r);
      }
    });
    return map;
  }, [responses]);

  // Derive complete participant roster (all session participants + any response author)
  const allParticipantEntries = useMemo(() => {
    const list: { id: string; name: string }[] = participants.map((p) => ({
      id: p.id,
      name: formatStudentDisplayName(p.name, p.id),
    }));

    const existingIds = new Set(participants.map((p) => p.id));
    responses.forEach((r) => {
      if (r.participant_id && !existingIds.has(r.participant_id)) {
        list.push({
          id: r.participant_id,
          name: formatStudentDisplayName(null, r.participant_id),
        });
        existingIds.add(r.participant_id);
      }
    });

    return list;
  }, [participants, responses]);

  const totalParticipants = Math.max(participants.length, allParticipantEntries.length);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
      {/* Question Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${typeStyles[question.type]}`}
            >
              {typeLabels[question.type]}
            </span>
            <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-foreground uppercase">
              {maxMarks} {maxMarks === 1 ? "Mark" : "Marks"}
            </span>
          </div>
          <h5 className="font-medium text-foreground">{question.title}</h5>
        </div>
        <div className="text-xs text-muted-foreground text-left sm:text-right shrink-0">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-foreground">
            <span className="text-primary font-bold mr-1">{totalResp}</span> / {totalParticipants}{" "}
            responses
          </span>
        </div>
      </div>

      {/* Render Analytics by Type */}
      <div className="pt-2">
        {question.type === "poll" && (
          <PollAnalytics options={question.options} responses={responses} />
        )}
        {question.type === "quiz" && (
          <QuizAnalytics
            options={question.options}
            correct={question.correct_answer}
            responses={responses}
            participants={participants}
            marks={maxMarks}
          />
        )}
        {question.type === "wordcloud" && <WordCloudAnalytics responses={responses} />}
      </div>

      {/* ── Student Responses breakdown list ── */}
      <div className="mt-4 pt-4 border-t border-white/5 space-y-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" /> Student Responses ({totalResp} / {totalParticipants})
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Weight: <span className="font-semibold text-foreground">{maxMarks} Marks</span>
          </div>
        </div>

        {allParticipantEntries.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-3 text-center rounded-lg border border-dashed border-white/5">
            No participants joined this session yet.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {allParticipantEntries.map((p) => {
              const resp = responseByParticipant.get(p.id);
              const hasAnswered = !!resp;
              const answer = resp?.answer;

              let statusBadge: React.ReactNode = null;
              let earnedMarks = 0;

              if (question.type === "quiz") {
                if (hasAnswered) {
                  const isCorrect =
                    question.correct_answer != null && answer === question.correct_answer;
                  if (isCorrect) {
                    earnedMarks = maxMarks;
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Correct
                      </span>
                    );
                  } else {
                    earnedMarks = 0;
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
                        ✕ Incorrect
                      </span>
                    );
                  }
                } else {
                  earnedMarks = 0;
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      ⏳ Not answered
                    </span>
                  );
                }
              } else {
                // Poll or WordCloud
                if (hasAnswered) {
                  earnedMarks = maxMarks;
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                      ✓ Answered
                    </span>
                  );
                } else {
                  earnedMarks = 0;
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      ⏳ Not answered
                    </span>
                  );
                }
              }

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-xs hover:bg-white/[0.03] transition min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${hasAnswered ? "bg-emerald-400" : "bg-neutral-600"}`}
                    />
                    <span className="font-semibold text-foreground truncate" title={p.name}>
                      {p.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasAnswered ? (
                      <span
                        className="rounded bg-black/40 border border-white/5 px-2 py-0.5 font-mono text-[11px] text-muted-foreground truncate max-w-[110px] select-all"
                        title={answer}
                      >
                        {answer}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 italic">
                        No response
                      </span>
                    )}

                    {statusBadge}

                    <span className="font-mono text-[11px] font-bold text-foreground/80 min-w-[32px] text-right">
                      {earnedMarks}/{maxMarks}
                    </span>
                  </div>
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

  const chartData = useMemo(() => {
    return options.map((o, idx) => {
      const c = counts.get(o) ?? 0;
      const pct = Math.round((c / total) * 100);
      return {
        option: o.length > 18 ? `${o.slice(0, 18)}…` : o,
        fullOption: o,
        votes: c,
        percentage: pct,
        label: `Opt ${String.fromCharCode(65 + idx)}`,
      };
    });
  }, [options, counts, total]);

  return (
    <div className="space-y-4">
      {/* Graphical Bar Distribution */}
      {responses.length > 0 && (
        <div className="h-36 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "currentColor", fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="label" type="category" tick={{ fill: "currentColor", fontSize: 11 }} width={55} />
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
                  maxWidth: "280px",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
                formatter={(val: any, name: any, item: any) => [
                  `${item.payload.votes} votes (${val}%)`,
                  item.payload.fullOption,
                ]}
              />
              <Bar dataKey="percentage" fill="#06b6d4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="space-y-3">
        {options.map((o, idx) => {
          const c = counts.get(o) ?? 0;
          const pct = Math.round((c / total) * 100);
          return (
            <div key={o} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold grid place-items-center">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {o}
                </span>
                <span className="font-semibold">
                  {c} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizAnalytics({
  options,
  correct,
  responses,
  participants,
  marks = 0,
}: {
  options: string[];
  correct: string | null;
  responses: Response[];
  participants: Participant[];
  marks?: number;
}) {
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
        m.set(r.participant_id, (m.get(r.participant_id) ?? 0) + marks);
      }
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [responses, correct, marks]);

  const chartData = useMemo(() => {
    return options.map((o, idx) => {
      const c = counts.get(o) ?? 0;
      const pct = Math.round((c / total) * 100);
      const isCorrect = o === correct;
      return {
        option: o.length > 18 ? `${o.slice(0, 18)}…` : o,
        fullOption: o,
        votes: c,
        percentage: pct,
        isCorrect,
        color: isCorrect ? "#10b981" : "#64748b",
        label: `Opt ${String.fromCharCode(65 + idx)}${isCorrect ? " ✓" : ""}`,
      };
    });
  }, [options, counts, total, correct]);

  return (
    <div className="space-y-5">
      {/* Graphical Bar Distribution */}
      {responses.length > 0 && (
        <div className="h-36 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "currentColor", fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="label" type="category" tick={{ fill: "currentColor", fontSize: 11 }} width={65} />
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
                  maxWidth: "280px",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
                formatter={(val: any, name: any, item: any) => [
                  `${item.payload.votes} votes (${val}%) ${item.payload.isCorrect ? "— Correct Answer" : ""}`,
                  item.payload.fullOption,
                ]}
              />
              <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Option Breakdown */}
      <div className="space-y-3">
        {options.map((o, idx) => {
          const c = counts.get(o) ?? 0;
          const pct = Math.round((c / total) * 100);
          const isCorrect = o === correct;

          return (
            <div key={o} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span
                  className={`flex items-center gap-1.5 ${isCorrect ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}
                >
                  <span
                    className={`h-4 w-4 rounded-full text-[10px] font-bold grid place-items-center ${isCorrect ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-500/20 text-neutral-400"}`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  {o}
                  {isCorrect && (
                    <span className="text-[10px] uppercase font-bold text-emerald-500/80 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                      Correct
                    </span>
                  )}
                </span>
                <span className={`font-semibold ${isCorrect ? "text-emerald-400" : ""}`}>
                  {c} ({pct}%)
                </span>
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
              <div className="text-xs text-muted-foreground py-1">
                No correct responses submitted yet.
              </div>
            ) : (
              scores.map(([pid, s], idx) => (
                <div
                  key={pid}
                  className="flex items-center justify-between rounded bg-white/[0.01] border border-white/5 px-2.5 py-1.5 text-xs"
                >
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
      r.answer
        .split(/[\s,]+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .forEach((w) => {
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
            "text-purple-400",
            "text-pink-400",
            "text-blue-400",
            "text-indigo-400",
            "text-cyan-400",
            "text-teal-400",
          ];
          const colorClass =
            colors[
              Math.abs(w.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) %
                colors.length
            ];

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
          <div
            key={w}
            className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.01] border border-white/5 text-xs"
          >
            <span className="text-muted-foreground truncate">{w}</span>
            <span className="font-semibold bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded font-mono">
              {c}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

