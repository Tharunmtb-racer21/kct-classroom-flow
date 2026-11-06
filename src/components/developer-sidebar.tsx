import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Flame,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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

export type TimeframeOption = "1D" | "7D" | "30D" | "ALL" | "CUSTOM";

export interface CustomDateRange {
  start: Date;
  end: Date;
  startTime?: string;
  endTime?: string;
  hasCustomTime?: boolean;
  label: string;
}

export interface DeveloperSidebarProps {
  activeSection?: AdminSection;
  onSelectSection?: (section: AdminSection) => void;
  isServerDown: boolean;
  onToggleServerDown: () => void;
  timeframe: TimeframeOption;
  setTimeframe: (tf: TimeframeOption) => void;
  customDateRange?: CustomDateRange | null;
  setCustomDateRange?: (range: CustomDateRange | null) => void;
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
  customDateRange,
  setCustomDateRange,
  onRefresh,
  loading,
  onLockPortal,
  badgeCounts,
  onClose,
}: DeveloperSidebarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => {
    if (customDateRange) {
      return { from: customDateRange.start, to: customDateRange.end };
    }
    const today = new Date();
    return { from: today, to: today };
  });
  const [enableTimeFilter, setEnableTimeFilter] = useState<boolean>(() => !!customDateRange?.hasCustomTime);
  const [draftStartTime, setDraftStartTime] = useState<string>(() => customDateRange?.startTime || "00:00");
  const [draftEndTime, setDraftEndTime] = useState<string>(() => customDateRange?.endTime || "23:59");

  const handleOpenCalendar = (open: boolean) => {
    if (open) {
      if (customDateRange) {
        setDraftRange({ from: customDateRange.start, to: customDateRange.end });
        setDraftStartTime(customDateRange.startTime || "00:00");
        setDraftEndTime(customDateRange.endTime || "23:59");
        setEnableTimeFilter(!!customDateRange.hasCustomTime);
      } else {
        const today = new Date();
        setDraftRange({ from: today, to: today });
      }
    }
    setCalendarOpen(open);
  };

  const setQuickPreset = (type: "today" | "yesterday" | "last7" | "thisMonth") => {
    const now = new Date();
    if (type === "today") {
      setDraftRange({ from: now, to: now });
    } else if (type === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setDraftRange({ from: y, to: y });
    } else if (type === "last7") {
      const past = new Date();
      past.setDate(past.getDate() - 6);
      setDraftRange({ from: past, to: now });
    } else if (type === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDraftRange({ from: firstDay, to: now });
    }
  };

  const handleApplyCustomRange = () => {
    const fromDate = draftRange?.from || new Date();
    const toDate = draftRange?.to || fromDate;

    const earlier = fromDate.getTime() <= toDate.getTime() ? fromDate : toDate;
    const later = fromDate.getTime() <= toDate.getTime() ? toDate : fromDate;

    let start: Date;
    let end: Date;

    if (enableTimeFilter && draftStartTime && draftEndTime) {
      const [sH, sM] = draftStartTime.split(":").map(Number);
      const [eH, eM] = draftEndTime.split(":").map(Number);

      start = new Date(
        earlier.getFullYear(),
        earlier.getMonth(),
        earlier.getDate(),
        isNaN(sH) ? 0 : sH,
        isNaN(sM) ? 0 : sM,
        0,
        0,
      );
      end = new Date(
        later.getFullYear(),
        later.getMonth(),
        later.getDate(),
        isNaN(eH) ? 23 : eH,
        isNaN(eM) ? 59 : eM,
        59,
        999,
      );
    } else {
      start = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate(), 0, 0, 0, 0);
      end = new Date(later.getFullYear(), later.getMonth(), later.getDate(), 23, 59, 59, 999);
    }

    const isSameDay =
      earlier.getFullYear() === later.getFullYear() &&
      earlier.getMonth() === later.getMonth() &&
      earlier.getDate() === later.getDate();

    let labelStr = isSameDay
      ? format(earlier, "MMM d, yyyy")
      : `${format(earlier, "MMM d")} - ${format(later, "MMM d, yyyy")}`;

    if (enableTimeFilter && draftStartTime && draftEndTime) {
      labelStr += ` (${draftStartTime} - ${draftEndTime})`;
    }

    setCustomDateRange?.({
      start,
      end,
      startTime: draftStartTime,
      endTime: draftEndTime,
      hasCustomTime: enableTimeFilter,
      label: labelStr,
    });
    setTimeframe("CUSTOM");
    setCalendarOpen(false);
  };

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
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/70 px-3 pb-0.5 flex items-center justify-between">
            <span>Window</span>
            {timeframe === "CUSTOM" && (
              <span className="text-[9px] font-bold text-primary tracking-normal uppercase bg-primary/15 px-1.5 py-0.2 rounded">
                Custom
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1 p-1 bg-card/60 border border-border/60 rounded-xl">
            {(["1D", "7D", "30D", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  setCustomDateRange?.(null);
                }}
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

            {/* Custom Monthly Calendar & Optional Time Picker Trigger */}
            <Popover open={calendarOpen} onOpenChange={handleOpenCalendar}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="Pick custom monthly date & optional time window"
                  className={cn(
                    "py-1 text-[11px] rounded-lg font-bold transition flex items-center justify-center",
                    timeframe === "CUSTOM"
                      ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={10}
                className="w-[320px] p-3.5 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl z-50 text-popover-foreground space-y-3"
              >
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-1 border-b border-border/40">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold tracking-tight text-foreground">
                      Telemetry Date Window
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Monthly
                  </span>
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setQuickPreset("today")}
                    className="px-2 py-0.5 rounded-md bg-muted/70 hover:bg-muted text-foreground transition shrink-0 font-medium"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPreset("yesterday")}
                    className="px-2 py-0.5 rounded-md bg-muted/70 hover:bg-muted text-foreground transition shrink-0 font-medium"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPreset("last7")}
                    className="px-2 py-0.5 rounded-md bg-muted/70 hover:bg-muted text-foreground transition shrink-0 font-medium"
                  >
                    Last 7D
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPreset("thisMonth")}
                    className="px-2 py-0.5 rounded-md bg-muted/70 hover:bg-muted text-foreground transition shrink-0 font-medium"
                  >
                    This Month
                  </button>
                </div>

                {/* Interactive Monthly Calendar (Single or Range) */}
                <div className="flex justify-center border border-border/50 rounded-xl bg-card/40 p-1">
                  <CalendarUI
                    mode="range"
                    selected={draftRange}
                    onSelect={setDraftRange}
                    initialFocus
                    className="p-1 pointer-events-auto"
                  />
                </div>

                {/* Optional Time Filter Section */}
                <div className="space-y-2 pt-1 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="enable-time-filter"
                      className="flex items-center gap-1.5 text-xs font-semibold text-foreground cursor-pointer select-none"
                    >
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>Optional Time Filter</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="enable-time-filter"
                        checked={enableTimeFilter}
                        onChange={(e) => setEnableTimeFilter(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/40 cursor-pointer accent-primary"
                      />
                      <label
                        htmlFor="enable-time-filter"
                        className="text-[11px] text-muted-foreground cursor-pointer select-none font-medium"
                      >
                        {enableTimeFilter ? "Enabled" : "Off (Full Day)"}
                      </label>
                    </div>
                  </div>

                  {enableTimeFilter ? (
                    <div className="space-y-2 p-2 rounded-xl bg-card/60 border border-border/50 animate-in fade-in-50 duration-150">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">
                            Start Time
                          </span>
                          <input
                            type="time"
                            value={draftStartTime}
                            onChange={(e) => setDraftStartTime(e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-background border border-border/70 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">
                            End Time
                          </span>
                          <input
                            type="time"
                            value={draftEndTime}
                            onChange={(e) => setDraftEndTime(e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-background border border-border/70 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftStartTime("00:00");
                            setDraftEndTime("23:59");
                          }}
                          className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition"
                        >
                          00:00 - 23:59
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftStartTime("08:30");
                            setDraftEndTime("16:30");
                          }}
                          className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition"
                        >
                          College Hours
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground leading-relaxed px-0.5">
                      Default: Queries cover all activity from <span className="font-mono text-foreground font-semibold">00:00:00</span> to <span className="font-mono text-foreground font-semibold">23:59:59</span> on selected dates.
                    </p>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeframe("ALL");
                      setCustomDateRange?.(null);
                      setCalendarOpen(false);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition"
                  >
                    Reset to ALL
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalendarOpen(false)}
                      className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyCustomRange}
                      className="h-7 text-xs px-3 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Apply Window
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Active Custom Range Badge */}
          {timeframe === "CUSTOM" && customDateRange && (
            <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-[11px] text-primary animate-in fade-in-50 duration-150">
              <div className="flex items-center gap-1.5 min-w-0">
                <CalendarIcon className="h-3 w-3 shrink-0 text-primary" />
                <span className="truncate font-semibold text-[11px] text-primary" title={customDateRange.label}>
                  {customDateRange.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTimeframe("ALL");
                  setCustomDateRange?.(null);
                }}
                className="p-0.5 hover:bg-primary/20 rounded-md text-primary/70 hover:text-primary shrink-0 transition"
                title="Clear custom window and reset to ALL"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
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
