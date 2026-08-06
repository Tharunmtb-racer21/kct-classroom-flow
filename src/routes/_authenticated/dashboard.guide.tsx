import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  MonitorPlay,
  Play,
  Plus,
  QrCode,
  Sparkles,
  Upload,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/guide")({
  component: FacultyGuidePage,
});

const workflowSteps = [
  { icon: UserCheck, title: "Sign in", text: "Faculty signs in and lands on the dashboard." },
  { icon: Plus, title: "Create session", text: "Open Sessions, create a class workspace, or clone a department template." },
  { icon: ClipboardList, title: "Add questions", text: "Create polls, quizzes, or word clouds manually." },
  { icon: Sparkles, title: "AI generate", text: "Upload a document and review generated questions before saving." },
  { icon: QrCode, title: "Share with students", text: "Show the QR code, session code, or join link." },
  { icon: Play, title: "Run live", text: "Start, choose one/all questions, or use Auto Play." },
  { icon: BarChart3, title: "Review responses", text: "Watch submissions and participation update in real time." },
  { icon: Download, title: "Export report", text: "Open Reports to download PDF/CSV evidence." },
];

const questionTypes = [
  { title: "Poll", text: "Use for opinions or quick checks. Students pick one option." },
  { title: "Quiz", text: "Use for scored MCQs. Add options and mark the correct answer." },
  { title: "Word Cloud", text: "Use for short typed responses, reflections, or keywords." },
];

function FacultyGuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      <Link to="/dashboard/profile" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>

      <section className="glass rounded-2xl border border-border/60 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
              <BookOpen className="h-4 w-4" /> Faculty Manual
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">How to Use KCT PULSE</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Follow this guide to create a classroom session, collect student answers, present live responses, and export reports safely.
            </p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            Faculty workflow guide
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Pictorial Workflow</h2>
        <div className="grid gap-3 md:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <div key={step.title} className="relative rounded-2xl border border-border/60 bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <span className="font-mono text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 font-bold">{step.title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <GuideCard title="1. Create a Session" icon={Plus}>
          <p>Go to Sessions and click New Session. Enter the lecture title, then open the created session workspace.</p>
          <p>You can also open Department Shared Workspaces and clone a ready-made template into your sessions.</p>
        </GuideCard>

        <GuideCard title="2. Add Questions" icon={ClipboardList}>
          <p>Inside the session page, add Poll, Quiz, or Word Cloud questions.</p>
          <p>For quizzes, fill the options and choose the correct answer. For word clouds, students type a short text answer.</p>
        </GuideCard>

        <GuideCard title="3. Generate with AI" icon={Upload}>
          <p>Use the AI question generator to upload a document, select question types, review the generated list, and save the useful questions.</p>
          <p>Always review AI-generated content before running it live in class.</p>
        </GuideCard>

        <GuideCard title="4. Share to Students" icon={QrCode}>
          <p>Use the session code, QR code, or join link from the session page.</p>
          <p>Students open the join page, enter their name, answer the active questions, and submit responses.</p>
        </GuideCard>

        <GuideCard title="5. Run the Class" icon={MonitorPlay}>
          <p>Click Start to make the session live. Use Next Question for one-by-one delivery, All Questions for Microsoft Forms style answering, or Auto Play for timed flow.</p>
          <p>The slide embed link can be used in presentation tools for live classroom display.</p>
        </GuideCard>

        <GuideCard title="6. Export Reports" icon={FileText}>
          <p>Open Reports after the session. Select a session to review participants, answers, completion, and accuracy.</p>
          <p>Download CSV or PDF for records, attendance, and academic evidence.</p>
        </GuideCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl border border-border/60 p-6">
          <h2 className="text-xl font-bold tracking-tight">Question Type Guide</h2>
          <div className="mt-4 space-y-3">
            {questionTypes.map((item) => (
              <div key={item.title} className="rounded-xl border border-border/50 bg-card/40 p-4">
                <h3 className="font-bold text-primary">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl border border-border/60 p-6">
          <h2 className="text-xl font-bold tracking-tight">Safety Notes</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <p><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400" />Do not share faculty dashboard links with students.</p>
            <p><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400" />Share only the session code, QR code, or student join link.</p>
            <p><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400" />End the session after class to stop new responses.</p>
            <p><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400" />Use Reports for exports instead of sharing raw dashboard screens.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function GuideCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl border border-border/60 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-bold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  );
}
