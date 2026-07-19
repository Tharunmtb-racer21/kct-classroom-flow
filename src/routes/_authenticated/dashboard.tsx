import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[#020817]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-fixed bg-no-repeat opacity-[0.25]"
        style={{ backgroundImage: "url('/kct-bg-new-opt.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,8,23,0.97)_0%,rgba(2,8,23,0.91)_38%,rgba(2,8,23,0.86)_100%)]"
      />
      <div className="relative z-10 flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
