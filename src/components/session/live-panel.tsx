import { useMemo } from "react";
import { Users, CheckCircle2, Clock } from "lucide-react";
import type { Question, Participant, Response } from "@/types/session.types";

export function LivePanel({
  current,
  responses,
  participants,
}: {
  current: Question | null;
  responses: Response[];
  participants: Participant[];
}) {
  if (!current) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold">Live Results</h2>
        <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Activate a question to see live responses here.
        </div>
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Participants ({participants.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <div key={p.id} className="rounded-full bg-accent px-3 py-1 text-xs">
                {p.name}
              </div>
            ))}
            {participants.length === 0 && (
              <div className="text-sm text-muted-foreground">Waiting for students to join...</div>
            )}
          </div>
        </div>
      </div>
    );
  }
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const responsesWithImages = responses.filter((r) => r.image_url);

  const totalStudents = participants.length;
  const answeredParticipantIds = new Set(responses.map((r) => r.participant_id));
  const answeredCount = answeredParticipantIds.size;
  const responsePct = totalStudents > 0 ? Math.round((answeredCount / totalStudents) * 100) : 0;
  const pendingStudents = participants.filter((p) => !answeredParticipantIds.has(p.id));

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      {/* ── Header with Student Count & Live Progress ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live · {current.type.toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-accent/40 border border-border text-foreground/80">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">{totalStudents}</span>
              <span className="text-muted-foreground">
                {totalStudents === 1 ? "student joined" : "students joined"}
              </span>
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold">{current.title}</h2>
        </div>

        {/* Responses & Progress Count */}
        <div className="flex items-center sm:flex-col sm:items-end gap-2 sm:gap-1 bg-accent/20 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border border-border/40 sm:border-0 shrink-0">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <span className="text-foreground font-semibold">{responses.length}</span>
            <span className="text-muted-foreground">
              {responses.length === 1 ? "response" : "responses"}
            </span>
            {totalStudents > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                ({answeredCount}/{totalStudents} answered · {responsePct}%)
              </span>
            )}
          </div>
          {totalStudents > 0 && (
            <div className="w-36 h-1.5 rounded-full bg-accent/60 overflow-hidden hidden sm:block">
              <div
                className="h-full bg-[color:var(--accent-emerald)] transition-all duration-500 ease-out rounded-full"
                style={{ width: `${Math.min(100, responsePct)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        {current.type === "poll" && <PollResults options={current.options} responses={responses} />}
        {current.type === "quiz" && (
          <QuizResults
            options={current.options}
            correct={current.correct_answer}
            responses={responses}
            participants={participants}
            marks={current.marks ?? current.points ?? 1}
          />
        )}
        {current.type === "wordcloud" && (
          <WordCloudResults responses={responses} participants={participants} />
        )}
      </div>

      {responsesWithImages.length > 0 && (
        <div className="border-t border-border/50 pt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Student Uploaded Images ({responsesWithImages.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {responsesWithImages.map((r) => (
              <div
                key={r.id}
                className="relative rounded-lg border border-border overflow-hidden bg-muted group flex flex-col"
              >
                <a
                  href={r.image_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative aspect-video flex-1 bg-black flex items-center justify-center"
                >
                  <img
                    src={r.image_url!}
                    alt="Student response upload"
                    className="max-h-24 w-full object-contain"
                  />
                </a>
                <div className="p-2 text-xs truncate border-t border-border bg-card">
                  <span className="font-semibold">
                    {nameById.get(r.participant_id) || "Student"}
                  </span>
                  : {r.answer || "Uploaded image"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Student Participation Breakdown ── */}
      <div className="border-t border-border/50 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Student Participation</span>
            <span className="text-[10px] rounded-full bg-accent px-2 py-0.5 font-normal text-muted-foreground">
              {answeredCount} of {totalStudents} answered
            </span>
          </div>
          {totalStudents === 0 && (
            <span className="text-xs text-amber-400/90 font-medium">No students in room</span>
          )}
        </div>

        {totalStudents === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground/80">No students have joined this session yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ask students to join using the session PIN or scan the QR code.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Submitted Answers */}
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Submitted Answers ({responses.length})</span>
              </div>
              {responses.length === 0 ? (
                <div className="text-xs text-muted-foreground italic bg-accent/10 rounded-lg p-3 border border-border/30">
                  Waiting for students to submit their answers...
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {responses.map((r) => {
                    const studentName = nameById.get(r.participant_id) || "Anonymous Student";
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-accent/20 px-3.5 py-2 text-sm transition hover:bg-accent/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-semibold text-foreground/90 truncate">{studentName}</span>
                        </div>
                        <span className="rounded-lg bg-background/50 border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground select-all shrink-0 ml-2 max-w-[50%] truncate">
                          {r.answer}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Students (Joined but not answered yet) */}
            {pendingStudents.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Awaiting Response ({pendingStudents.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pendingStudents.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent/30 border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition"
                      title="Student is connected and viewing this question"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80 animate-pulse" />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PollResults({ options, responses }: { options: string[]; responses: Response[] }) {
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
          <div key={o}>
            <div className="flex justify-between text-sm mb-1">
              <span>{o}</span>
              <span className="text-muted-foreground">
                {c} · {pct}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-accent">
              <div className="h-full gradient-bg transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizResults({
  options,
  correct,
  responses,
  participants,
  marks = 1,
}: {
  options: string[];
  correct: string | null;
  responses: Response[];
  participants: Participant[];
  marks?: number;
}) {
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const scores = new Map<string, number>();
  responses.forEach((r) => {
    if (r.answer === correct) scores.set(r.participant_id, (scores.get(r.participant_id) ?? 0) + marks);
  });
  const leaderboard = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <div className="space-y-6">
      <PollResults options={options} responses={responses} />
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Leaderboard
        </div>
        <div className="space-y-1">
          {leaderboard.length === 0 && (
            <div className="text-sm text-muted-foreground">No correct answers yet.</div>
          )}
          {leaderboard.map(([pid, s], i) => (
            <div
              key={pid}
              className="flex items-center justify-between rounded-lg bg-accent/50 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="font-bold text-[color:var(--primary-glow)]">#{i + 1}</span>
                {nameById.get(pid) ?? "Anonymous"}
              </span>
              <span className="font-mono">
                {s} pt{s === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
        {correct && (
          <div className="mt-3 text-xs text-muted-foreground">
            Correct answer:{" "}
            <span className="text-[color:var(--accent-emerald)] font-medium">{correct}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WordCloudResults({
  responses,
  participants,
}: {
  responses: Response[];
  participants: Participant[];
}) {
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
    // Sort by count desc; cap to 200 for performance
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200);
  }, [responses]);

  const max = words[0]?.[1] ?? 1;
  const palette = [
    "#60a5fa",
    "#38bdf8",
    "#22d3ee",
    "#5eead4",
    "#34d399",
    "#a78bfa",
    "#c4b5fd",
    "#e0f2fe",
    "#7dd3fc",
    "#93c5fd",
    "#67e8f9",
    "#f0f9ff",
  ];
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/5 p-8"
      style={{
        minHeight: 380,
        background:
          "radial-gradient(ellipse at 20% 20%, oklch(0.3 0.15 240 / 0.35), transparent 55%), radial-gradient(ellipse at 80% 80%, oklch(0.35 0.14 165 / 0.28), transparent 55%), oklch(0.15 0.04 260)",
      }}
    >
      {/* Live stats */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-between text-xs">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur">
          <span
            className="inline-block h-2 w-2 rounded-full bg-[color:var(--accent-emerald)]"
            style={{ animation: "wc-pulse-dot 1.6s ease-in-out infinite" }}
          />
          <span className="font-semibold">{participants.length}</span>
          <span className="text-muted-foreground">participants</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur">
          <span className="font-semibold">{responses.length}</span>
          <span className="text-muted-foreground">responses</span>
        </div>
      </div>

      {words.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="text-center">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              <div
                className="absolute inset-3 rounded-full gradient-bg opacity-60"
                style={{ animation: "wc-pulse-dot 1.8s ease-in-out infinite" }}
              />
            </div>
            <div className="mt-5 text-sm font-medium text-foreground/80">
              Waiting for responses…
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Your word cloud will appear here in real time.
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-[320px] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-2 pt-8">
          {words.map(([w, c], i) => {
            // Log-ish scale: rare words stay readable, common words dominate.
            const t = Math.pow(c / max, 0.55);
            const size = 0.95 + t * 3.4; // rem
            const color = palette[hash(w) % palette.length];
            const opacity = 0.65 + t * 0.35;
            const floatDur = 4 + (hash(w + "d") % 5); // 4-8s
            const floatDelay = ((hash(w + "x") % 20) / 10).toFixed(2); // 0-2s
            return (
              <span
                key={w}
                className="inline-block font-extrabold leading-none tracking-tight will-change-transform"
                style={{
                  fontSize: `${size}rem`,
                  color,
                  opacity,
                  textShadow: `0 0 18px ${color}66, 0 0 44px ${color}33`,
                  transition: "font-size 700ms cubic-bezier(0.22,1,0.36,1), opacity 500ms ease",
                  animation: `wc-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) both, wc-float ${floatDur}s ease-in-out ${floatDelay}s infinite`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
