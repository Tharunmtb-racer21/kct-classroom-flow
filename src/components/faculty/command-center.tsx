import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Zap,
  Bell,
  Radio,
  Users,
  FileText,
  BarChart3,
  AlertTriangle,
  PlusCircle,
  Activity,
  MapPin,
  Wifi,
  ShieldAlert,
  Clock,
  ArrowRight,
  CheckCircle2,
  Filter,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ==========================================
// Types & Contracts
// ==========================================

export type ActionType =
  | "EXAM_STARTING"
  | "EXAM_ACTIVE"
  | "RESULTS_READY"
  | "SUBMISSION_PENDING"
  | "NETWORK_ISSUE"
  | "INTEGRITY_REVIEW"
  | "SYSTEM_ALERT";

export type ActionPriority = "LOW" | "MEDIUM" | "HIGH";

export interface FacultyActionItem {
  id: string | number;
  type: ActionType;
  priority: ActionPriority;
  title: string;
  description: string;
  created_at: string;
  action: "VIEW_MONITOR" | "VIEW_RESULTS" | "START_EXAM" | "REVIEW_INTEGRITY" | "NAVIGATE";
  reference_id?: string;
}

export interface FacultyCommandCenterData {
  overview: {
    upcoming_exams: number;
    active_students: number;
    pending_results: number;
    alerts: number;
  };
  active_exam: {
    id: string | number;
    title: string;
    students_total: number;
    students_active: number;
    students_offline: number;
    students_unstable: number;
    integrity_events: number;
    course_code: string;
    room: string;
  };
  actions: FacultyActionItem[];
}

// ==========================================
// Mock Data
// ==========================================

const INITIAL_COMMAND_CENTER_DATA: FacultyCommandCenterData = {
  overview: {
    upcoming_exams: 3,
    active_students: 48,
    pending_results: 2,
    alerts: 4,
  },
  active_exam: {
    id: 21,
    title: "Mathematics - Semester Test",
    course_code: "MATH201",
    room: "Hall B-204",
    students_total: 50,
    students_active: 48,
    students_offline: 1,
    students_unstable: 1,
    integrity_events: 3,
  },
  actions: [
    {
      id: 101,
      type: "NETWORK_ISSUE",
      priority: "MEDIUM",
      title: "3 students experienced connection issues",
      description: "Subnet 10.2.14 reported transient jitter; telemetry heartbeats recovered.",
      created_at: "5m ago",
      action: "VIEW_MONITOR",
      reference_id: "21",
    },
    {
      id: 102,
      type: "INTEGRITY_REVIEW",
      priority: "MEDIUM",
      title: "2 sessions require integrity review",
      description: "Fullscreen exit anomaly detected during Section B questions.",
      created_at: "12m ago",
      action: "VIEW_MONITOR",
      reference_id: "21",
    },
    {
      id: 103,
      type: "RESULTS_READY",
      priority: "LOW",
      title: "Computer Science results are ready",
      description: "CS302 batch grading and ML engagement summaries completed.",
      created_at: "24m ago",
      action: "VIEW_RESULTS",
      reference_id: "cs302",
    },
    {
      id: 104,
      type: "EXAM_STARTING",
      priority: "HIGH",
      title: "Data Structures Practical starts in 15 minutes",
      description: "Room Lab 3 · Automated proctoring lock will engage upon launch.",
      created_at: "Just now",
      action: "START_EXAM",
      reference_id: "ds_lab",
    },
  ],
};

// ==========================================
// Subcomponent 1: Overview Cards (4 cards)
// Responsive: Desktop 4-col, Tablet 2-col, Mobile 1-col
// ==========================================

interface OverviewCardsProps {
  overview: FacultyCommandCenterData["overview"];
}

