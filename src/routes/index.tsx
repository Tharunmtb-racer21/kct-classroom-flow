import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, Cloud, Sparkles, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [code, setCode] = useState("");
  const navigate = Route.useNavigate();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    navigate({ to: "/join/$code", params: { code: code.trim().toUpperCase() } });
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative before:absolute before:inset-0 before:bg-background/85"
      style={{ backgroundImage: "url('/kct-landing-bg.jpg')" }}
    >
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl overflow-hidden shadow-[var(--shadow-glow)]">
            <img src="/kct-logo88.jpg" alt="KCT Logo" className="h-16 w-16 object-cover" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/auth">
            <Button variant="ghost">Faculty Login</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-12 pb-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary-glow)]" />
          Built for Kumaraguru College of Technology
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Transform classrooms into <br />
          <span className="gradient-text">interactive experiences</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Real-time polls, live word clouds, and instant quizzes. Students join with a QR — no accounts, no friction.
        </p>

        <div className="mx-auto mt-10 flex max-w-md flex-col gap-3">
          <form onSubmit={handleJoin} className="glass flex items-center gap-2 rounded-2xl p-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter session code (e.g. KCT821)"
              className="border-0 bg-transparent text-center text-lg font-mono tracking-[0.2em] focus-visible:ring-0"
            />
            <Button type="submit" className="gradient-bg font-semibold">Join</Button>
          </form>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Faculty? Sign in to launch a session →
          </Link>
        </div>

        <div className="mx-auto mt-24 grid max-w-5xl gap-5 md:grid-cols-3">
          {[
            { icon: BarChart3, title: "Live Polls", desc: "MCQ voting with instant percentage bars.", color: "text-[color:var(--primary)]" },
            { icon: Cloud, title: "Word Clouds", desc: "Watch student thinking form in real-time.", color: "text-[color:var(--accent-emerald)]" },
            { icon: Zap, title: "Quizzes", desc: "Timed questions with a live leaderboard.", color: "text-[color:var(--primary-glow)]" },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 text-left transition hover:-translate-y-1">
              <f.icon className={`mb-4 h-8 w-8 ${f.color}`} />
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 flex max-w-4xl flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Unlimited participants</div>
          <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Instant realtime updates</div>
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Zero-signup for students</div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} KCT PULSE · Kumaraguru College of Technology
      </footer>
      </div>
    </div>
  );
}
