import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, LogOut, PresentationIcon, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";

const items: { title: string; url: "/dashboard" | "/dashboard/sessions" | "/dashboard/reports" | "/dashboard/settings"; icon: React.ComponentType<{ className?: string }>; exact?: boolean }[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, exact: true },
  { title: "Sessions", url: "/dashboard/sessions", icon: PresentationIcon },
  { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const handleLogout = async () => {
    await auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border/60 bg-sidebar/60 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-border/60">
        <div className="grid h-12 w-12 place-items-center rounded-xl overflow-hidden shadow-[var(--shadow-glow)]">
          <img src="/kct-logo88.jpg" alt="KCT Logo" className="h-12 w-12 object-cover" />
        </div>
        <span className="font-extrabold text-lg tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {items.map((item) => {
          const active = item.exact ? pathname === item.url : pathname.startsWith(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "gradient-bg text-white shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="m-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
      >
        <LogOut className="h-4 w-4" /> Logout
      </button>
    </aside>
  );
}