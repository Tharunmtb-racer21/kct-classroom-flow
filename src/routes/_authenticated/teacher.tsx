import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated/teacher")({
  component: TeacherLayout,
});

function TeacherLayout() {
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

      <div className="relative z-10 flex min-h-screen w-full pb-14 md:pb-0">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
