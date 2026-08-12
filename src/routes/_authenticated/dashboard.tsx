import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LayoutDashboard, Presentation, BarChart3, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

const mobileNavItems = [
  { title: "Dashboard", url: "/dashboard" as const, icon: LayoutDashboard, exact: true },
  { title: "Sessions", url: "/dashboard/sessions" as const, icon: Presentation },
  { title: "Reports", url: "/dashboard/reports" as const, icon: BarChart3 },
  { title: "Profile", url: "/dashboard/profile" as const, icon: User },
];

function DashboardLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="relative flex min-h-screen w-full flex-col md:flex-row overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-fixed bg-no-repeat"
        style={{ 
          backgroundImage: "url('/kct-temple-bg-opt.jpg')",
          opacity: "var(--bg-img-opacity)",
          mixBlendMode: "var(--bg-img-blend)" as any
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--dashboard-overlay)" }}
      />

      {/* Mobile Top Header */}
      <header className="relative z-20 flex md:hidden items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-8 w-8 rounded-lg object-cover" />
          <span className="font-bold text-sm tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden items-center justify-around border-t border-border/60 bg-sidebar/90 backdrop-blur-xl py-2 px-1">
        {mobileNavItems.map((item) => {
          const active = item.exact ? pathname === item.url : pathname.startsWith(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                active ? "gradient-text font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="relative z-10 flex min-h-screen w-full pb-14 md:pb-0">
        <AppSidebar />
        <main className="flex-1 flex flex-col justify-between overflow-x-hidden">
          <Outlet />
          <footer className="mt-auto border-t border-border/40 py-4 px-6 text-center text-xs text-muted-foreground space-y-1">
            <div>Built for Kumaraguru College of Technology</div>
            <div className="flex items-center justify-center gap-2 flex-wrap text-[11px]">
              <span>✦ Designed by <span className="font-semibold text-foreground/80">THARUN NE</span></span>
              <span className="text-border/60">·</span>
              <span>⚡ Developed by <span className="font-semibold text-foreground/80">NAVNEETH V</span></span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