function OverviewCards({ overview }: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Upcoming Exams */}
      <Card className="glass border-border/40 hover:border-primary/40 transition-all duration-200">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming Exams
          </CardDescription>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <FileText className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl md:text-3xl font-bold tracking-tight">
            {overview.upcoming_exams}
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-blue-500 font-medium">Scheduled</span> this week
          </p>
        </CardContent>
      </Card>

      {/* 2. Active Students */}
      <Card className="glass border-border/40 hover:border-emerald-500/40 transition-all duration-200">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Students
          </CardDescription>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
            <Users className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-emerald-500">
            {overview.active_students}
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Active across sessions (Demo)
          </p>
        </CardContent>
      </Card>

      {/* 3. Pending Results */}
      <Card className="glass border-border/40 hover:border-purple-500/40 transition-all duration-200">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending Results
          </CardDescription>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
            <BarChart3 className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {overview.pending_results}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Awaiting faculty review
          </p>
        </CardContent>
      </Card>

      {/* 4. Action Alerts */}
      <Card className="glass border-border/40 hover:border-amber-500/40 transition-all duration-200">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Alerts
          </CardDescription>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-amber-500">
            {overview.alerts}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Requiring action / review
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ==========================================
// Subcomponent 2: Active Exam Card (Current Activity)
// ==========================================

interface ActiveExamCardProps {
  activeExam: FacultyCommandCenterData["active_exam"];
}

