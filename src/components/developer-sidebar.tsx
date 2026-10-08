import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Flame,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export type AdminSection =
  | "dashboard"
  | "sessions"
  | "faculty"
  | "questions"
  | "submissions"
  | "activity"
  | "security"
  | "health"
  | "feedback"
  | "contact_messages"
  | "settings";

export interface DeveloperSidebarProps {
  activeSection?: AdminSection;
  onSelectSection?: (section: AdminSection) => void;
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
  badgeCounts?: {
    sessions?: number;
    liveSessions?: number;
    faculty?: number;
    questions?: number;
    submissions?: number;
    failedAttempts?: number;
    unreadFeedback?: number;
  };
  activeItem?: string;
  className?: string;
  onClose?: () => void;
}

interface NavGroupItem {
  id: AdminSection;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: (counts?: DeveloperSidebarProps["badgeCounts"]) => { text: string; variant: "emerald" | "rose" | "amber" | "muted" } | null;
}

const navGroups: { group: string; items: NavGroupItem[] }[] = [
  {
    group: "OVERVIEW",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    group: "MANAGEMENT",
    items: [
      {
        id: "sessions",
        label: "Sessions",
        icon: Layers,
        badge: (c) => (c?.liveSessions && c.liveSessions > 0 ? { text: `${c.liveSessions} Live`, variant: "emerald" } : null),
      },
      { id: "faculty", label: "Faculty", icon: UserCheck },
      { id: "questions", label: "Questions", icon: HelpCircle },
      { id: "submissions", label: "Submissions", icon: MessageSquare },
    ],
  },
  {
    group: "MONITORING",
    items: [
      { id: "activity", label: "Activity", icon: Activity },
      {
        id: "security",
        label: "Security",
        icon: Shield,
        badge: (c) => (c?.failedAttempts && c.failedAttempts > 0 ? { text: `${c.failedAttempts}`, variant: "rose" } : null),
      },
      { id: "health", label: "System Health", icon: Zap },
    ],
  },
  {
    group: "COMMUNICATION",
    items: [
      { id: "feedback", label: "Feedback", icon: MessageSquare },
      {
        id: "contact_messages",
        label: "Contact Messages",
        icon: Mail,
        badge: (c) => (c?.unreadFeedback && c.unreadFeedback > 0 ? { text: `${c.unreadFeedback} new`, variant: "amber" } : null),
      },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export function DeveloperSidebarContent({
  activeSection = "dashboard",
  onSelectSection,
  isServerDown,
  onToggleServerDown,
  timeframe,
  setTimeframe,
  onRefresh,
  loading,
  onLockPortal,
  badgeCounts,
  onClose,
}: DeveloperSidebarProps) {
  const handleItemClick = (sectionId: AdminSection) => {
    if (onSelectSection) {
      onSelectSection(sectionId);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar/95 backdrop-blur-xl select-none">
      {/* Institutional Branding Header */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-sm shrink-0 border border-border/60">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-black text-sm tracking-tight leading-none text-foreground">
              KCT <span className="gradient-text">PULSE</span>
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mt-1">
              Admin Console
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

      {/* Primary Sidebar Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.group} className="space-y-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pb-1">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeSection === item.id;
                const badge = item.badge ? item.badge(badgeCounts) : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition text-left group",
                      isActive
                        ? "bg-primary text-primary-foreground font-bold shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {badge && (
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0",
                          badge.variant === "emerald" &&
                            (isActive ? "bg-white/25 text-white" : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"),
                          badge.variant === "rose" &&
                            (isActive ? "bg-white/25 text-white" : "bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse"),
                          badge.variant === "amber" &&
                            (isActive ? "bg-white/25 text-white" : "bg-amber-500/15 text-amber-500 border border-amber-500/25"),
                          badge.variant === "muted" &&
                            (isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"),
                        )}
                      >
                        {badge.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Global Controls: Timeframe Selector */}
        <div className="space-y-1.5 pt-2 border-t border-border/40">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pb-0.5">
            Window
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 bg-card/60 border border-border/60 rounded-xl">
            {(["1D", "7D", "30D", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "py-1 text-[11px] rounded-lg font-bold transition text-center",
                  timeframe === tf
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Server Down Mode Status / Emergency Action */}
        {isServerDown && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1.5">
            <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold">
              <AlertOctagon className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              <span>Server Down Active</span>
            </div>
            <button
              type="button"
              onClick={onToggleServerDown}
              className="w-full text-center py-1 text-[10px] font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition"
            >
              Resume Traffic
            </button>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-border/60 space-y-1 shrink-0 mt-auto bg-sidebar/60">
        <button
          type="button"
          onClick={onRefresh}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition text-left"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-spin")} />
          <span className="truncate">Refresh Data</span>
        </button>

        <ThemeToggle
          showLabel
          variant="ghost"
          className="w-full justify-start px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground text-xs font-medium"
        />

        <button
          type="button"
          onClick={onLockPortal}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-500 transition text-left"
        >
          <Lock className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span>Lock Console</span>
        </button>

        <Link
          to="/dashboard"
          onClick={onClose}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span>Exit to App</span>
        </Link>
      </div>
    </div>
  );
}

export function DeveloperSidebar(props: DeveloperSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex md:w-64 lg:w-72 md:flex-col border-r border-border/60 bg-sidebar/60 backdrop-blur-xl md:h-screen md:sticky md:top-0 overflow-hidden shrink-0 z-20",
        props.className,
      )}
    >
      <DeveloperSidebarContent {...props} />
    </aside>
  );
}
