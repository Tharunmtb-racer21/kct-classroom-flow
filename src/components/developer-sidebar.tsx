import { Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  ArrowLeft,
  Brain,
  Download,
  Flame,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export interface DeveloperSidebarProps {
  isServerDown: boolean;
  onToggleServerDown: () => void;
  timeframe: "1D" | "7D" | "30D" | "ALL";
  setTimeframe: (tf: "1D" | "7D" | "30D" | "ALL") => void;
  onRunCleanup: () => void;
  onPurgeEmptySessions: () => void;
  onRefresh: () => void;
  loading: boolean;
  onExportMLDataset: () => void;
  onLockPortal: () => void;
  activeItem?: "Developer Dashboard" | "ML Intelligence" | "Security Telemetry" | "WAF Firewall";
  className?: string;
  onClose?: () => void;
}

const devNavItems = [
  {
    title: "Developer Dashboard" as const,
    url: "/developer",
    icon: LayoutDashboard,
  },
  {
    title: "ML Intelligence" as const,
    url: "/dashboard/intelligence",
    icon: Brain,
  },
  {
    title: "Security Telemetry" as const,
    url: "/dashboard/security",
    icon: ShieldCheck,
  },
  {
    title: "WAF Firewall" as const,
    url: "/developer-waf",
    icon: Shield,
  },
];

export function DeveloperSidebarContent({
  isServerDown,
  onToggleServerDown,
  timeframe,
  setTimeframe,
  onRunCleanup,
  onPurgeEmptySessions,
  onRefresh,
  loading,
  onExportMLDataset,
  onLockPortal,
  activeItem = "Developer Dashboard",
  onClose,
}: DeveloperSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-sidebar/95 backdrop-blur-xl select-none">
      {/* Branding Header */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-11 w-11 place-items-center rounded-xl overflow-hidden shadow-[var(--shadow-glow)] shrink-0">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-11 w-11 object-cover" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-black text-base tracking-tight leading-none text-foreground">
              KCT <span className="gradient-text">PULSE</span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mt-1">
              Developer Suite
            </span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Scrollable Navigation Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
        {/* Navigation / Sub-portals */}
        <div className="space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pb-1">
            Navigation
          </div>
          {devNavItems.map((item) => {
            const active = activeItem === item.title;
            return (
              <Link
                key={item.url}
                to={item.url}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition group",
                  active
                    ? "gradient-bg text-white shadow-[var(--shadow-glow)] font-bold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active ? "text-white" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>

        {/* Developer Controls: Server Down Mode */}
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pt-2 pb-0.5">
            Controls
          </div>
          <button
            type="button"
            onClick={onToggleServerDown}
            className={cn(
              "w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs font-black transition border text-left",
              isServerDown
                ? "bg-rose-600 text-white border-rose-400 hover:bg-rose-700 shadow-lg shadow-rose-600/30 animate-pulse"
                : "border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/60",
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <AlertOctagon className="h-4 w-4 shrink-0 text-rose-400" />
              <span className="truncate font-extrabold">Server Down</span>
            </div>
            <span
              className={cn(
                "text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider shrink-0",
                isServerDown ? "bg-white/20 text-white" : "bg-rose-500/15 text-rose-400",
              )}
            >
              {isServerDown ? "ACTIVE" : "TRIGGER"}
            </span>
          </button>
        </div>

        {/* Timeframe Selector */}
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pt-2 pb-0.5">
            Timeframe
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 bg-card/60 border border-border/60 rounded-xl">
            {(["1D", "7D", "30D", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "py-1.5 text-xs rounded-lg font-black transition text-center",
                  timeframe === tf
                    ? "gradient-bg text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Developer Tools */}
        <div className="space-y-1 pt-1 border-t border-border/40">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pt-2 pb-0.5">
            Developer Tools
          </div>

          <button
            type="button"
            onClick={onRunCleanup}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition text-left"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate">Auto-Draft Cleanup</span>
          </button>

          <button
            type="button"
            onClick={onPurgeEmptySessions}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition text-left"
          >
            <Flame className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span className="truncate">Purge DB Test Data</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent transition text-left"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-spin")} />
            <span className="truncate">Refresh Telemetry</span>
          </button>

          <button
            type="button"
            onClick={onExportMLDataset}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 transition text-left"
          >
            <Download className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="truncate">Export ML Dataset (CSV)</span>
          </button>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-3.5 border-t border-border/60 space-y-1.5 shrink-0 mt-auto bg-sidebar/60">
        <ThemeToggle
          showLabel
          variant="ghost"
          className="w-full justify-start px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground text-xs font-medium"
        />

        <button
          type="button"
          onClick={onLockPortal}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-rose-400 hover:bg-destructive/10 hover:text-destructive transition text-left"
        >
          <Lock className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span>Lock Portal</span>
        </button>

        <Link
          to="/dashboard"
          onClick={onClose}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground transition"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span>Back to App</span>
        </Link>
      </div>
    </div>
  );
}

export function DeveloperSidebar(props: DeveloperSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex md:w-72 lg:w-[300px] md:flex-col border-r border-border/60 bg-sidebar/60 backdrop-blur-xl md:h-screen md:sticky md:top-0 overflow-hidden shrink-0 z-20",
        props.className,
      )}
    >
      <DeveloperSidebarContent {...props} />
    </aside>
  );
}