function ActiveExamCard({ activeExam }: ActiveExamCardProps) {
  const attendancePct = Math.round(
    (activeExam.students_active / activeExam.students_total) * 100,
  );

  return (
    <Card className="glass border-border/50 overflow-hidden relative shadow-lg">
      {/* Subtle top indicator strip */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-400" />

      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                SIMULATED EXAM SESSION
              </Badge>
              <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                {activeExam.course_code}
              </Badge>
              <span className="text-xs text-muted-foreground">{activeExam.room}</span>
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              {activeExam.title}
            </CardTitle>
          </div>

          <Link to="/dashboard/sessions">
            <Button size="sm" className="gradient-bg font-semibold gap-1.5 shadow-sm">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Live Proctor Console
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 space-y-4">
        {/* Attendance Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-medium">
              Student Attendance: {activeExam.students_active} / {activeExam.students_total}
            </span>
            <span className="font-semibold text-emerald-500">{attendancePct}% connected</span>
          </div>
          <Progress value={attendancePct} className="h-2" />
        </div>

        {/* Live Proctoring Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-accent/30 border border-border/40 text-center">
            <div className="text-xs text-muted-foreground font-medium">Active</div>
            <div className="text-xl font-bold text-emerald-500 mt-0.5">
              {activeExam.students_active}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-accent/30 border border-border/40 text-center">
            <div className="text-xs text-muted-foreground font-medium">Offline</div>
            <div className="text-xl font-bold text-rose-500 mt-0.5">
              {activeExam.students_offline}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-accent/30 border border-border/40 text-center">
            <div className="text-xs text-muted-foreground font-medium">Unstable</div>
            <div className="text-xl font-bold text-amber-500 mt-0.5">
              {activeExam.students_unstable}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-accent/30 border border-border/40 text-center">
            <div className="text-xs text-muted-foreground font-medium">Integrity Events</div>
            <div className="text-xl font-bold text-purple-400 mt-0.5">
              {activeExam.integrity_events}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================
// Subcomponent 3: Quick Actions Bar
// Navigation hub for key faculty workflows
// ==========================================

function QuickActionsBar() {
  const actions = [
    {
      title: "Create Exam",
      desc: "New assessment",
      icon: PlusCircle,
      href: "/dashboard/sessions",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Manage Students",
      desc: "Directory & roster",
      icon: Users,
      href: "/dashboard/sessions",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "View Results",
      desc: "Analytics & grades",
      icon: BarChart3,
      href: "/dashboard/reports",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Live Monitor",
      desc: "Security telemetry",
      icon: Activity,
      href: "/dashboard/security",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Live Map",
      desc: "Network topology",
      icon: MapPin,
      href: "/dashboard/sessions",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" /> Quick Navigation Hub
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.title}
              to={act.href}
              className="p-3.5 glass rounded-xl border border-border/40 hover:border-primary/50 hover:bg-accent/40 transition-all duration-150 flex flex-col items-center sm:items-start text-center sm:text-left group"
            >
              <div className={`p-2 rounded-lg ${act.bg} ${act.color} mb-2 group-hover:scale-105 transition-transform`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                {act.title}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{act.desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// Subcomponent 4: Action Center (Alert Items)
// Controlled action types with priority & triggers
// ==========================================

interface ActionCenterProps {
  actions: FacultyActionItem[];
  onDismiss: (id: string | number) => void;
}

function ActionCenter({ actions, onDismiss }: ActionCenterProps) {
  const navigate = useNavigate();
  const [filterPriority, setFilterPriority] = useState<"ALL" | ActionPriority>("ALL");

  const filteredActions =
    filterPriority === "ALL"
      ? actions
      : actions.filter((a) => a.priority === filterPriority);

  const handleActionClick = (item: FacultyActionItem) => {
    switch (item.action) {
      case "VIEW_MONITOR":
        toast.info(`Opening monitor for ${item.title}`);
        navigate({ to: "/dashboard/security" });
        break;
      case "VIEW_RESULTS":
        toast.info("Navigating to results & reports");
        navigate({ to: "/dashboard/reports" });
        break;
      case "START_EXAM":
        toast.info("Opening session orchestrator");
        navigate({ to: "/dashboard/sessions" });
        break;
      default:
        toast.success(`Action handled: ${item.action}`);
    }
  };

  const renderIcon = (type: ActionType) => {
    switch (type) {
      case "NETWORK_ISSUE":
        return <Wifi className="h-4 w-4 text-amber-500" />;
      case "INTEGRITY_REVIEW":
        return <ShieldAlert className="h-4 w-4 text-purple-400" />;
      case "RESULTS_READY":
        return <BarChart3 className="h-4 w-4 text-blue-500" />;
      case "EXAM_STARTING":
        return <Clock className="h-4 w-4 text-rose-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getPriorityBadge = (priority: ActionPriority) => {
    switch (priority) {
      case "HIGH":
        return (
          <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px] font-bold uppercase tracking-wider">
            High Priority
          </Badge>
        );
      case "MEDIUM":
        return (
          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
            Medium
          </Badge>
        );
      case "LOW":
        return (
          <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px] font-bold uppercase tracking-wider">
            Low
          </Badge>
        );
    }
  };

  return (
    <Card className="glass border-border/40 shadow-md">
      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-primary" /> Action Center
            </CardTitle>
            <CardDescription className="text-xs">
              System alerts, proctoring reviews, and urgent session conditions
            </CardDescription>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto" role="group" aria-label="Filter alerts by priority">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" aria-hidden="true" />
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                aria-label={`Filter by ${p.toLowerCase()} priority`}
                aria-pressed={filterPriority === p}
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                  filterPriority === p
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 space-y-3">
        {filteredActions.length > 0 ? (
          filteredActions.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl glass border border-border/40 hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Left Side: Icon & Content */}
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-2.5 rounded-lg bg-accent/40 border border-border/50 shrink-0 mt-0.5">
                  {renderIcon(item.type)}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {item.title}
                    </span>
                    {getPriorityBadge(item.priority)}
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {item.created_at}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/90 break-words">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Right Side: Action Trigger & Dismiss */}
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold gap-1.5 border-border/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-all"
                  onClick={() => handleActionClick(item)}
                >
                  Action
                  <ArrowRight className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Mark as handled"
                  aria-label={`Mark alert "${item.title}" as handled`}
                  onClick={() => onDismiss(item.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground text-xs rounded-xl border border-dashed border-border/60 space-y-1">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
            <div className="font-semibold text-foreground text-sm">All Clear!</div>
            <p>No active alerts matching the selected priority filter.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==========================================
// Main Faculty Command Center Container
// ==========================================

export function FacultyCommandCenter() {
  const [data, setData] = useState<FacultyCommandCenterData>(
    INITIAL_COMMAND_CENTER_DATA,
  );

  const handleDismissAction = (id: string | number) => {
    setData((prev) => ({
      ...prev,
      actions: prev.actions.filter((a) => a.id !== id),
      overview: {
        ...prev.overview,
        alerts: Math.max(0, prev.overview.alerts - 1),
      },
    }));
    toast.success("Alert dismissed");
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Command Center
          </h2>
        </div>
        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium">
          Preview Mode • Mock Telemetry
        </Badge>
      </div>

      {/* 1. Overview 4-Stat Cards */}
      <OverviewCards overview={data.overview} />

      {/* 2. Current Activity: Active Exam Card */}
      <ActiveExamCard activeExam={data.active_exam} />

      {/* 3. Quick Actions Navigation Hub */}
      <QuickActionsBar />

      {/* 4. Action Center Alerts */}
      <ActionCenter
        actions={data.actions}
        onDismiss={handleDismissAction}
      />
    </div>
  );
}
export default FacultyCommandCenter;
