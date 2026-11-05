import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileEdit,
  FileText,
  Flame,
  Globe,
  HardDrive,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  Menu,
  MessageSquare,
  Pencil,
  PieChart as PieChartIcon,
  Presentation,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Tag,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { auth } from "@/lib/firebase";
import { autoDraftStaleSessions, purgeEmptyTestSessions } from "@/lib/session-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatDisplayName } from "@/lib/utils";
import { verifyDevPassword } from "@/lib/dev-auth";
import { checkDeveloperAccess } from "@/lib/developer-access";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import {
  testAiKey,
  getAiKeySlotLabel,
  getAiKeyInventory,
  recordKeyDiagnosticAttempt,
  recordKeyDiagnosticResult,
} from "@/lib/ai-service";
import {
  getTokenSummary,
  getTokenLogs,
  clearTokenHistory,
  downloadTokenReportCSV,
  downloadTokenReportJSON,
  TokenSummary,
  TokenUsageRecord,
  AIProvider,
} from "@/lib/token-tracker";
import { downloadMLDatasetCSV } from "@/lib/ml-dataset-exporter";
import { isSupabaseServerDown, setSupabaseServerDown } from "@/lib/server-down-guard";
import { AdminSection, DeveloperSidebar, DeveloperSidebarContent } from "@/components/developer-sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SecurityIntelligenceView } from "@/components/developer/security-intelligence-view";
import { FacultySessionsModal } from "@/components/developer/faculty-sessions-modal";

type SessionRow = {
  id: string;
  title: string;
  code: string;
  status: "draft" | "live" | "ended";
  creator_id: string;
  created_at: string;
  current_question_id?: string | null;
  expires_at?: string | null;
};

type QuestionRow = {
  id: string;
  session_id: string;
  type: "wordcloud" | "poll" | "quiz";
  title: string;
  options?: any;
  correct_answer?: string | null;
  image_url?: string | null;
  created_at?: string;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  name: string;
  joined_at: string;
};

type ResponseRow = {
  id: string;
  question_id: string;
  participant_id: string;
  answer: string;
  created_at: string;
  image_url?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at?: string;
};

type LoginLogRow = {
  id: string;
  user_id: string;
  role: string;
  email: string | null;
  login_time: string;
  logout_time: string | null;
  session_duration: number | string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
  status: string;
};

type AuditLogItem = {
  index: number;
  id: string;
  tag: "AUTH" | "SESSION" | "RESPONSE" | "QUESTION" | "SYSTEM";
  msg: string;
  timestamp: string;
  isoDate: string;
  type: "info" | "success" | "warn" | "error";
};

type FailedAttemptRecord = {
  id: string;
  attempted_at: string;
  client_environment: string | null;
  user_agent: string | null;
  ip_address: string | null;
  status: string;
};

type ContactMessageRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  user_id: string | null;
  status: string;
};

function formatSubmissionDate(isoString: string): { dateStr: string; timeStr: string; fullStr: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { dateStr: isoString, timeStr: "", fullStr: isoString };
    }
    const dateStr = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const timeStr =
      d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }) + " IST";
    const fullStr = `${dateStr} • ${timeStr}`;
    return { dateStr, timeStr, fullStr };
  } catch {
    return { dateStr: isoString, timeStr: "", fullStr: isoString };
  }
}

export const Route = createFileRoute("/_authenticated/dashboard/developer")({
  head: () => ({
    meta: [
      { title: "KCT PULSE" },
      {
        name: "description",
        content:
          "Developer system monitor, Firebase/Supabase analytics, and live telemetry log suite.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeveloperDashboard,
});

function DeveloperDashboard() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [selectedContactMessage, setSelectedContactMessage] = useState<ContactMessageRow | null>(
    null,
  );
  const [deletingMessage, setDeletingMessage] = useState<ContactMessageRow | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const DEV_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  const handleLockDeveloper = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kct_dev_auth");
      sessionStorage.removeItem("kct_dev_auth_time");
      sessionStorage.removeItem("kct_dev_passkey");
    }
    setIsAuthenticated(false);
    setPasskey("");
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const isAuth = sessionStorage.getItem("kct_dev_auth") === "true";
      const authTime = Number(sessionStorage.getItem("kct_dev_auth_time") || "0");
      if (isAuth && authTime > 0 && Date.now() - authTime > DEV_TIMEOUT_MS) {
        handleLockDeveloper();
      } else if (isAuth) {
        setIsAuthenticated(true);
        const storedPass = sessionStorage.getItem("kct_dev_passkey");
        if (storedPass) {
          setPasskey(storedPass);
        }
      }
    }
  }, []);

  // 30-Minute Inactivity Auto-Lock Listener
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleLockDeveloper();
        toast.info("Developer portal locked after 30 minutes of inactivity.");
      }, DEV_TIMEOUT_MS);
    };

    resetInactivityTimer();

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetInactivityTimer));

    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, resetInactivityTimer));
    };
  }, [isAuthenticated]);

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLogRow[]>([]);
  const [timeframe, setTimeframe] = useState<"1D" | "7D" | "30D" | "ALL">("ALL");
  const [timeframeCounts, setTimeframeCounts] = useState<{
    participants: number;
    responses: number;
    questions: number;
    sessions: number;
  }>({ participants: 0, responses: 0, questions: 0, sessions: 0 });
  const [questionTypeCounts, setQuestionTypeCounts] = useState<{
    poll: number;
    wordcloud: number;
    quiz: number;
  }>({ poll: 0, wordcloud: 0, quiz: 0 });
  const [statusFilter, setStatusFilter] = useState<"ALL" | "live" | "draft" | "ended">("ALL");
  const [questionTypeFilter, setQuestionTypeFilter] = useState<
    "ALL" | "poll" | "wordcloud" | "quiz"
  >("ALL");
  const [logFilterTag, setLogFilterTag] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<SessionRow | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [failedAttempts, setFailedAttempts] = useState<FailedAttemptRecord[]>([]);
  const [isServerDown, setIsServerDown] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [facultySubTab, setFacultySubTab] = useState<"overview" | "list" | "breakdown">("overview");
  const [securitySubTab, setSecuritySubTab] = useState<"overview" | "failed_attempts" | "logins" | "waf">("overview");
  const [healthSubTab, setHealthSubTab] = useState<"infrastructure" | "ai_services" | "tokens">("infrastructure");
  const [questionsSubTab, setQuestionsSubTab] = useState<"management" | "analytics">("management");
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState<"ALL" | "Feedback" | "Bug" | "Feature" | "Inquiry">("ALL");
  const [demotingSessionId, setDemotingSessionId] = useState<string | null>(null);
  const [isDemotingAll, setIsDemotingAll] = useState(false);
  const [devRenameOpen, setDevRenameOpen] = useState(false);
  const [devRenameSession, setDevRenameSession] = useState<SessionRow | null>(null);
  const [devNewTitle, setDevNewTitle] = useState("");
  const [devRenaming, setDevRenaming] = useState(false);

  useEffect(() => {
    setIsServerDown(isSupabaseServerDown());
  }, []);

  const handleToggleServerDown = () => {
    const nextState = !isServerDown;
    setSupabaseServerDown(nextState);
    setIsServerDown(nextState);
    if (nextState) {
      toast.error(
        "🚨 SUPABASE SERVER DOWN MODE ENABLED! Main app will display emergency developer contact warning.",
        {
          duration: 6000,
        },
      );
    } else {
      toast.success(
        "🟢 SUPABASE SERVER DOWN MODE DISABLED! Main app restored to normal operation.",
        {
          duration: 6000,
        },
      );
    }
  };

  // Groq API Keys Telemetry State
  const [groqKeysStatus, setGroqKeysStatus] = useState<
    Record<
      number,
      {
        status: "unchecked" | "testing" | "active" | "rate_limited" | "invalid" | "error";
        errorMsg?: string;
      }
    >
  >({});

  // Number of AI key slots configured in server environment variables.
  // Keys never reach the browser; diagnostics require a signed-in admin account.
  const [aiKeyCounts, setAiKeyCounts] = useState<{ groq: number; gemini: number }>({
    groq: 0,
    gemini: 0,
  });
  const [aiKeyInventoryError, setAiKeyInventoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getAiKeyInventory()
      .then((counts) => {
        if (cancelled) return;
        setAiKeyCounts(counts);
        setAiKeyInventoryError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAiKeyCounts({ groq: 0, gemini: 0 });
        setAiKeyInventoryError(
          err instanceof Error ? err.message : "AI key diagnostics are unavailable.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const [keyUsageData, setKeyUsageData] = useState<
    Record<string, { attempts: number; successes: number; failures: number; lastUsed: string }>
  >({});
  const [testingAllKeys, setTestingAllKeys] = useState(false);

  // Load key usage stats from localStorage
  const loadKeyUsage = () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kct_ai_key_usage") || "{}";
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        // Drop legacy entries keyed by partial API key text; keep only non-secret slot labels.
        const cleaned = Object.fromEntries(
          Object.entries(parsed).filter(([k]) => /^(Groq|Gemini) slot #d+$/.test(k)),
        );
        if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
          localStorage.setItem("kct_ai_key_usage", JSON.stringify(cleaned));
        }
        setKeyUsageData(cleaned as typeof keyUsageData);
      } catch (e) {
        console.error("Failed to parse key usage data:", e);
      }
    }
  };

  useEffect(() => {
    loadKeyUsage();
  }, []);

  const handleTestKey = async (idx: number) => {
    const sig = getAiKeySlotLabel("groq", idx);
    recordKeyDiagnosticAttempt(sig);
    loadKeyUsage();
    setGroqKeysStatus((prev) => ({ ...prev, [idx]: { status: "testing" } }));

    let result: {
      status: "active" | "rate_limited" | "invalid" | "error";
      errorMsg?: string;
    } = {
      status: "error",
      errorMsg: "Network error",
    };

    try {
      result = await testAiKey("groq", idx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      result = {
        status: "error",
        errorMsg: msg,
      };
    } finally {
      const isSuccess = result.status === "active";
      recordKeyDiagnosticResult(sig, isSuccess);
      setGroqKeysStatus((prev) => ({ ...prev, [idx]: result }));
      loadKeyUsage();
    }
  };

  const handleTestAllKeys = async () => {
    setTestingAllKeys(true);
    toast.info("Testing all Groq API key slots...");
    for (let i = 0; i < aiKeyCounts.groq; i++) {
      await handleTestKey(i);
    }
    setTestingAllKeys(false);
    toast.success("Finished testing all Groq keys.");
  };

  // Google Gemini API key slot telemetry state
  const [geminiKeysStatus, setGeminiKeysStatus] = useState<
    Record<
      number,
      {
        status: "unchecked" | "testing" | "active" | "rate_limited" | "invalid" | "error";
        errorMsg?: string;
      }
    >
  >({});
  const [testingAllGeminiKeys, setTestingAllGeminiKeys] = useState(false);

  const handleTestGeminiKey = async (idx: number) => {
    const sig = getAiKeySlotLabel("gemini", idx);
    recordKeyDiagnosticAttempt(sig);
    loadKeyUsage();
    setGeminiKeysStatus((prev) => ({ ...prev, [idx]: { status: "testing" } }));

    let result: {
      status: "active" | "rate_limited" | "invalid" | "error";
      errorMsg?: string;
    } = {
      status: "error",
      errorMsg: "Network error",
    };

    try {
      result = await testAiKey("gemini", idx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      result = {
        status: "error",
        errorMsg: msg,
      };
    } finally {
      const isSuccess = result.status === "active";
      recordKeyDiagnosticResult(sig, isSuccess);
      setGeminiKeysStatus((prev) => ({ ...prev, [idx]: result }));
      loadKeyUsage();
    }
  };

  const handleTestAllGeminiKeys = async () => {
    setTestingAllGeminiKeys(true);
    toast.info("Testing all Google Gemini API key slots...");
    for (let i = 0; i < aiKeyCounts.gemini; i++) {
      await handleTestGeminiKey(i);
    }
    setTestingAllGeminiKeys(false);
    toast.success("Finished testing all Gemini keys.");
  };

  // AI Key Account / Owner Names (persisted in localStorage)
  const [geminiKeyOwners, setGeminiKeyOwners] = useState<Record<number, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("kct_gemini_key_owners");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [groqKeyOwners, setGroqKeyOwners] = useState<Record<number, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("kct_groq_key_owners");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [editingKeyModal, setEditingKeyModal] = useState<{
    type: "gemini" | "groq";
    index: number;
  } | null>(null);
  const [editingKeyNameInput, setEditingKeyNameInput] = useState("");

  const handleOpenEditKeyOwner = (type: "gemini" | "groq", index: number) => {
    const current = type === "gemini" ? geminiKeyOwners[index] : groqKeyOwners[index];
    setEditingKeyNameInput(current || "");
    setEditingKeyModal({ type, index });
  };

  const handleSaveKeyOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKeyModal) return;
    const { type, index } = editingKeyModal;
    const trimmed = editingKeyNameInput.trim();

    if (type === "gemini") {
      setGeminiKeyOwners((prev) => {
        const next = { ...prev, [index]: trimmed };
        try {
          localStorage.setItem("kct_gemini_key_owners", JSON.stringify(next));
        } catch {}
        return next;
      });
      toast.success(`Google Account / Owner for Gemini Key #${index + 1} updated! ✏️`);
    } else {
      setGroqKeyOwners((prev) => {
        const next = { ...prev, [index]: trimmed };
        try {
          localStorage.setItem("kct_groq_key_owners", JSON.stringify(next));
        } catch {}
        return next;
      });
      toast.success(`Account / Owner for Groq Key #${index + 1} updated! ✏️`);
    }
    setEditingKeyModal(null);
  };

  // Faculty Name Overrides (persisted in localStorage for unlinked creators)
  const [facultyNameOverrides, setFacultyNameOverrides] = useState<
    Record<string, { name: string; email?: string }>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("kct_faculty_name_overrides");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [editingFacultyModal, setEditingFacultyModal] = useState<{
    creatorId: string;
    currentName: string;
    currentEmail: string;
  } | null>(null);

  const [selectedFacultyForReports, setSelectedFacultyForReports] = useState<{
    creator_id: string;
    name: string;
    email: string;
    isOnline?: boolean;
  } | null>(null);
  const [editingFacultyName, setEditingFacultyName] = useState("");
  const [editingFacultyEmail, setEditingFacultyEmail] = useState("");

  const handleSaveFacultyOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacultyModal) return;
    const { creatorId } = editingFacultyModal;
    const trimmedName = editingFacultyName.trim();
    const trimmedEmail = editingFacultyEmail.trim();

    setFacultyNameOverrides((prev) => {
      const next = {
        ...prev,
        [creatorId]: {
          name: trimmedName,
          email: trimmedEmail || "No email synced",
        },
      };
      try {
        localStorage.setItem("kct_faculty_name_overrides", JSON.stringify(next));
      } catch {}
      return next;
    });

    toast.success(`Faculty name updated for ${trimmedName}! ✏️`);
    setEditingFacultyModal(null);
  };

  // AI Token Telemetry State
  const [tokenSummary, setTokenSummary] = useState<TokenSummary>(getTokenSummary);
  const [tokenLogs, setTokenLogs] = useState<TokenUsageRecord[]>(getTokenLogs);
  const [tokenProviderFilter, setTokenProviderFilter] = useState<string>("all");
  const [tokenSearchFilter, setTokenSearchFilter] = useState<string>("");

  const reloadTokens = () => {
    setTokenSummary(getTokenSummary());
    setTokenLogs(getTokenLogs());
  };

  useEffect(() => {
    reloadTokens();
    const handleUpdate = () => reloadTokens();
    window.addEventListener("kct_token_usage_updated", handleUpdate);
    return () => window.removeEventListener("kct_token_usage_updated", handleUpdate);
  }, []);

  const handleClearTokens = () => {
    if (window.confirm("Are you sure you want to reset all token usage counters and audit logs?")) {
      clearTokenHistory();
      reloadTokens();
      toast.success("Token usage history cleared.");
    }
  };

  // Filtered Token Logs
  const filteredTokenLogs = useMemo(() => {
    return tokenLogs.filter((log) => {
      const matchesProvider =
        tokenProviderFilter === "all" || log.provider.toLowerCase() === tokenProviderFilter.toLowerCase();
      const q = tokenSearchFilter.toLowerCase().trim();
      const matchesSearch =
        !q ||
        log.model.toLowerCase().includes(q) ||
        log.keySignature.toLowerCase().includes(q) ||
        log.feature.toLowerCase().includes(q);
      return matchesProvider && matchesSearch;
    });
  }, [tokenLogs, tokenProviderFilter, tokenSearchFilter]);

  // Chart Data: AI Token Distribution by Provider
  const tokenProviderChartData = useMemo(() => {
    const raw = [
      { name: "Google Gemini", value: tokenSummary.byProvider.gemini?.totalTokens || 0, color: "#06b6d4" },
      { name: "Groq", value: tokenSummary.byProvider.groq?.totalTokens || 0, color: "#f59e0b" },
      { name: "NVIDIA NIM", value: tokenSummary.byProvider.nvidia?.totalTokens || 0, color: "#10b981" },
      { name: "Together AI", value: tokenSummary.byProvider.together?.totalTokens || 0, color: "#a855f7" },
    ];
    const hasData = raw.some((d) => d.value > 0);
    if (!hasData) {
      return [
        { name: "Gemini", value: 45, color: "#06b6d4" },
        { name: "Groq", value: 35, color: "#f59e0b" },
        { name: "NVIDIA NIM", value: 12, color: "#10b981" },
        { name: "Together AI", value: 8, color: "#a855f7" },
      ];
    }
    return raw.filter((d) => d.value > 0);
  }, [tokenSummary]);

  // Chart Data: Prompt vs Completion Tokens Comparison
  const tokenPromptVsCompletionData = useMemo(() => {
    const providers: { key: AIProvider; label: string }[] = [
      { key: "gemini", label: "Gemini" },
      { key: "groq", label: "Groq" },
      { key: "nvidia", label: "NVIDIA" },
      { key: "together", label: "Together" },
    ];
    const hasData = Object.values(tokenSummary.byProvider).some((p) => p.totalTokens > 0);
    if (!hasData) {
      return [
        { provider: "Gemini", prompt: 1420, completion: 2850, total: 4270 },
        { provider: "Groq", prompt: 820, completion: 1940, total: 2760 },
        { provider: "NVIDIA", prompt: 450, completion: 920, total: 1370 },
        { provider: "Together", prompt: 310, completion: 680, total: 990 },
      ];
    }
    return providers.map((p) => {
      const stats = tokenSummary.byProvider[p.key];
      return {
        provider: p.label,
        prompt: stats?.promptTokens || 0,
        completion: stats?.completionTokens || 0,
        total: stats?.totalTokens || 0,
      };
    });
  }, [tokenSummary]);

  // Chart Data: Question Types Distribution
  const questionTypeChartData = useMemo(() => {
    const polls = questionTypeCounts.poll;
    const wordclouds = questionTypeCounts.wordcloud;
    const quizzes = questionTypeCounts.quiz;
    const total = polls + wordclouds + quizzes;
    if (total === 0) {
      return [
        { name: "Polls", value: 1, color: "#06b6d4" },
        { name: "Wordclouds", value: 1, color: "#a855f7" },
        { name: "Quizzes", value: 1, color: "#10b981" },
      ];
    }
    return [
      { name: "Polls", value: polls, color: "#06b6d4" },
      { name: "Wordclouds", value: wordclouds, color: "#a855f7" },
      { name: "Quizzes", value: quizzes, color: "#10b981" },
    ];
  }, [questionTypeCounts]);

  // Chart Data: Session Status Breakdown
  const sessionStatusChartData = useMemo(() => {
    const live = sessions.filter((s) => s.status === "live").length;
    const draft = sessions.filter((s) => s.status === "draft").length;
    const ended = sessions.filter((s) => s.status === "ended").length;
    const total = live + draft + ended;
    if (total === 0) {
      return [
        { name: "Live", value: 0, color: "#10b981" },
        { name: "Draft", value: 1, color: "#f59e0b" },
        { name: "Ended", value: 0, color: "#64748b" },
      ];
    }
    return [
      { name: "Live", value: live, color: "#10b981" },
      { name: "Draft", value: draft, color: "#f59e0b" },
      { name: "Ended", value: ended, color: "#64748b" },
    ];
  }, [sessions]);

  // Recent Failed Attempts calculation (sliding 24-hour window)
  const recentFailedAttempts = useMemo(() => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return failedAttempts.filter(
      (a) => a.attempted_at && a.attempted_at >= twentyFourHoursAgo,
    );
  }, [failedAttempts]);

  interface PlatformActivityDataPoint {
    date: string;
    label: string;
    sessions: number;
    responses: number | null;
    joins: number | null;
    isToday?: boolean;
    responsesError?: string | null;
    joinsError?: string | null;
    hasError?: boolean;
  }

  // Exact, uncapped platform activity data fetched via PostgREST HEAD count per timeframe bucket
  const [activityTrendData, setActivityTrendData] = useState<PlatformActivityDataPoint[]>([]);
  const [activityTrendLoading, setActivityTrendLoading] = useState(false);
  const [activityTrendError, setActivityTrendError] = useState<string | null>(null);
  const [activityTrendRetryCount, setActivityTrendRetryCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let isCancelled = false;

    const fetchActivityTrends = async () => {
      setActivityTrendLoading(true);
      setActivityTrendError(null);
      try {
        const now = new Date();
        const todayUtcStr = now.toISOString().slice(0, 10);
        const intervals: { start: string; end: string; dateStr: string; label: string; isToday: boolean }[] = [];

        if (timeframe === "1D") {
          // Last 24 hours divided into 6 4-hour intervals
          for (let i = 5; i >= 0; i--) {
            const end = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
            const start = new Date(end.getTime() - 4 * 60 * 60 * 1000);
            const label = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            intervals.push({
              start: start.toISOString(),
              end: end.toISOString(),
              dateStr: end.toISOString().slice(0, 10),
              label,
              isToday: i === 0,
            });
          }
        } else {
          // 7D: 7 full daily intervals; 30D / ALL: 30 daily intervals
          const dayCount = timeframe === "7D" ? 7 : 30;
          for (let i = dayCount - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setUTCDate(d.getUTCDate() - i);
            d.setUTCHours(0, 0, 0, 0);
            const start = d.toISOString();
            const dEnd = new Date(d);
            dEnd.setUTCDate(dEnd.getUTCDate() + 1);
            const end = dEnd.toISOString();
            const dateStr = start.slice(0, 10);
            const isToday = dateStr === todayUtcStr;
            const label = d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              weekday: dayCount <= 7 ? "short" : undefined,
              timeZone: "UTC",
            });
            intervals.push({ start, end, dateStr, label, isToday });
          }
        }

        let firstQueryError: string | null = null;
        const points = await Promise.all(
          intervals.map(async ({ start, end, dateStr, label, isToday }) => {
            const sessCount = sessions.filter((s) => {
              if (!s.created_at) return false;
              return s.created_at >= start && s.created_at < end;
            }).length;

            const [respRes, partRes] = await Promise.all([
              supabase
                .from("responses")
                .select("id", { count: "exact", head: true })
                .gte("created_at", start)
                .lt("created_at", end),
              supabase
                .from("participants")
                .select("id", { count: "exact", head: true })
                .gte("joined_at", start)
                .lt("joined_at", end),
            ]);

            const respError = respRes.error?.message || null;
            const partError = partRes.error?.message || null;
            if ((respError || partError) && !firstQueryError) {
              firstQueryError = respError || partError || "Failed to query activity bucket";
            }

            return {
              date: dateStr,
              label,
              sessions: sessCount,
              responses: respError ? null : (respRes.count ?? 0),
              joins: partError ? null : (partRes.count ?? 0),
              isToday,
              responsesError: respError,
              joinsError: partError,
              hasError: Boolean(respError || partError),
            };
          }),
        );

        if (!isCancelled) {
          setActivityTrendData(points);
          if (firstQueryError) {
            setActivityTrendError(firstQueryError);
          }
        }
      } catch (err: unknown) {
        console.warn("[DeveloperTelemetry] Error fetching activity trends:", err);
        if (!isCancelled) {
          setActivityTrendError(err instanceof Error ? err.message : "Failed to load activity trends");
        }
      } finally {
        if (!isCancelled) {
          setActivityTrendLoading(false);
        }
      }
    };

    fetchActivityTrends();

    return () => {
      isCancelled = true;
    };
  }, [timeframe, isAuthenticated, sessions.length, activityTrendRetryCount]);

  const recordFailedAttempt = async () => {
    if (typeof window === "undefined") return;
    try {
      const clientEnv = navigator.userAgent.includes("Windows")
        ? "Windows Client"
        : navigator.userAgent.includes("Mac")
          ? "macOS Client"
          : navigator.userAgent.includes("Android")
            ? "Android Device"
            : navigator.userAgent.includes("iPhone")
              ? "iPhone Device"
              : "Web Client";

      // Non-blocking asynchronous RPC call (candidate password is never sent or logged)
      await (supabase.rpc as any)("record_developer_failed_attempt", {
        client_env: clientEnv,
      });
    } catch (err) {
      console.warn("[DeveloperTelemetry] Non-blocking failed attempt telemetry notice:", err);
    }
  };

  const getActivePasskey = (override?: string): string | null => {
    if (typeof override === "string" && override.trim()) return override.trim();
    if (passkey && passkey.trim()) return passkey.trim();
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("kct_dev_passkey");
      if (stored && stored.trim()) return stored.trim();
    }
    return null;
  };

  const handleClearFailedAttempts = async () => {
    try {
      const { error } = await (supabase.rpc as any)("clear_developer_access_logs", {
        dev_passkey: getActivePasskey(),
      });
      if (error) throw error;
      setFailedAttempts([]);
      toast.success("Security access logs cleared.");
      addAuditLog("Developer access attempt logs purged", "SYSTEM", "warn");
    } catch (err: any) {
      console.error("Failed to clear access logs:", err);
      toast.error(`Failed to clear access logs: ${err?.message || "Unknown error"}`);
    }
  };

  // Passkey Login Handler (SHA-256 hash comparison - plaintext never in bundle)
  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthenticating(true);
    try {
      const cleanPasskey = passkey.trim();
      const isValid = await verifyDevPassword(cleanPasskey);
      if (isValid) {
        setIsAuthenticated(true);
        setErrorMsg("");
        if (typeof window !== "undefined") {
          sessionStorage.setItem("kct_dev_auth", "true");
          sessionStorage.setItem("kct_dev_auth_time", Date.now().toString());
          sessionStorage.setItem("kct_dev_passkey", cleanPasskey);
        }
        loadData(cleanPasskey);
      } else {
        setErrorMsg("Access Denied: Incorrect developer password.");
        recordFailedAttempt();
      }
    } finally {
      setAuthenticating(false);
    }
  };

  const addAuditLog = (
    msg: string,
    tag: "AUTH" | "SESSION" | "RESPONSE" | "QUESTION" | "SYSTEM" = "SYSTEM",
    type: "info" | "success" | "warn" | "error" = "info",
    isoDate?: string,
  ) => {
    const logIso = isoDate || new Date().toISOString();
    setAuditLogs((prev) => {
      const nextIdx = prev.length + 1;
      return [
        {
          index: nextIdx,
          id: `LOG-${String(nextIdx).padStart(4, "0")}`,
          tag,
          msg,
          timestamp: new Date(logIso).toLocaleString(),
          isoDate: logIso,
          type,
        },
        ...prev,
      ];
    });
  };

  // Load All System Analytics & Records
  const loadData = async (triggerOrPasskey?: unknown) => {
    setLoading(true);
    const startPing = performance.now();
    const activePasskey =
      typeof triggerOrPasskey === "string" ? getActivePasskey(triggerOrPasskey) : getActivePasskey();
    try {
      // 1. Fetch Sessions
      const { data: sData } = await supabase
        .from("sessions")
        .select("id,title,code,status,creator_id,created_at,current_question_id,expires_at")
        .order("created_at", { ascending: false });

      // 2. Fetch Questions
      const { data: qData } = await supabase
        .from("questions")
        .select("id,session_id,type,title,options,correct_answer,image_url,created_at")
        .order("created_at", { ascending: false });

      // 3. Fetch Participants
      const { data: pData } = await supabase
        .from("participants")
        .select("id,session_id,name,joined_at")
        .order("joined_at", { ascending: false });

      // 4. Fetch Responses
      const { data: rData } = await supabase
        .from("responses")
        .select("id,question_id,participant_id,answer,created_at,image_url")
        .order("created_at", { ascending: false });

      // 5. Fetch Profiles (using secure developer RPC, falling back to direct query)
      let profRows: ProfileRow[] = [];
      try {
        const { data: rpcProfiles, error: rpcErr } = await (supabase.rpc as any)(
          "get_developer_faculty_profiles",
          { dev_passkey: activePasskey },
        );

        if (!rpcErr && rpcProfiles && Array.isArray(rpcProfiles)) {
          profRows = rpcProfiles as ProfileRow[];
        } else {
          if (rpcErr) {
            console.warn("[DeveloperTelemetry] RPC load notice, falling back:", rpcErr.message);
          }
          const { data: directProf } = await supabase
            .from("profiles")
            .select("id,full_name,email,avatar_url,created_at")
            .order("created_at", { ascending: false });
          profRows = (directProf as ProfileRow[]) || [];
        }
      } catch (err) {
        console.warn("[DeveloperTelemetry] Error loading profiles:", err);
      }

      // 6. Fetch Login Logs (via secure developer RPC)
      let lRows: LoginLogRow[] = [];
      try {
        const { data: rpcLogs, error: rpcErr } = await (supabase.rpc as any)(
          "get_developer_login_logs",
          { dev_passkey: activePasskey, p_limit: 100 },
        );

        if (!rpcErr && rpcLogs && Array.isArray(rpcLogs)) {
          lRows = rpcLogs as LoginLogRow[];
        } else if (rpcErr) {
          console.warn("[DeveloperTelemetry] Error loading login logs via RPC:", rpcErr.message);
        }
      } catch (err) {
        console.warn("[DeveloperTelemetry] Error loading login logs:", err);
      }

      // 7. Fetch Contact Messages (via secure developer RPC)
      let cmRows: ContactMessageRow[] = [];
      try {
        const { data: rpcMessages, error: rpcErr } = await (supabase.rpc as any)(
          "get_developer_contact_messages",
          { dev_passkey: activePasskey, p_limit: 200 },
        );

        if (!rpcErr && rpcMessages && Array.isArray(rpcMessages)) {
          cmRows = rpcMessages as ContactMessageRow[];
        } else if (rpcErr) {
          console.warn("[DeveloperTelemetry] Error loading contact messages via RPC:", rpcErr.message);
        }
      } catch (err) {
        console.warn("[DeveloperTelemetry] Error loading contact messages:", err);
      }

      // 8. Fetch Developer Access Logs (via secure developer RPC)
      let alRows: FailedAttemptRecord[] = [];
      try {
        const { data: rpcAccessLogs, error: rpcAccessErr } = await (supabase.rpc as any)(
          "get_developer_access_logs",
          { dev_passkey: activePasskey, p_limit: 100 },
        );

        if (!rpcAccessErr && rpcAccessLogs && Array.isArray(rpcAccessLogs)) {
          alRows = rpcAccessLogs as FailedAttemptRecord[];
        } else if (rpcAccessErr) {
          console.warn("[DeveloperTelemetry] Error loading access logs via RPC:", rpcAccessErr.message);
        }
      } catch (err) {
        console.warn("[DeveloperTelemetry] Error loading access logs:", err);
      }

      const pingEnd = performance.now();
      setApiLatencyMs(Math.round(pingEnd - startPing));

      const sRows = (sData as SessionRow[]) || [];
      const qRows = (qData as QuestionRow[]) || [];
      const pRows = (pData as ParticipantRow[]) || [];
      const rRows = (rData as ResponseRow[]) || [];

      setSessions(sRows);
      setQuestions(qRows);
      setParticipants(pRows);
      setResponses(rRows);
      setProfiles(profRows);
      setLoginLogs(lRows);
      setContactMessages(cmRows);
      setFailedAttempts(alRows);

      // Re-populate audit log history
      const initialLogs: AuditLogItem[] = [];
      let counter = 1;

      sRows.slice(0, 15).forEach((s) => {
        const cId = (s.creator_id || "anonymous").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "SESSION",
          msg: `Session '${s.title || "Untitled"}' (${s.code || "----"}) created by creator ${cId}... [Status: ${s.status}]`,
          timestamp: s.created_at
            ? new Date(s.created_at).toLocaleString()
            : new Date().toLocaleString(),
          isoDate: s.created_at || new Date().toISOString(),
          type: s.status === "live" ? "success" : "info",
        });
      });

      pRows.slice(0, 15).forEach((p) => {
        const sId = (p.session_id || "unknown").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "AUTH",
          msg: `Student participant '${p.name || "Student"}' joined session ID ${sId}...`,
          timestamp: p.joined_at
            ? new Date(p.joined_at).toLocaleString()
            : new Date().toLocaleString(),
          isoDate: p.joined_at || new Date().toISOString(),
          type: "info",
        });
      });

      rRows.slice(0, 15).forEach((r) => {
        const qId = (r.question_id || "unknown").slice(0, 8);
        initialLogs.push({
          index: counter,
          id: `LOG-${String(counter++).padStart(4, "0")}`,
          tag: "RESPONSE",
          msg: `Student response recorded for question ${qId}... -> Answer: '${r.answer || ""}'`,
          timestamp: r.created_at
            ? new Date(r.created_at).toLocaleString()
            : new Date().toLocaleString(),
          isoDate: r.created_at || new Date().toISOString(),
          type: "success",
        });
      });

      initialLogs.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
      setAuditLogs(initialLogs);
    } catch (err: any) {
      console.error("Developer dashboard error:", err);
      addAuditLog(`Data telemetry error: ${err.message}`, "SYSTEM", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRunCleanup = async () => {
    await autoDraftStaleSessions();
    addAuditLog(
      "Manual stale sessions cleanup executed (Sessions active > 1h auto-drafted)",
      "SYSTEM",
      "warn",
    );
    await loadData();
  };

  const handlePurgeEmptySessions = async () => {
    const count = await purgeEmptyTestSessions();
    addAuditLog(
      `Database Purge: Cleaned up ${count} empty draft test session(s)`,
      "SYSTEM",
      "warn",
    );
    await loadData();
  };

  const handleMakeSessionDraft = async (sessionId: string, sessionTitle: string) => {
    try {
      setDemotingSessionId(sessionId);
      const { data, error } = await (supabase.rpc as any)("developer_demote_live_sessions", {
        dev_passkey: getActivePasskey(),
        target_session_ids: [sessionId],
      });

      if (error) throw error;
      if ((data ?? 0) !== 1) {
        throw new Error("No live session was updated. It may already be draft/ended or blocked by policy.");
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, status: "draft", expires_at: null, current_question_id: null }
            : s,
        ),
      );
      addAuditLog(
        `Session '${sessionTitle || sessionId.slice(0, 8)}' changed from LIVE to DRAFT by developer.`,
        "SESSION",
        "warn",
      );
      toast.success(`Session "${sessionTitle || sessionId.slice(0, 8)}" converted to Draft mode.`);
    } catch (err: any) {
      console.error("Failed to demote session to draft:", err);
      toast.error(`Failed to change session status: ${err?.message || "Unknown error"}`);
    } finally {
      setDemotingSessionId(null);
    }
  };

  const handleOpenDevRename = (s: SessionRow) => {
    setDevRenameSession(s);
    setDevNewTitle(s.title);
    setDevRenameOpen(true);
  };

  const handleSaveDevRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devRenameSession || !devNewTitle.trim()) return;
    setDevRenaming(true);
    try {
      const trimmed = devNewTitle.trim();
      const { error } = await supabase
        .from("sessions")
        .update({ title: trimmed })
        .eq("id", devRenameSession.id);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((s) => (s.id === devRenameSession.id ? { ...s, title: trimmed } : s)),
      );
      addAuditLog(
        `Session '${devRenameSession.id.slice(0, 8)}' renamed from '${devRenameSession.title}' to '${trimmed}' by developer.`,
        "SESSION",
        "info",
      );
      toast.success("Session renamed successfully! ✏️");
      setDevRenameOpen(false);
      setDevRenameSession(null);
    } catch (err: any) {
      console.error("Rename session error:", err);
      toast.error(`Failed to rename session: ${err?.message || "Unknown error"}`);
    } finally {
      setDevRenaming(false);
    }
  };

  const handleDemoteAllLiveToDraft = async () => {
    const liveIds = sessions.filter((s) => s.status === "live").map((s) => s.id);
    if (liveIds.length === 0) {
      toast.info("No live sessions currently found.");
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to demote all ${liveIds.length} live session(s) back to draft mode? Active students will be disconnected.`,
      )
    ) {
      return;
    }

    try {
      setIsDemotingAll(true);
      const { data, error } = await (supabase.rpc as any)("developer_demote_live_sessions", {
        dev_passkey: getActivePasskey(),
        target_session_ids: liveIds,
      });

      if (error) throw error;
      if ((data ?? 0) !== liveIds.length) {
        throw new Error(`Only ${data ?? 0} of ${liveIds.length} live session(s) were updated.`);
      }

      setSessions((prev) =>
        prev.map((s) =>
          liveIds.includes(s.id)
            ? { ...s, status: "draft", expires_at: null, current_question_id: null }
            : s,
        ),
      );
      addAuditLog(
        `Bulk operation: Reverted ${liveIds.length} live session(s) back to DRAFT mode by developer.`,
        "SESSION",
        "warn",
      );
      toast.success(`${liveIds.length} live session(s) successfully converted to draft mode.`);
    } catch (err: any) {
      console.error("Failed to bulk demote live sessions:", err);
      toast.error(`Failed to demote sessions: ${err?.message || "Unknown error"}`);
    } finally {
      setIsDemotingAll(false);
    }
  };

  const handleMakeFacultyLiveSessionsDraft = async (
    creatorId: string,
    facultyName?: string | null,
  ) => {
    const facultyLiveIds = sessions
      .filter((s) => s.creator_id === creatorId && s.status === "live")
      .map((s) => s.id);

    if (facultyLiveIds.length === 0) {
      toast.info("No live sessions found for this faculty member.");
      return;
    }

    try {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "draft", expires_at: null, current_question_id: null })
        .in("id", facultyLiveIds);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((s) =>
          facultyLiveIds.includes(s.id)
            ? { ...s, status: "draft", expires_at: null, current_question_id: null }
            : s,
        ),
      );
      addAuditLog(
        `Demoted ${facultyLiveIds.length} live session(s) of faculty '${facultyName || creatorId.slice(0, 8)}' to DRAFT.`,
        "SESSION",
        "warn",
      );
      toast.success(
        `Converted ${facultyLiveIds.length} live session(s) to draft for ${facultyName || "faculty"}.`,
      );
    } catch (err: any) {
      console.error("Failed to demote faculty sessions:", err);
      toast.error(`Failed to demote sessions: ${err?.message || "Unknown error"}`);
    }
  };

  const handleUpdateMessageStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await (supabase.rpc as any)(
        "developer_update_contact_message_status",
        {
          dev_passkey: getActivePasskey(),
          target_id: id,
          new_status: newStatus,
        },
      );
      if (error) throw error;

      setContactMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, status: newStatus } : msg)),
      );
      toast.success(`Message marked as ${newStatus}`);
      addAuditLog(
        `Contact Message status updated to ${newStatus} for message ${id.slice(0, 8)}`,
        "SYSTEM",
        "success",
      );
    } catch (err: any) {
      console.error("Failed to update message status:", err);
      toast.error(`Failed to update message: ${err?.message || "Unknown error"}`);
    }
  };

  const confirmDeleteMessage = async () => {
    if (!deletingMessage) return;
    const targetId = deletingMessage.id;
    try {
      setIsDeletingMessage(true);
      const { error } = await (supabase.rpc as any)(
        "developer_delete_contact_message",
        { dev_passkey: getActivePasskey(), target_id: targetId },
      );

      if (error) throw error;

      setContactMessages((prev) => prev.filter((msg) => msg.id !== targetId));
      if (selectedContactMessage?.id === targetId) {
        setSelectedContactMessage(null);
      }
      toast.success("Feedback message deleted successfully.");
      addAuditLog(`Contact Message ${targetId.slice(0, 8)} deleted`, "SYSTEM", "warn");
      setDeletingMessage(null);
    } catch (err: any) {
      console.error("Failed to delete contact message:", err);
      toast.error(`Failed to delete message: ${err?.message || "Unknown error"}`);
    } finally {
      setIsDeletingMessage(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();

    const sysChannel = supabase
      .channel("dev-telemetry-suite")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        const s = payload.new as SessionRow;
        addAuditLog(
          `Session state updated: '${s?.title || (payload.old as SessionRow)?.id}' -> [Status: ${s?.status}]`,
          "SESSION",
          "success",
        );
        loadData();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "participants" },
        (payload) => {
          const p = payload.new as ParticipantRow;
          addAuditLog(`Live Student '${p?.name || "Student"}' joined session`, "AUTH", "info");
          setParticipants((prev) => [p, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contact_messages" },
        (payload) => {
          const cm = payload.new as ContactMessageRow;
          addAuditLog(
            `New feedback message received from '${cm?.name || "User"}'`,
            "SYSTEM",
            "success",
          );
          setContactMessages((prev) => [cm, ...prev]);
          toast.info(`New feedback message from ${cm?.name}!`);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "responses" },
        (payload) => {
          const r = payload.new as ResponseRow;
          addAuditLog(`New response received: '${r?.answer || ""}'`, "RESPONSE", "success");
          setResponses((prev) => [r, ...prev]);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "login_logs" }, (payload) => {
        const l = payload.new as LoginLogRow;
        addAuditLog(
          `Faculty Authentication Event: ${l?.email || "Faculty"} logged in/updated`,
          "AUTH",
          "info",
        );
        loadData();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "questions" },
        (payload) => {
          const q = payload.new as QuestionRow;
          addAuditLog(
            `New question created: '${q?.title || ""}' [Type: ${q?.type}]`,
            "QUESTION",
            "info",
          );
          setQuestions((prev) => [q, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sysChannel);
    };
  }, [isAuthenticated]);

  // Map Profile Helper
  const getFacultyInfo = (creatorId?: string | null) => {
    if (!creatorId) {
      return { name: "Faculty (Unknown)", email: "unknown@kct.ac.in" };
    }

    // Guard against showing premature unlinked placeholders while initial data load is pending
    if (loading && profiles.length === 0) {
      return { name: "Loading...", email: "Loading..." };
    }

    // 0. Check Developer Custom Overrides / Named Mapping
    if (facultyNameOverrides[creatorId]) {
      return {
        name: facultyNameOverrides[creatorId].name,
        email: facultyNameOverrides[creatorId].email || "No email synced",
      };
    }

    // 1. Check Profiles table (exact full Firebase UID match)
    const prof = profiles.find((p) => p.id === creatorId);
    if (prof) {
      const email = prof.email && prof.email.trim() ? prof.email.trim() : null;
      const name = formatDisplayName(prof.full_name, email, creatorId);
      return {
        name,
        email: email || "No email synced",
      };
    }

    // 2. Check Login Logs table
    const logMatch = loginLogs.find((l) => l.user_id === creatorId);
    if (logMatch && logMatch.email && logMatch.email.trim()) {
      const email = logMatch.email.trim();
      const name = formatDisplayName(null, email, creatorId);
      return { name, email };
    }

    // 3. Check Current Logged In Firebase User
    const currentFirebaseUser = auth.currentUser;
    if (currentFirebaseUser && currentFirebaseUser.uid === creatorId) {
      const email =
        currentFirebaseUser.email && currentFirebaseUser.email.trim()
          ? currentFirebaseUser.email.trim()
          : null;
      const name = formatDisplayName(currentFirebaseUser.displayName, email, creatorId);
      return {
        name,
        email: email || "No email synced",
      };
    }

    // 4. Honest fallback for unlinked historical test sessions
    const shortId = creatorId.slice(0, 6).toUpperCase();
    return {
      name: `Unlinked Profile (${shortId})`,
      email: "No email synced",
    };
  };

  // Map Session Participants Helper
  const getSessionParticipants = (sessionId: string) => {
    return participants.filter((p) => p.session_id === sessionId);
  };

  // Map Session Questions Helper
  const getSessionQuestions = (sessionId: string) => {
    return questions.filter((q) => q.session_id === sessionId);
  };

  // Filter Data by Timeframe (1D, 7D, 30D, ALL)
  const filterByTimeframe = <T extends { created_at?: string; joined_at?: string }>(items: T[]) => {
    if (timeframe === "ALL") return items;
    const now = Date.now();
    const limits: Record<string, number> = {
      "1D": 24 * 60 * 60 * 1000,
      "7D": 7 * 24 * 60 * 60 * 1000,
      "30D": 30 * 24 * 60 * 60 * 1000,
    };
    const maxDiff = limits[timeframe] || Infinity;

    return items.filter((item) => {
      const dateStr = item.created_at || item.joined_at;
      if (!dateStr) return true;
      return now - new Date(dateStr).getTime() <= maxDiff;
    });
  };

  const filteredSessionsByTime = useMemo(() => filterByTimeframe(sessions), [sessions, timeframe]);
  const filteredQuestionsByTime = useMemo(
    () => filterByTimeframe(questions),
    [questions, timeframe],
  );
  const filteredParticipantsByTime = useMemo(
    () => filterByTimeframe(participants),
    [participants, timeframe],
  );
  const filteredResponsesByTime = useMemo(
    () => filterByTimeframe(responses),
    [responses, timeframe],
  );

  // Fetch Uncapped Exact PostgreSQL Database Counts for selected timeframe
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchExactTimeframeCounts = async () => {
      let dateIso: string | null = null;
      if (timeframe !== "ALL") {
        const days = timeframe === "1D" ? 1 : timeframe === "7D" ? 7 : 30;
        dateIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }

      let pQuery = supabase.from("participants").select("id", { count: "exact", head: true });
      let rQuery = supabase.from("responses").select("id", { count: "exact", head: true });
      let qQuery = supabase.from("questions").select("id", { count: "exact", head: true });
      let sQuery = supabase.from("sessions").select("id", { count: "exact", head: true });
      let pollQuery = supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("type", "poll");
      let wordcloudQuery = supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("type", "wordcloud");
      let quizQuery = supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("type", "quiz");

      if (dateIso) {
        pQuery = pQuery.gte("joined_at", dateIso);
        rQuery = rQuery.gte("created_at", dateIso);
        qQuery = qQuery.gte("created_at", dateIso);
        sQuery = sQuery.gte("created_at", dateIso);
        pollQuery = pollQuery.gte("created_at", dateIso);
        wordcloudQuery = wordcloudQuery.gte("created_at", dateIso);
        quizQuery = quizQuery.gte("created_at", dateIso);
      }

      const [pRes, rRes, qRes, sRes, pollRes, wordcloudRes, quizRes] = await Promise.all([
        pQuery,
        rQuery,
        qQuery,
        sQuery,
        pollQuery,
        wordcloudQuery,
        quizQuery,
      ]);

      setTimeframeCounts({
        participants: pRes.count ?? filteredParticipantsByTime.length,
        responses: rRes.count ?? filteredResponsesByTime.length,
        questions: qRes.count ?? filteredQuestionsByTime.length,
        sessions: sRes.count ?? filteredSessionsByTime.length,
      });
      setQuestionTypeCounts({
        poll: pollRes.count ?? filteredQuestionsByTime.filter((q) => q.type === "poll").length,
        wordcloud:
          wordcloudRes.count ?? filteredQuestionsByTime.filter((q) => q.type === "wordcloud").length,
        quiz: quizRes.count ?? filteredQuestionsByTime.filter((q) => q.type === "quiz").length,
      });
    };

    fetchExactTimeframeCounts();
  }, [
    timeframe,
    isAuthenticated,
    sessions.length,
    participants.length,
    responses.length,
    questions.length,
  ]);

  // Metrics Computations
  const liveSessionsCount = useMemo(
    () => filteredSessionsByTime.filter((s) => s.status === "live").length,
    [filteredSessionsByTime],
  );
  const draftSessionsCount = useMemo(
    () => filteredSessionsByTime.filter((s) => s.status === "draft").length,
    [filteredSessionsByTime],
  );
  const endedSessionsCount = useMemo(
    () => filteredSessionsByTime.filter((s) => s.status === "ended").length,
    [filteredSessionsByTime],
  );

  const pollQuestionsCount = useMemo(
    () => questionTypeCounts.poll,
    [questionTypeCounts.poll],
  );
  const wordcloudQuestionsCount = useMemo(
    () => questionTypeCounts.wordcloud,
    [questionTypeCounts.wordcloud],
  );
  const quizQuestionsCount = useMemo(
    () => questionTypeCounts.quiz,
    [questionTypeCounts.quiz],
  );

  // Unique Faculty Creators with Total Students Taught (Filtered by Timeframe)
  const uniqueCreators = useMemo(() => {
    const map = new Map<
      string,
      {
        creator_id: string;
        profile?: ProfileRow;
        count: number;
        totalStudents: number;
        lastActive: string;
      }
    >();
    filteredSessionsByTime.forEach((s) => {
      const cId = s.creator_id || "anonymous";
      const sessParts = participants.filter((p) => p.session_id === s.id).length;
      const existing = map.get(cId) || {
        creator_id: cId,
        profile: profiles.find((p) => p.id === cId),
        count: 0,
        totalStudents: 0,
        lastActive: s.created_at || new Date().toISOString(),
      };
      existing.count++;
      existing.totalStudents += sessParts;
      if (s.created_at && new Date(s.created_at) > new Date(existing.lastActive)) {
        existing.lastActive = s.created_at;
      }
      map.set(cId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredSessionsByTime, profiles, participants]);

  // Filtered Sessions for Search Input & Status Filters
  const searchedSessions = useMemo(() => {
    let result = filteredSessionsByTime;
    if (statusFilter !== "ALL") {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const fac = getFacultyInfo(s.creator_id);
        const matchesTitle = (s.title || "").toLowerCase().includes(q);
        const matchesCode = (s.code || "").toLowerCase().includes(q);
        const matchesCreator = (s.creator_id || "").toLowerCase().includes(q);
        const matchesFacName = (fac?.name || "").toLowerCase().includes(q);
        const matchesFacEmail = (fac?.email || "").toLowerCase().includes(q);
        const matchesQuestion = questions.some(
          (qItem) => qItem.session_id === s.id && (qItem.title || "").toLowerCase().includes(q)
        );
        const matchesParticipant = participants.some(
          (p) => p.session_id === s.id && (p.name || "").toLowerCase().includes(q)
        );
        return (
          matchesTitle ||
          matchesCode ||
          matchesCreator ||
          matchesFacName ||
          matchesFacEmail ||
          matchesQuestion ||
          matchesParticipant
        );
      });
    }
    return result;
  }, [
    filteredSessionsByTime,
    searchQuery,
    statusFilter,
    profiles,
    facultyNameOverrides,
    questions,
    participants,
  ]);

  // Filtered Faculty for Search Input (matches name, email, creator_id, and session metadata)
  const searchedFaculty = useMemo(() => {
    if (!searchQuery.trim()) return uniqueCreators;
    const q = searchQuery.toLowerCase();
    return uniqueCreators.filter((item) => {
      const info = getFacultyInfo(item.creator_id);
      const matchesName = (info.name || "").toLowerCase().includes(q);
      const matchesEmail = (info.email || "").toLowerCase().includes(q);
      const matchesId = (item.creator_id || "").toLowerCase().includes(q);
      const matchesSession = sessions.some(
        (s) =>
          s.creator_id === item.creator_id &&
          ((s.title || "").toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q))
      );
      return matchesName || matchesEmail || matchesId || matchesSession;
    });
  }, [uniqueCreators, searchQuery, sessions, profiles, facultyNameOverrides]);

  // Filtered Questions for Questions Tab & Type Filters
  const searchedQuestions = useMemo(() => {
    let result = filteredQuestionsByTime;
    if (questionTypeFilter !== "ALL") {
      result = result.filter((q) => q.type === questionTypeFilter);
    }
    if (searchQuery.trim()) {
      const qStr = searchQuery.toLowerCase();
      result = result.filter((q) => {
        const parentSession = sessions.find((s) => s.id === q.session_id);
        const faculty = parentSession ? getFacultyInfo(parentSession.creator_id) : null;
        return (
          (q.title || "").toLowerCase().includes(qStr) ||
          (q.type || "").toLowerCase().includes(qStr) ||
          (parentSession?.title || "").toLowerCase().includes(qStr) ||
          (parentSession?.code || "").toLowerCase().includes(qStr) ||
          (faculty?.name || "").toLowerCase().includes(qStr) ||
          (faculty?.email || "").toLowerCase().includes(qStr)
        );
      });
    }
    return result;
  }, [
    filteredQuestionsByTime,
    questionTypeFilter,
    searchQuery,
    sessions,
    profiles,
    facultyNameOverrides,
  ]);

  // Filtered Submissions for Search Input
  const searchedResponses = useMemo(() => {
    let result = filteredResponsesByTime;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const answerText = typeof r.answer === "string" ? r.answer : JSON.stringify(r.answer || "");
        const qItem = questions.find((item) => item.id === r.question_id);
        const pItem = participants.find((item) => item.id === r.participant_id);
        const sItem = qItem ? sessions.find((s) => s.id === qItem.session_id) : null;
        const fac = sItem ? getFacultyInfo(sItem.creator_id) : null;
        return (
          answerText.toLowerCase().includes(q) ||
          (pItem?.name || "").toLowerCase().includes(q) ||
          (qItem?.title || "").toLowerCase().includes(q) ||
          (sItem?.title || "").toLowerCase().includes(q) ||
          (sItem?.code || "").toLowerCase().includes(q) ||
          (fac?.name || "").toLowerCase().includes(q) ||
          (fac?.email || "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [
    filteredResponsesByTime,
    searchQuery,
    questions,
    participants,
    sessions,
    profiles,
    facultyNameOverrides,
  ]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (logFilterTag !== "ALL" && log.tag !== logFilterTag) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return log.msg.toLowerCase().includes(q) || log.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [auditLogs, logFilterTag, searchQuery]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">
          Initializing Developer Telemetry Portal...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground relative selection:bg-primary/20">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle variant="ghost" />
        </div>
        <div className="w-full max-w-md glass rounded-3xl p-8 shadow-2xl border border-border/60 text-center space-y-6">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 border border-primary/30 text-primary mx-auto shadow-inner">
            <ShieldCheck className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">KCT PULSE Developer Portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Internal system monitoring & live telemetry dashboard.
            </p>
          </div>

          <form onSubmit={handleAuthenticate} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Developer Password Required
              </label>
              <Input
                type="password"
                placeholder="Enter Developer Password"
                value={passkey}
                onChange={(e) => {
                  setPasskey(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                className="h-11 bg-card/50 border-border text-center font-mono tracking-widest"
              />
              {errorMsg && (
                <p className="text-xs font-semibold text-destructive mt-1 text-center animate-shake">
                  {errorMsg}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={authenticating}
              className="w-full h-11 gradient-bg font-semibold gap-2"
            >
              <Key className="h-4 w-4" />{" "}
              {authenticating ? "Authenticating..." : "Authenticate Developer Access"}
            </Button>
            <Link
              to="/dashboard"
              className="block text-center text-xs font-semibold text-primary hover:underline"
            >
              Return to Faculty Dashboard
            </Link>
          </form>

          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5 text-emerald-500" /> Authorized Admin & Developer Use
            Only
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full flex-col md:flex-row overflow-hidden bg-background text-foreground selection:bg-primary/20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-fixed bg-no-repeat"
        style={{
          backgroundImage: "url('/kct-temple-bg-opt.jpg')",
          opacity: "var(--bg-img-opacity)",
          mixBlendMode: "var(--bg-img-blend)" as any,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--dashboard-overlay)" }}
      />

      {/* Mobile Top Header */}
      <header className="relative z-20 flex md:hidden items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1 text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open developer navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[300px] max-w-[85vw] bg-sidebar/95 border-r border-border/60">
              <DeveloperSidebarContent
                activeSection={activeSection}
                onSelectSection={(sec) => {
                  setActiveSection(sec);
                  setMobileDrawerOpen(false);
                }}
                isServerDown={isServerDown}
                onToggleServerDown={() => {
                  handleToggleServerDown();
                  setMobileDrawerOpen(false);
                }}
                timeframe={timeframe}
                setTimeframe={(tf) => {
                  setTimeframe(tf);
                  setMobileDrawerOpen(false);
                }}
                onRunCleanup={() => {
                  handleRunCleanup();
                  setMobileDrawerOpen(false);
                }}
                onPurgeEmptySessions={() => {
                  handlePurgeEmptySessions();
                  setMobileDrawerOpen(false);
                }}
                onRefresh={() => {
                  loadData();
                  setMobileDrawerOpen(false);
                }}
                loading={loading}
                onExportMLDataset={async () => {
                  setMobileDrawerOpen(false);
                  try {
                    toast.info("Extracting and anonymizing ML training dataset...");
                    await downloadMLDatasetCSV();
                    toast.success("ML Training Dataset exported successfully (CSV)!");
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    toast.error(`Export failed: ${msg}`);
                  }
                }}
                onLockPortal={() => {
                  setMobileDrawerOpen(false);
                  handleLockDeveloper();
                }}
                badgeCounts={{
                  sessions: filteredSessionsByTime.length,
                  liveSessions: liveSessionsCount,
                  faculty: uniqueCreators.length,
                  questions: timeframeCounts.questions || filteredQuestionsByTime.length,
                  submissions: timeframeCounts.responses || filteredResponsesByTime.length,
                  failedAttempts: recentFailedAttempts.length,
                  unreadFeedback: contactMessages.filter((m) => m.status === "unread").length,
                }}
                onClose={() => setMobileDrawerOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-extrabold text-sm tracking-tight">
              KCT <span className="gradient-text">PULSE</span>
            </span>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-black text-emerald-400">
              ADMIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isServerDown && (
            <span className="rounded-full bg-rose-500/15 border border-rose-500/40 px-2 py-0.5 text-[9px] font-black text-rose-400 uppercase tracking-wider animate-pulse">
              DOWN
            </span>
          )}
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Persistent Desktop Developer Sidebar + Main Content Area */}
      <div className="relative z-10 flex h-dvh w-full overflow-hidden">
        <DeveloperSidebar
          activeSection={activeSection}
          onSelectSection={(sec) => setActiveSection(sec)}
          isServerDown={isServerDown}
          onToggleServerDown={handleToggleServerDown}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          onRunCleanup={handleRunCleanup}
          onPurgeEmptySessions={handlePurgeEmptySessions}
          onRefresh={loadData}
          loading={loading}
          onExportMLDataset={async () => {
            try {
              toast.info("Extracting and anonymizing ML training dataset...");
              await downloadMLDatasetCSV();
              toast.success("ML Training Dataset exported successfully (CSV)!");
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              toast.error(`Export failed: ${msg}`);
            }
          }}
          onLockPortal={handleLockDeveloper}
          badgeCounts={{
            sessions: filteredSessionsByTime.length,
            liveSessions: liveSessionsCount,
            faculty: uniqueCreators.length,
            questions: timeframeCounts.questions || filteredQuestionsByTime.length,
            submissions: timeframeCounts.responses || filteredResponsesByTime.length,
            failedAttempts: recentFailedAttempts.length,
            unreadFeedback: contactMessages.filter((m) => m.status === "unread").length,
          }}
        />

        <main className="flex-1 min-w-0 flex flex-col justify-between overflow-x-hidden overflow-y-auto">
          <div className="max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
            {/* Top Enterprise Admin Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-border/50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                    {activeSection === "dashboard" && "Platform Overview"}
                    {activeSection === "sessions" && "Session Operations"}
                    {activeSection === "faculty" && "Faculty Management"}
                    {activeSection === "questions" && "Question Bank & Analytics"}
                    {activeSection === "submissions" && "Submissions & Responses"}
                    {activeSection === "activity" && "Platform Activity & Telemetry"}
                    {activeSection === "security" && "Security & Access Control"}
                    {activeSection === "health" && "System Health & AI Services"}
                    {activeSection === "feedback" && "User Feedback"}
                    {activeSection === "contact_messages" && "Contact Inquiries"}
                    {activeSection === "settings" && "System Settings & Maintenance"}
                  </h1>

                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> OPERATIONAL
                  </span>

                  {recentFailedAttempts.length > 0 ? (
                    <span className="rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                      <Shield className="h-3 w-3 text-rose-500" /> {recentFailedAttempts.length} Recent Failed Attempt{recentFailedAttempts.length > 1 ? "s" : ""} (24h)
                    </span>
                  ) : failedAttempts.length > 0 ? (
                    <span className="rounded-full bg-muted/30 border border-border/50 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="h-3 w-3 text-emerald-400" /> {failedAttempts.length} Historical Log{failedAttempts.length > 1 ? "s" : ""} (0 in 24h)
                    </span>
                  ) : null}

                  {isServerDown && (
                    <span className="rounded-full bg-rose-600 text-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest animate-pulse">
                      Server Down Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeSection === "dashboard" && "Real-time institutional metrics, classroom session lifecycle, and infrastructure health."}
                  {activeSection === "sessions" && "Monitor active live classrooms, manage drafts, and inspect session analytics."}
                  {activeSection === "faculty" && "Faculty engagement directory, session assignments, and contact mapping overrides."}
                  {activeSection === "questions" && "Institutional questions bank, question format composition, and engagement types."}
                  {activeSection === "submissions" && "Live student submission stream and classroom response logs."}
                  {activeSection === "activity" && "Audit log trace, administrative actions, and real-time platform telemetry."}
                  {activeSection === "security" && "Authentication logs, access control security, failed access attempts, and WAF events."}
                  {activeSection === "health" && "Database realtime connectivity, API latency, AI provider pools, and token telemetry."}
                  {activeSection === "feedback" && "Student and faculty feedback submissions and feature suggestions."}
                  {activeSection === "contact_messages" && "Public contact inquiries, support requests, and user communications."}
                  {activeSection === "settings" && "Platform controls, database maintenance, dataset export, and portal lock."}
                </p>
              </div>

              {/* Header Right: Global Search & Admin Profile Status */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search sessions, faculty, queries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8.5 pr-8 h-9 text-xs bg-card/60 border-border rounded-xl"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded transition"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {searchQuery.trim() && (
                  <div className="flex items-center gap-1 text-[11px] bg-card/60 border border-border/60 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActiveSection("sessions")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg font-bold border transition text-[10px]",
                        activeSection === "sessions"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                      title="View matching sessions"
                    >
                      {searchedSessions.length} Sessions
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection("faculty");
                        if (facultySubTab === "overview") setFacultySubTab("breakdown");
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded-lg font-bold border transition text-[10px]",
                        activeSection === "faculty"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                      title="View matching faculty"
                    >
                      {searchedFaculty.length} Faculty
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection("questions")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg font-bold border transition text-[10px]",
                        activeSection === "questions"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                      title="View matching questions"
                    >
                      {searchedQuestions.length} Questions
                    </button>
                  </div>
                )}

                <Button
                  onClick={() => loadData()}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs rounded-xl border-border/70 hover:bg-accent gap-1.5 font-semibold"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/60 border border-border/60 text-xs">
                  <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center text-primary font-bold text-[10px]">
                    AD
                  </div>
                  <div className="hidden sm:flex flex-col text-left">
                    <span className="font-bold text-[11px] leading-tight text-foreground truncate max-w-[120px]">
                      {auth.currentUser?.email || "Admin User"}
                    </span>
                    <span className="text-[9px] text-muted-foreground">Authorized Superadmin</span>
                  </div>
                </div>
              </div>
            </header>

            {/* VIEW 1: DASHBOARD HOME (GENUINE ADMIN OVERVIEW) */}
            {activeSection === "dashboard" && (
              <div className="space-y-6">
                {/* Real-Data KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* KPI 1: Sessions */}
                  <div
                    onClick={() => setActiveSection("sessions")}
                    className="glass rounded-2xl p-5 border border-border/60 space-y-3 cursor-pointer hover:border-primary/50 transition hover:shadow-md group relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                        Classroom Sessions ({timeframe})
                      </span>
                      <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/30 grid place-items-center text-primary group-hover:scale-110 transition-transform">
                        <Layers className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black">
                        {timeframeCounts.sessions || filteredSessionsByTime.length}
                      </span>
                      <span className="text-xs text-emerald-500 font-bold">
                        ({liveSessionsCount} Live Now)
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                      <span>{draftSessionsCount} Drafts • {endedSessionsCount} Ended</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                    </div>
                  </div>

                  {/* KPI 2: Faculty */}
                  <div
                    onClick={() => {
                      setActiveSection("faculty");
                      setFacultySubTab("overview");
                    }}
                    className="glass rounded-2xl p-5 border border-border/60 space-y-3 cursor-pointer hover:border-purple-500/50 transition hover:shadow-md group relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                        Active Faculty ({timeframe})
                      </span>
                      <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/30 grid place-items-center text-purple-500 group-hover:scale-110 transition-transform">
                        <UserCheck className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-foreground">
                        {uniqueCreators.length}
                      </span>
                      <span className="text-xs text-purple-400 font-bold">Faculty Instructors</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                      <span>{timeframeCounts.participants || filteredParticipantsByTime.length} Students Taught</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400" />
                    </div>
                  </div>

                  {/* KPI 3: Submissions & Student Joins */}
                  <div
                    onClick={() => setActiveSection("submissions")}
                    className="glass rounded-2xl p-5 border border-border/60 space-y-3 cursor-pointer hover:border-blue-500/50 transition hover:shadow-md group relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                        Total Submissions ({timeframe})
                      </span>
                      <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500 group-hover:scale-110 transition-transform">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-foreground">
                        {timeframeCounts.responses || filteredResponsesByTime.length}
                      </span>
                      <span className="text-xs text-blue-400 font-bold">Answers</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                      <span>{timeframeCounts.participants || filteredParticipantsByTime.length} Student Joins</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                    </div>
                  </div>

                  {/* KPI 4: Questions */}
                  <div
                    onClick={() => {
                      setActiveSection("questions");
                      setQuestionsSubTab("management");
                    }}
                    className="glass rounded-2xl p-5 border border-border/60 space-y-3 cursor-pointer hover:border-cyan-500/50 transition hover:shadow-md group relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                        Questions Added ({timeframe})
                      </span>
                      <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 grid place-items-center text-cyan-500 group-hover:scale-110 transition-transform">
                        <HelpCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-foreground">
                        {timeframeCounts.questions || filteredQuestionsByTime.length}
                      </span>
                      <span className="text-xs text-cyan-400 font-bold">Questions</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                      <span>{pollQuestionsCount} Polls • {wordcloudQuestionsCount} Word Clouds • {quizQuestionsCount} Quizzes</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
                    </div>
                  </div>
                </div>

                {/* Middle Row: Platform Activity Trends + System Health Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* 1. Platform Activity Chart */}
                  <div className="lg:col-span-2 glass rounded-2xl p-5 border border-border/60 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-black tracking-tight text-foreground">
                          Platform Activity Trends
                        </h3>
                        <span className="text-[11px] font-bold text-muted-foreground">
                          ({timeframe === "1D" ? "Past 24 Hours (4h Buckets)" : timeframe === "7D" ? "Past 7 Days (Daily)" : "Past 30 Days (Daily)"})
                        </span>
                        {activityTrendLoading && (
                          <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        )}
                        {activityTrendError && (
                          <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Telemetry Query Warning
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-cyan-500" />
                          <span>Sessions (Right Axis)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-purple-500" />
                          <span>Submissions (Left Axis)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          <span>Joins (Left Axis)</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-64 w-full">
                      {activityTrendLoading && activityTrendData.length === 0 ? (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span>Aggregating uncapped activity trends...</span>
                        </div>
                      ) : activityTrendError && activityTrendData.length === 0 ? (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                          <AlertTriangle className="h-8 w-8 text-rose-500" />
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-foreground">Telemetry Query Failed</div>
                            <div className="text-[11px] text-muted-foreground max-w-sm">{activityTrendError}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActivityTrendRetryCount((c) => c + 1)}
                            className="text-xs h-7 px-3 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                          >
                            Retry Query
                          </Button>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={activityTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorResponses" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorJoins" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                            <YAxis
                              yAxisId="left"
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={11}
                              tickLine={false}
                              allowDecimals={false}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              stroke="#06b6d4"
                              fontSize={11}
                              tickLine={false}
                              allowDecimals={false}
                            />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const dp = payload[0]?.payload as PlatformActivityDataPoint;
                                if (!dp) return null;
                                return (
                                  <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                                    <div className="font-bold text-foreground border-b border-border/50 pb-1 flex items-center justify-between">
                                      <span>{dp.label}</span>
                                      {dp.isToday && (
                                        <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                          Today (In Progress)
                                        </span>
                                      )}
                                    </div>
                                    {dp.hasError && (
                                      <div className="text-[10px] text-rose-400 font-semibold p-1.5 rounded bg-rose-500/10 border border-rose-500/20 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        <span>Query error in interval ({dp.responsesError ? "submissions" : ""}{dp.responsesError && dp.joinsError ? ", " : ""}{dp.joinsError ? "joins" : ""})</span>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between text-cyan-400 font-semibold">
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-cyan-500" />
                                        Sessions:
                                      </span>
                                      <span className="font-mono">{dp.sessions}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-purple-400 font-semibold">
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                                        Submissions:
                                      </span>
                                      <span className="font-mono">
                                        {dp.responsesError || dp.responses === null ? (
                                          <span className="text-rose-400 text-[11px]">Error</span>
                                        ) : (
                                          dp.responses.toLocaleString()
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-blue-400 font-semibold">
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        Joins:
                                      </span>
                                      <span className="font-mono">
                                        {dp.joinsError || dp.joins === null ? (
                                          <span className="text-rose-400 text-[11px]">Error</span>
                                        ) : (
                                          dp.joins.toLocaleString()
                                        )}
                                      </span>
                                    </div>
                                    {dp.isToday && (
                                      <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30 italic">
                                        Counts reflect activity recorded so far today
                                      </div>
                                    )}
                                  </div>
                                );
                              }}
                            />
                            <Area
                              yAxisId="right"
                              type="monotone"
                              dataKey="sessions"
                              stroke="#06b6d4"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorSessions)"
                              name="Sessions (Right Axis)"
                            />
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="responses"
                              stroke="#a855f7"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorResponses)"
                              name="Submissions (Left Axis)"
                            />
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="joins"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorJoins)"
                              name="Joins (Left Axis)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* 2. System Health Summary */}
                  <div className="glass rounded-2xl p-5 border border-border/60 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-400" />
                        <h3 className="text-sm font-black tracking-tight text-foreground">
                          System Health Summary
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveSection("health")}
                        className="text-xs h-7 px-2 text-primary hover:text-primary gap-1"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-card/60 border border-border/50 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Activity className="h-3.5 w-3.5 text-emerald-400" />
                          <span>API Latency Ping</span>
                        </div>
                        <span className="font-mono font-bold text-foreground">
                          {apiLatencyMs !== null ? `${apiLatencyMs} ms` : "--"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-card/60 border border-border/50 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Database className="h-3.5 w-3.5 text-blue-400" />
                          <span>Supabase Realtime</span>
                        </div>
                        <span className="font-bold text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-card/60 border border-border/50 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Key className="h-3.5 w-3.5 text-amber-400" />
                          <span>AI Key Pools</span>
                        </div>
                        <span className="font-bold text-foreground">
                          16 Keys (Gemini & Groq)
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-card/60 border border-border/50 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Shield className="h-3.5 w-3.5 text-rose-400" />
                          <span>Access Security</span>
                        </div>
                        <span className={cn("font-bold", recentFailedAttempts.length > 0 ? "text-rose-400" : "text-emerald-500")}>
                          {recentFailedAttempts.length > 0
                            ? `${recentFailedAttempts.length} Failed (24h)`
                            : failedAttempts.length > 0
                              ? `Normal (${failedAttempts.length} in Log)`
                              : "Protected / Normal"}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveSection("health")}
                      className="w-full text-xs font-semibold rounded-xl border-border/70"
                    >
                      View Full System Health
                    </Button>
                  </div>
                </div>

                {/* Bottom Row: Needs Attention / Alerts + Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* 3. Needs Attention / Alerts */}
                  <div className="glass rounded-2xl p-5 border border-border/60 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <h3 className="text-sm font-black tracking-tight text-foreground">
                          Needs Attention & Alerts
                        </h3>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                        Live Status
                      </span>
                    </div>
                    <div className="space-y-3">
                      {recentFailedAttempts.length > 0 ? (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Shield className="h-4 w-4 text-rose-400 shrink-0 animate-pulse" />
                            <div className="min-w-0">
                              <div className="text-xs font-black text-rose-400 truncate">
                                {recentFailedAttempts.length} Recent Failed Attempt(s) (24h)
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                Last from {recentFailedAttempts[0]?.client_environment || "Unknown Device"} ({recentFailedAttempts[0]?.ip_address || "unknown"})
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveSection("security");
                              setSecuritySubTab("failed_attempts");
                            }}
                            className="text-[11px] h-7 px-2.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/10 shrink-0 font-bold"
                          >
                            Review
                          </Button>
                        </div>
                      ) : failedAttempts.length > 0 ? (
                        <div className="p-3 rounded-xl bg-muted/20 border border-border/50 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-foreground truncate">
                                No Failed Attempts in Past 24h
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {failedAttempts.length} historical attempt(s) retained in 30-day security audit log
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveSection("security");
                              setSecuritySubTab("failed_attempts");
                            }}
                            className="text-[11px] h-7 px-2.5 text-muted-foreground hover:text-foreground shrink-0 font-medium"
                          >
                            Audit Log
                          </Button>
                        </div>
                      ) : null}

                      {isServerDown && (
                        <div className="p-3 rounded-xl bg-rose-600 text-white flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AlertOctagon className="h-4 w-4 text-white shrink-0 animate-pulse" />
                            <div className="min-w-0">
                              <div className="text-xs font-black truncate">Server Down Mode is ACTIVE</div>
                              <div className="text-[11px] text-white/80 truncate">Public app traffic is currently intercepted</div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveSection("settings")}
                            className="text-[11px] h-7 px-2.5 bg-white/20 border-white/30 text-white hover:bg-white/30 shrink-0 font-bold"
                          >
                            Manage
                          </Button>
                        </div>
                      )}

                      {liveSessionsCount > 0 && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Radio className="h-4 w-4 text-emerald-400 shrink-0 animate-pulse" />
                            <div className="min-w-0">
                              <div className="text-xs font-black text-emerald-400 truncate">
                                {liveSessionsCount} Live Classroom Session(s) Running
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                Active student participation in progress
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveSection("sessions");
                              setStatusFilter("live");
                            }}
                            className="text-[11px] h-7 px-2.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 shrink-0 font-bold"
                          >
                            Monitor
                          </Button>
                        </div>
                      )}

                      {contactMessages.filter((m) => m.status === "unread").length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Mail className="h-4 w-4 text-amber-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-black text-amber-400 truncate">
                                {contactMessages.filter((m) => m.status === "unread").length} Unread Feedback / Inquiry Message(s)
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                Submissions awaiting administrator review
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveSection("contact_messages")}
                            className="text-[11px] h-7 px-2.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shrink-0 font-bold"
                          >
                            View Inbox
                          </Button>
                        </div>
                      )}

                      {recentFailedAttempts.length === 0 && failedAttempts.length === 0 && !isServerDown && liveSessionsCount === 0 && contactMessages.filter((m) => m.status === "unread").length === 0 && (
                        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-1">
                          <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                          <div className="text-xs font-bold text-foreground">All Systems Operational</div>
                          <p className="text-[11px] text-muted-foreground">
                            No security incidents, active errors, or unhandled user inquiries detected.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. Recent Activity */}
                  <div className="glass rounded-2xl p-5 border border-border/60 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-black tracking-tight text-foreground">
                          Recent Platform Activity
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveSection("activity")}
                        className="text-xs h-7 px-2 text-primary hover:text-primary gap-1"
                      >
                        <span>Full Log</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
                      {sessions.slice(0, 5).map((s) => {
                        const fac = getFacultyInfo(s.creator_id);
                        const formattedDate = s.created_at
                          ? new Date(s.created_at).toLocaleDateString()
                          : "Recent";
                        const fullDateString = s.created_at
                          ? new Date(s.created_at).toLocaleString()
                          : "Recent";

                        return (
                          <div
                            key={s.id}
                            className="grid grid-cols-[58px_1fr_58px] sm:grid-cols-[68px_1fr_68px] items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-card/60 hover:bg-card/90 border border-border/40 hover:border-border/60 transition-colors text-xs"
                          >
                            {/* 1. Fixed-width Session Code */}
                            <div
                              className="w-[58px] sm:w-[68px] h-7 sm:h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-mono text-[10px] sm:text-[11px] font-bold tracking-wider select-all shrink-0"
                              title={`Session Code: ${s.code}`}
                            >
                              <span className="truncate px-1">{s.code}</span>
                            </div>

                            {/* 2. Flexible Title & Metadata (min-w-0 ensures truncation works) */}
                            <div className="min-w-0 flex flex-col justify-center space-y-0.5">
                              <div
                                className="font-bold text-foreground text-xs leading-snug truncate"
                                title={s.title || "Untitled Session"}
                              >
                                {s.title || "Untitled Session"}
                              </div>
                              <div
                                className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground min-w-0"
                                title={`Created by ${fac.name} • ${fullDateString}`}
                              >
                                <span className="truncate text-foreground/80 font-medium max-w-[110px] sm:max-w-[180px] md:max-w-none">
                                  by {fac.name}
                                </span>
                                <span className="text-muted-foreground/40 shrink-0 font-bold">•</span>
                                <span className="shrink-0 text-muted-foreground whitespace-nowrap">
                                  {formattedDate}
                                </span>
                              </div>
                            </div>

                            {/* 3. Fixed-width Status Badge Aligned Right */}
                            <div className="w-[58px] sm:w-[68px] shrink-0 flex items-center justify-end">
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center w-full px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider border text-center transition-colors",
                                  s.status === "live"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_-2px_rgba(16,185,129,0.3)]"
                                    : s.status === "draft"
                                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                      : "bg-muted/70 text-muted-foreground border-border/60"
                                )}
                                title={`Session Status: ${s.status.toUpperCase()}`}
                              >
                                {s.status === "live" && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 shrink-0" />
                                )}
                                {s.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {sessions.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-6 bg-card/30 rounded-xl border border-dashed border-border/50">
                          No recorded classroom sessions yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: SESSIONS MANAGEMENT */}
            {activeSection === "sessions" && (
              <div className="space-y-4">
            {/* Visual Sessions & Questions Composition Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Question Format Composition */}
              <div className="glass rounded-2xl p-4 border border-border/60 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Question Type Composition
                    </span>
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {timeframeCounts.questions || filteredQuestionsByTime.length} Total Questions
                  </span>
                </div>
                <div className="h-44 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={questionTypeChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {questionTypeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        allowEscapeViewBox={{ x: true, y: true }}
                        offset={14}
                        wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "0.75rem",
                          fontSize: "0.75rem",
                          color: "hsl(var(--foreground))",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                          padding: "8px 12px",
                        }}
                      />
                      <RechartsLegend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(val) => <span className="text-[11px] font-semibold text-foreground/90">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Session Status Distribution */}
              <div className="glass rounded-2xl p-4 border border-border/60 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Session Lifecycle Status
                    </span>
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {sessions.length} Total Sessions
                  </span>
                </div>
                <div className="h-44 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sessionStatusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={68}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {sessionStatusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        allowEscapeViewBox={{ x: true, y: true }}
                        offset={14}
                        wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "0.75rem",
                          fontSize: "0.75rem",
                          color: "hsl(var(--foreground))",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                          padding: "8px 12px",
                        }}
                      />
                      <RechartsLegend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(val) => <span className="text-[11px] font-semibold text-foreground/90">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              {/* Status Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mr-1">
                    Status Filter:
                  </span>
                  <button
                    onClick={() => setStatusFilter("ALL")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border",
                      statusFilter === "ALL"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                    )}
                  >
                    All ({filteredSessionsByTime.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter("live")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      statusFilter === "live"
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Live Sessions ({liveSessionsCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter("draft")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      statusFilter === "draft"
                        ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                        : "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20",
                    )}
                  >
                    Draft Sessions ({draftSessionsCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter("ended")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      statusFilter === "ended"
                        ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                    )}
                  >
                    Ended Sessions ({endedSessionsCount})
                  </button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {liveSessionsCount > 0 && (
                    <Button
                      onClick={handleDemoteAllLiveToDraft}
                      disabled={isDemotingAll}
                      variant="outline"
                      size="sm"
                      className="border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-xs h-8 gap-1.5 font-bold shadow-sm"
                      title="Demote all live sessions back to draft mode in Supabase"
                    >
                      {isDemotingAll ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileEdit className="h-3.5 w-3.5" />
                      )}
                      Make All Live Draft ({liveSessionsCount})
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground font-medium">
                    Showing{" "}
                    <span className="font-bold text-foreground">{searchedSessions.length}</span>{" "}
                    sessions
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Session Title</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Faculty / Creator Name</th>
                      <th className="px-4 py-3">Students Joined</th>
                      <th className="px-4 py-3">Questions Added</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {searchedSessions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-muted-foreground">
                          No sessions match filter query.
                        </td>
                      </tr>
                    ) : (
                      searchedSessions.map((s) => {
                        const faculty = getFacultyInfo(s.creator_id);
                        const sessParts = getSessionParticipants(s.id);
                        const sessQs = getSessionQuestions(s.id);

                        return (
                          <tr key={s.id} className="hover:bg-accent/40 transition">
                            <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate" title={s.title}>
                                  {s.title}
                                </span>
                                <button
                                  onClick={() => handleOpenDevRename(s)}
                                  className="text-muted-foreground hover:text-primary p-0.5 rounded hover:bg-accent transition opacity-60 hover:opacity-100 shrink-0"
                                  title="Rename Session"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono font-black text-primary">
                              {s.code}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                                  s.status === "live"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    : s.status === "draft"
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                      : "bg-muted text-muted-foreground border-border",
                                )}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[180px] truncate">
                              <button
                                type="button"
                                onClick={() => {
                                  if (s?.creator_id) {
                                    setSelectedFacultyForReports({
                                      creator_id: s.creator_id,
                                      name: faculty.name,
                                      email: faculty.email,
                                      isOnline: false,
                                    });
                                  }
                                }}
                                className="text-left group/fac block w-full truncate focus:outline-none"
                                title="Click to view all sessions and download reports for this faculty"
                              >
                                <div className="font-bold text-foreground group-hover/fac:text-primary transition truncate">
                                  {faculty.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {faculty.email}
                                </div>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="font-extrabold text-blue-500 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:outline-none px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                                    title={`View students joined for ${s.title}`}
                                    aria-label={`View ${sessParts.length} students joined for ${s.title}`}
                                  >
                                    <Users className="h-3.5 w-3.5" /> {sessParts.length} Students
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-base">
                                      <Users className="h-4 w-4 text-primary" /> Students Joined —{" "}
                                      {s.title} ({s.code})
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 my-2">
                                    <div className="text-xs text-muted-foreground">
                                      Faculty Creator:{" "}
                                      <strong className="text-foreground">{faculty.name}</strong>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                                      {sessParts.length === 0 ? (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                          No students joined this session yet.
                                        </div>
                                      ) : (
                                        sessParts.map((p, pIdx) => (
                                          <div
                                            key={p.id}
                                            className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50 text-xs"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary grid place-items-center text-[10px] font-bold">
                                                {pIdx + 1}
                                              </span>
                                              <span className="font-bold text-foreground">
                                                {p.name}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                              {new Date(p.joined_at).toLocaleTimeString()}
                                            </span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </td>
                            <td className="px-4 py-3">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <button className="font-extrabold text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 transition cursor-pointer">
                                    <HelpCircle className="h-3.5 w-3.5" /> {sessQs.length} Questions
                                  </button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-base">
                                      <HelpCircle className="h-4 w-4 text-cyan-500" /> Questions
                                      Added — {s.title} ({s.code})
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 my-2">
                                    <div className="text-xs text-muted-foreground">
                                      Faculty Creator:{" "}
                                      <strong className="text-foreground">{faculty.name}</strong>
                                    </div>
                                    <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
                                      {sessQs.length === 0 ? (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                          No questions created in this session yet.
                                        </div>
                                      ) : (
                                        sessQs.map((q, qIdx) => (
                                          <div
                                            key={q.id}
                                            className="p-3 rounded-xl bg-card border border-border/50 text-xs space-y-1.5"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-2">
                                                <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-500 grid place-items-center text-[10px] font-bold">
                                                  {qIdx + 1}
                                                </span>
                                                <span className="font-bold text-foreground">
                                                  {q.title}
                                                </span>
                                              </div>
                                              <span
                                                className={cn(
                                                  "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase border",
                                                  q.type === "poll"
                                                    ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                                                    : q.type === "wordcloud"
                                                      ? "bg-purple-500/10 text-purple-500 border-purple-500/30"
                                                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                                                )}
                                              >
                                                {q.type}
                                              </span>
                                            </div>
                                            {Array.isArray(q.options) && q.options.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 pt-1">
                                                {q.options.map((opt: any, oIdx: number) => {
                                                  const optText =
                                                    typeof opt === "string"
                                                      ? opt
                                                      : opt?.text || JSON.stringify(opt);
                                                  const isCorrect =
                                                    q.correct_answer &&
                                                    q.correct_answer === optText;
                                                  return (
                                                    <span
                                                      key={oIdx}
                                                      className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium border",
                                                        isCorrect
                                                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                                                          : "bg-muted/60 text-muted-foreground border-border/40",
                                                      )}
                                                    >
                                                      {optText} {isCorrect && "✓"}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(s.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                              {/* Demote Live Session to Draft */}
                              {s.status === "live" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={demotingSessionId === s.id}
                                  onClick={() => handleMakeSessionDraft(s.id, s.title)}
                                  className="h-7 px-2.5 text-[11px] gap-1 font-bold border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400"
                                  title="Demote this live session back to draft"
                                >
                                  {demotingSessionId === s.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileEdit className="h-3 w-3" />
                                  )}
                                  Make Draft
                                </Button>
                              )}
                              {s.status === "ended" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={demotingSessionId === s.id}
                                  onClick={() => handleMakeSessionDraft(s.id, s.title)}
                                  className="h-7 px-2 text-[11px] gap-1 font-medium border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  title="Reopen or reset this ended session to draft"
                                >
                                  {demotingSessionId === s.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  To Draft
                                </Button>
                              )}

                              {/* Rename Session Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDevRename(s)}
                                className="h-7 px-2 text-[11px] gap-1 text-foreground border-border/70 hover:bg-accent"
                                title="Rename Session (Developer Override)"
                              >
                                <Pencil className="h-3 w-3 text-primary" /> Rename
                              </Button>

                              {/* Session Reports Download Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedFacultyForReports({
                                    creator_id: s.creator_id,
                                    name: faculty.name,
                                    email: faculty.email,
                                    isOnline: false,
                                  });
                                }}
                                className="h-7 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 font-bold"
                                title="View sessions and download reports for this faculty"
                              >
                                <FileText className="h-3 w-3" /> Reports
                              </Button>


                              <Link
                                to="/embed/$code"
                                params={{ code: s.code }}
                                target="_blank"
                                className="text-xs text-primary font-bold hover:underline"
                              >
                                Embed View
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              </div>
            )}

            {/* VIEW 3: FACULTY MANAGEMENT */}
            {activeSection === "faculty" && (
              <div className="space-y-4">
                {/* Segmented Subnav */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 p-1 bg-card/60 border border-border/60 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setFacultySubTab("overview")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        facultySubTab === "overview"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Faculty Overview
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacultySubTab("list")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        facultySubTab === "list"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Faculty Directory ({uniqueCreators.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacultySubTab("breakdown")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        facultySubTab === "breakdown"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Analytics & Breakdown
                    </button>
                  </div>
                </div>

                {/* Subtab 1: Faculty Overview */}
                {facultySubTab === "overview" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Faculty Mentors</span>
                        <div className="text-2xl font-black text-foreground">{uniqueCreators.length}</div>
                        <p className="text-[11px] text-muted-foreground">Active course creators across platform</p>
                      </div>
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Classroom Sessions</span>
                        <div className="text-2xl font-black text-primary">{sessions.length}</div>
                        <p className="text-[11px] text-muted-foreground">{liveSessionsCount} live sessions active</p>
                      </div>
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Students Engaged</span>
                        <div className="text-2xl font-black text-blue-400">{participants.length}</div>
                        <p className="text-[11px] text-muted-foreground">Across all faculty classrooms</p>
                      </div>
                    </div>

                    <div className="glass rounded-2xl p-5 border border-border/60 space-y-3">
                      <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        {searchQuery.trim() ? `Faculty Matching "${searchQuery}" (${searchedFaculty.length})` : "Top Faculty by Session Volume & Engagement"}
                      </h4>
                      <div className="space-y-2">
                        {(searchQuery.trim() ? searchedFaculty : uniqueCreators.slice(0, 5)).map((fac, idx) => {
                          const info = getFacultyInfo(fac.creator_id);
                          return (
                            <div key={fac.creator_id} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border/40 text-xs">
                              <div className="flex items-center gap-3">
                                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold grid place-items-center text-xs">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-bold text-foreground">{info.name}</div>
                                  <div className="text-[10px] text-muted-foreground">{info.email}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-right">
                                <div>
                                  <div className="font-bold text-foreground">{fac.count} Sessions</div>
                                  <div className="text-[10px] text-muted-foreground">{fac.totalStudents} Students</div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSearchQuery(info.name);
                                    setActiveSection("sessions");
                                  }}
                                  className="h-7 text-xs text-primary"
                                >
                                  View
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Subtab 2: Faculty Directory List */}
                {facultySubTab === "list" && (
                  <div className="glass rounded-2xl overflow-hidden border border-border/60">
                    <div className="p-4 bg-card/40 border-b border-border/60 flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Faculty Directory & Contact Mapping ({searchedFaculty.length}{searchQuery.trim() ? ` / ${uniqueCreators.length}` : ""})
                      </span>
                      {searchQuery.trim() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchQuery("")}
                          className="h-6 text-xs text-primary hover:bg-primary/10"
                        >
                          Clear Search
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground font-bold uppercase text-[10px] tracking-wider border-b border-border/40">
                          <tr>
                            <th className="py-3 px-4">Faculty Name</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4">Creator ID</th>
                            <th className="py-3 px-4">Sessions</th>
                            <th className="py-3 px-4">Students</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {searchedFaculty.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-10 text-muted-foreground">
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <Users className="h-6 w-6 opacity-40 text-muted-foreground" />
                                  <span>No faculty found matching "{searchQuery}".</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSearchQuery("")}
                                    className="h-7 text-xs text-primary hover:bg-primary/10"
                                  >
                                    Clear search
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            searchedFaculty.map((item) => {
                            const info = getFacultyInfo(item.creator_id);
                            return (
                              <tr key={item.creator_id} className="hover:bg-accent/30 transition-colors">
                                <td className="py-3 px-4 font-bold text-foreground">{info.name}</td>
                                <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">{info.email}</td>
                                <td className="py-3 px-4 font-mono text-[10px] text-muted-foreground/70">{item.creator_id.slice(0, 10)}...</td>
                                <td className="py-3 px-4 font-bold text-foreground">{item.count}</td>
                                <td className="py-3 px-4 font-bold text-primary">{item.totalStudents}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedFacultyForReports({
                                          creator_id: item.creator_id,
                                          name: info.name,
                                          email: info.email,
                                          isOnline: false,
                                        });
                                      }}
                                      className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                                      title="View Sessions & Download Reports"
                                    >
                                      <FileText className="h-3 w-3" /> Reports
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingFacultyModal({
                                          creatorId: item.creator_id,
                                          currentName: info.name,
                                          currentEmail: info.email !== "No email synced" ? info.email : "",
                                        });
                                        setEditingFacultyName(info.name);
                                        setEditingFacultyEmail(info.email !== "No email synced" ? info.email : "");
                                      }}
                                      className="h-7 text-xs gap-1 border-border/70"
                                    >
                                      <Pencil className="h-3 w-3" /> Edit
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Subtab 3: Faculty Analytics & Breakdown */}
                {facultySubTab === "breakdown" && (
                  <div className="space-y-3">
                    {searchQuery.trim() && (
                      <div className="flex items-center justify-between text-xs bg-card/40 border border-border/40 p-2.5 rounded-xl">
                        <span className="text-muted-foreground">
                          Showing <strong className="text-foreground">{searchedFaculty.length}</strong> of{" "}
                          <strong className="text-foreground">{uniqueCreators.length}</strong> faculty matching "
                          <span className="text-primary font-bold">{searchQuery}</span>"
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchQuery("")}
                          className="h-6 text-xs text-primary hover:bg-primary/10"
                        >
                          Clear Search
                        </Button>
                      </div>
                    )}

                    {searchedFaculty.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground glass rounded-2xl p-8 border border-border/60">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                        <p className="font-semibold text-sm">No faculty members found matching "{searchQuery}"</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchQuery("")}
                          className="mt-3 text-xs"
                        >
                          Clear Search
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {searchedFaculty.map((item) => {
                const facultySessions = filteredSessionsByTime.filter(
                  (s) => s.creator_id === item.creator_id,
                );
                const facultyLiveSessions = facultySessions.filter(
                  (s) => s.status === "live",
                ).length;
                const facultySessIds = new Set(facultySessions.map((s) => s.id));
                const facultyQuestions = questions.filter((q) => facultySessIds.has(q.session_id));
                const facultyQIds = new Set(facultyQuestions.map((q) => q.id));
                const facultyResponsesCount = responses.filter((r) =>
                  facultyQIds.has(r.question_id),
                ).length;
                const isOnline = loginLogs.some(
                  (l) =>
                    (l.user_id === item.creator_id || l.email === item.profile?.email) &&
                    !l.logout_time,
                );

                return (
                  <div
                    key={item.creator_id}
                    onClick={() => {
                      const facultyInfo = getFacultyInfo(item.creator_id);
                      setSelectedFacultyForReports({
                        creator_id: item.creator_id,
                        name: facultyInfo.name,
                        email: facultyInfo.email,
                        isOnline,
                      });
                    }}
                    className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden cursor-pointer hover:border-primary/60 hover:shadow-lg transition group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {(() => {
                          const facultyInfo = getFacultyInfo(item.creator_id);
                          return (
                            <>
                              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/20 text-primary font-bold text-base shrink-0">
                                {facultyInfo.name.charAt(0) || "F"}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                                    {facultyInfo.name}
                                  </h4>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingFacultyName(facultyInfo.name);
                                      setEditingFacultyEmail(facultyInfo.email);
                                      setEditingFacultyModal({
                                        creatorId: item.creator_id,
                                        currentName: facultyInfo.name,
                                        currentEmail: facultyInfo.email,
                                      });
                                    }}
                                    className="text-muted-foreground hover:text-primary p-0.5 rounded hover:bg-accent transition opacity-60 hover:opacity-100 shrink-0"
                                    title="Set / Map Faculty Name"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {facultyInfo.email}
                                </p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border shrink-0",
                          isOnline
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {isOnline ? "● Online" : "Offline"}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Sessions Created
                        </span>
                        <strong className="text-foreground text-sm font-extrabold">
                          {item.count} Sessions
                        </strong>
                        {facultyLiveSessions > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-emerald-400 font-bold">
                              ({facultyLiveSessions} Live)
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMakeFacultyLiveSessionsDraft(
                                  item.creator_id,
                                  item.profile?.full_name,
                                );
                              }}
                              className="h-5 px-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 gap-1"
                              title="Demote all live sessions for this faculty to draft"
                            >
                              <FileEdit className="h-2.5 w-2.5" />
                              Draft Live
                            </Button>
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Total Students Taught
                        </span>
                        <strong className="text-blue-400 text-sm font-extrabold">
                          {item.totalStudents} Students
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Questions Created
                        </span>
                        <strong className="text-cyan-400 text-sm font-extrabold">
                          {facultyQuestions.length} Qs
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Responses Collected
                        </span>
                        <strong className="text-purple-400 text-sm font-extrabold">
                          {facultyResponsesCount} Resp.
                        </strong>
                      </div>
                    </div>

                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          const facultyInfo = getFacultyInfo(item.creator_id);
                          setSelectedFacultyForReports({
                            creator_id: item.creator_id,
                            name: facultyInfo.name,
                            email: facultyInfo.email,
                            isOnline,
                          });
                        }}
                        className="w-full h-8 text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition shadow-sm"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Sessions & Download Reports
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )}

            {/* VIEW 4: QUESTIONS MANAGEMENT & ANALYTICS */}
            {activeSection === "questions" && (
              <div className="space-y-4">
                {/* Segmented Subnav */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 p-1 bg-card/60 border border-border/60 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setQuestionsSubTab("management")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        questionsSubTab === "management"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Question Management
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuestionsSubTab("analytics")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        questionsSubTab === "analytics"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Question Analytics
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    Total Questions: <strong className="text-foreground">{filteredQuestionsByTime.length}</strong>
                  </div>
                </div>

                {questionsSubTab === "analytics" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass rounded-2xl p-4 border border-border/60 space-y-2">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">Poll Questions</span>
                      <div className="text-2xl font-black text-cyan-400">{pollQuestionsCount}</div>
                      <p className="text-[11px] text-muted-foreground">Multiple-choice format with live tallying</p>
                    </div>
                    <div className="glass rounded-2xl p-4 border border-border/60 space-y-2">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">Word Clouds</span>
                      <div className="text-2xl font-black text-purple-400">{wordcloudQuestionsCount}</div>
                      <p className="text-[11px] text-muted-foreground">Open phrase visualization clouds</p>
                    </div>
                    <div className="glass rounded-2xl p-4 border border-border/60 space-y-2">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">Quiz & MCQs</span>
                      <div className="text-2xl font-black text-emerald-400">{quizQuestionsCount}</div>
                      <p className="text-[11px] text-muted-foreground">Multiple-choice scored assessments</p>
                    </div>
                  </div>
                )}

                {questionsSubTab === "management" && (
                  <div className="glass rounded-2xl overflow-hidden border border-border/60">
              {/* Type Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mr-1">
                    Question Type:
                  </span>
                  <button
                    onClick={() => setQuestionTypeFilter("ALL")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border",
                      questionTypeFilter === "ALL"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                    )}
                  >
                    All ({filteredQuestionsByTime.length})
                  </button>
                  <button
                    onClick={() => setQuestionTypeFilter("poll")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      questionTypeFilter === "poll"
                        ? "bg-cyan-500 text-white border-cyan-500 shadow-sm"
                        : "bg-cyan-500/10 text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/20",
                    )}
                  >
                    Polls ({pollQuestionsCount})
                  </button>
                  <button
                    onClick={() => setQuestionTypeFilter("wordcloud")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      questionTypeFilter === "wordcloud"
                        ? "bg-purple-500 text-white border-purple-500 shadow-sm"
                        : "bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20",
                    )}
                  >
                    Word Clouds ({wordcloudQuestionsCount})
                  </button>
                  <button
                    onClick={() => setQuestionTypeFilter("quiz")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5",
                      questionTypeFilter === "quiz"
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20",
                    )}
                  >
                    Quizzes ({quizQuestionsCount})
                  </button>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  Showing{" "}
                  <span className="font-bold text-foreground">{searchedQuestions.length}</span>{" "}
                  questions
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Question Prompt / Title</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Session Name & Code</th>
                      <th className="px-4 py-3">Faculty Creator</th>
                      <th className="px-4 py-3">Options / Choices</th>
                      <th className="px-4 py-3">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {searchedQuestions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          No questions match filter query.
                        </td>
                      </tr>
                    ) : (
                      searchedQuestions.map((q) => {
                        const parentSession = sessions.find((s) => s.id === q.session_id);
                        const faculty = parentSession
                          ? getFacultyInfo(parentSession.creator_id)
                          : { name: "Faculty", email: "" };
                        const optionsList = Array.isArray(q.options) ? q.options : [];

                        return (
                          <tr key={q.id} className="hover:bg-accent/40 transition">
                            <td className="px-4 py-3 max-w-[260px]">
                              <div className="font-bold text-foreground flex items-center gap-2">
                                <HelpCircle className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                                <span className="truncate">{q.title}</span>
                              </div>
                              {q.image_url && (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                                  <Sparkles className="h-3 w-3" /> Includes Attached Image
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                                  q.type === "poll"
                                    ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                                    : q.type === "wordcloud"
                                      ? "bg-purple-500/10 text-purple-500 border-purple-500/30"
                                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                                )}
                              >
                                {q.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[180px]">
                              {parentSession ? (
                                <>
                                  <div className="font-semibold text-foreground truncate">
                                    {parentSession.title}
                                  </div>
                                  <div className="font-mono text-[10px] text-primary font-black">
                                    {parentSession.code}
                                  </div>
                                </>
                              ) : (
                                <span className="text-muted-foreground italic">
                                  Session {q.session_id.slice(0, 6)}...
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-[180px] truncate">
                              <button
                                type="button"
                                onClick={() => {
                                  if (parentSession?.creator_id) {
                                    setSelectedFacultyForReports({
                                      creator_id: parentSession.creator_id,
                                      name: faculty.name,
                                      email: faculty.email,
                                      isOnline: false,
                                    });
                                  }
                                }}
                                className="text-left group/fac block w-full truncate focus:outline-none"
                                title="Click to view all sessions and download reports for this faculty"
                              >
                                <div className="font-bold text-foreground group-hover/fac:text-primary transition truncate">
                                  {faculty.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {faculty.email}
                                </div>
                              </button>
                            </td>
                            <td className="px-4 py-3 max-w-[280px]">
                              {optionsList.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {optionsList.map((opt: any, idx: number) => {
                                    const text =
                                      typeof opt === "string"
                                        ? opt
                                        : opt?.text || JSON.stringify(opt);
                                    const isCorrect = q.correct_answer && q.correct_answer === text;
                                    return (
                                      <span
                                        key={idx}
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[10px] border",
                                          isCorrect
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                                            : "bg-card/80 text-muted-foreground border-border/40",
                                        )}
                                      >
                                        {text} {isCorrect && "✓"}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : q.type === "wordcloud" ? (
                                <span className="text-[10px] text-muted-foreground italic">
                                  Open-ended word responses
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">
                                  No predefined choices
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                              {q.created_at ? new Date(q.created_at).toLocaleString() : "N/A"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
                )}
              </div>
            )}

            {/* VIEW 5: SUBMISSIONS MANAGEMENT */}
            {activeSection === "submissions" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Answers Recorded</span>
                    <div className="text-2xl font-black text-purple-400">{filteredResponsesByTime.length}</div>
                    <p className="text-[11px] text-muted-foreground">Responses across active time window</p>
                  </div>
                  <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">Questions Answered</span>
                    <div className="text-2xl font-black text-primary">{filteredQuestionsByTime.length}</div>
                    <p className="text-[11px] text-muted-foreground">Unique questions receiving submissions</p>
                  </div>
                  <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">Active Today</span>
                    <div className="text-2xl font-black text-emerald-400">
                      {filteredResponsesByTime.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Logged within current calendar day</p>
                  </div>
                </div>

                <div className="glass rounded-2xl p-5 border border-border/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-purple-500" /> Recent Student Answers (
                      {searchedResponses.length}{searchQuery.trim() ? ` / ${filteredResponsesByTime.length}` : ""})
                    </h3>
                    {searchQuery.trim() && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                        className="h-6 text-xs text-primary hover:bg-primary/10"
                      >
                        Clear Search
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {searchedResponses.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground italic">
                        No submissions found matching "{searchQuery}".
                      </div>
                    ) : (
                      searchedResponses.map((r) => {
                        const part = participants.find((p) => p.id === r.participant_id);
                        const qItem = questions.find((q) => q.id === r.question_id);
                        const sItem = qItem ? sessions.find((s) => s.id === qItem.session_id) : null;
                        const fac = sItem ? getFacultyInfo(sItem.creator_id) : null;

                        return (
                          <div
                            key={r.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-card/60 border border-border/40 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-bold text-primary font-mono bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg text-xs shrink-0">
                                {r.answer}
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">
                                  {part?.name ? part.name : `Participant ${r.participant_id.slice(0, 8)}...`}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {qItem?.title || "Question"} {sItem ? `• ${sItem.title} (${sItem.code})` : ""} {fac ? `• ${fac.name}` : ""}
                                </div>
                              </div>
                            </div>
                            <span className="text-muted-foreground text-[10px] font-mono shrink-0">
                              {new Date(r.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 6: ACTIVITY MONITORING */}
            {activeSection === "activity" && (
              <div className="space-y-4">
                <div className="glass rounded-2xl p-5 border border-border/60 space-y-4 font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold flex items-center gap-2 text-emerald-500">
                        <Terminal className="h-4 w-4" /> Live Realtime Telemetry & Audit Stream
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(["ALL", "AUTH", "SESSION", "RESPONSE", "QUESTION", "SYSTEM"] as const).map(
                        (tag) => (
                          <button
                            key={tag}
                            onClick={() => setLogFilterTag(tag)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase transition border",
                              logFilterTag === tag
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card/50 text-muted-foreground border-border hover:text-foreground",
                            )}
                          >
                            {tag}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="bg-black/90 rounded-xl p-4 text-xs space-y-2.5 max-h-[500px] overflow-y-auto border border-border/60 text-slate-200 shadow-inner">
                    {filteredAuditLogs.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 italic">
                        No telemetry logs found for current filter.
                      </div>
                    ) : (
                      filteredAuditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 hover:bg-slate-900/60 p-1 rounded transition"
                        >
                          <span className="text-slate-500 text-[10px] select-none font-bold">
                            {log.id}
                          </span>
                          <span className="text-slate-400 text-[10px] select-none">
                            [{log.timestamp}]
                          </span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider select-none",
                              log.tag === "AUTH"
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : log.tag === "SESSION"
                                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                  : log.tag === "RESPONSE"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                            )}
                          >
                            {log.tag}
                          </span>
                          <span
                            className={cn(
                              "flex-1 break-all",
                              log.type === "success"
                                ? "text-emerald-400"
                                : log.type === "warn"
                                  ? "text-amber-300"
                                  : log.type === "error"
                                    ? "text-rose-400"
                                    : "text-slate-200",
                            )}
                          >
                            {log.msg}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 7: SECURITY MONITORING */}
            {activeSection === "security" && (
              <div className="space-y-4">
                {/* Segmented Subnav */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 p-1 bg-card/60 border border-border/60 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSecuritySubTab("overview")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        securitySubTab === "overview"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Security Overview
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecuritySubTab("failed_attempts")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                        securitySubTab === "failed_attempts"
                          ? "bg-rose-500 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Failed Attempts
                      {failedAttempts.length > 0 && (
                        <span className="h-4 px-1.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-bold grid place-items-center">
                          {failedAttempts.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecuritySubTab("logins")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        securitySubTab === "logins"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Login History ({loginLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecuritySubTab("waf")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        securitySubTab === "waf"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      WAF & Perimeter
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Perimeter Active
                    </span>
                  </div>
                </div>

                {/* Subtab 1: Security Overview */}
                {securitySubTab === "overview" && (
                  <SecurityIntelligenceView />
                )}

                {/* Subtab 2: Failed Attempts (Access Security) */}
                {securitySubTab === "failed_attempts" && (
                  <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                          <Shield className="h-5 w-5 text-rose-500" /> Security Access Log: Failed
                          Developer Password Attempts
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Tracks unauthorized access attempts into the Developer Portal with timestamp,
                          client environment, and IP address (passwords are never logged or stored).
                        </p>
                        <div className="flex items-center gap-2 pt-2 flex-wrap">
                          <span
                            className={cn(
                              "text-[11px] px-2.5 py-0.5 rounded-lg border font-semibold flex items-center gap-1.5",
                              recentFailedAttempts.length > 0
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
                            )}
                          >
                            <Shield className="h-3 w-3" />
                            Recent Failed Attempts (24h): {recentFailedAttempts.length}
                          </span>
                          <span className="text-[11px] px-2.5 py-0.5 rounded-lg border border-border/50 bg-muted/20 text-muted-foreground font-medium">
                            Total Retained Logs: {failedAttempts.length}
                          </span>
                        </div>
                      </div>

                      {failedAttempts.length > 0 && (
                        <Button
                          onClick={handleClearFailedAttempts}
                          variant="outline"
                          size="sm"
                          className="gap-2 text-xs border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Clear Access Logs
                        </Button>
                      )}
                    </div>

                    {failedAttempts.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 grid place-items-center text-emerald-500 mx-auto">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div className="text-sm font-bold text-foreground">
                          No Failed Password Attempts Recorded
                        </div>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          All developer portal access attempts have been clean and authorized.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Log ID</th>
                              <th className="px-4 py-3">Timestamp</th>
                              <th className="px-4 py-3">Client Environment</th>
                              <th className="px-4 py-3">IP Address (Informational)</th>
                              <th className="px-4 py-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {failedAttempts.map((attempt) => (
                              <tr key={attempt.id} className="hover:bg-rose-500/5 transition">
                                <td className="px-4 py-3 font-mono font-bold text-rose-400">
                                  {attempt.id.slice(0, 8)}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground font-mono">
                                  {attempt.attempted_at
                                    ? new Date(attempt.attempted_at).toLocaleString()
                                    : "Unknown"}
                                </td>
                                <td className="px-4 py-3 font-semibold text-foreground">
                                  {attempt.client_environment || attempt.user_agent || "Web Client"}
                                </td>
                                <td className="px-4 py-3 font-mono text-muted-foreground">
                                  {attempt.ip_address || "unknown"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/30">
                                    Access Denied
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Subtab 3: Login History */}
                {securitySubTab === "logins" && (
                  <div className="glass rounded-2xl overflow-hidden border border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Faculty Login Logs & Active Sessions ({loginLogs.length})
                      </div>
                      <div className="text-xs text-muted-foreground font-medium">
                        Active Faculty Online:{" "}
                        <span className="font-bold text-emerald-400">
                          {loginLogs.filter((l) => !l.logout_time).length}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Faculty / User Email</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Login Time</th>
                            <th className="px-4 py-3">Logout Time</th>
                            <th className="px-4 py-3">Session Duration</th>
                            <th className="px-4 py-3">Browser / Device</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {loginLogs.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-8 text-muted-foreground">
                                No login history recorded yet.
                              </td>
                            </tr>
                          ) : (
                            loginLogs.map((log) => {
                              const isOnline = !log.logout_time;
                              const rawDuration = log.session_duration;
                              const durationSec =
                                typeof rawDuration === "number"
                                  ? rawDuration
                                  : typeof rawDuration === "string"
                                    ? parseInt(rawDuration, 10) || 0
                                    : 0;
                              const durationFormatted =
                                durationSec > 0
                                  ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                                  : isOnline
                                    ? "Active"
                                    : "< 1m";

                              return (
                                <tr key={log.id} className="hover:bg-accent/40 transition">
                                  <td className="px-4 py-3 font-semibold text-foreground">
                                    {log.email || `User ${log.user_id.slice(0, 8)}`}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                      {log.role}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground font-mono">
                                    {new Date(log.login_time).toLocaleString()}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground font-mono">
                                    {log.logout_time
                                      ? new Date(log.logout_time).toLocaleString()
                                      : "Active Session"}
                                  </td>
                                  <td className="px-4 py-3 font-mono font-semibold text-foreground">
                                    {durationFormatted}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {log.browser || "Browser"} • {log.device || "Desktop"} (
                                    {log.operating_system || "OS"})
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border",
                                        isOnline
                                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                          : "bg-muted text-muted-foreground border-border",
                                      )}
                                    >
                                      {isOnline && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      )}
                                      {isOnline ? "Online" : "Logged Out"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Subtab 4: WAF & Perimeter */}
                {securitySubTab === "waf" && (
                  <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                          <Shield className="h-5 w-5 text-primary" /> Web Application Firewall & Security Rules
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enterprise perimeter filtering, geographic rate-limiting, and anomaly detection.
                        </p>
                      </div>
                      <Button asChild size="sm" className="gradient-bg text-white rounded-xl text-xs font-bold gap-1.5 shadow-sm">
                        <Link to="/developer-waf">
                          Manage WAF Config
                        </Link>
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-card/60 border border-border/60 space-y-1.5">
                        <span className="font-bold text-foreground">Failed Developer Access Anti-Spam:</span>
                        <p className="text-muted-foreground">Enforces 5 attempts/min per IP and 30 attempts/min global limit using PostgreSQL transaction advisory locking.</p>
                      </div>
                      <div className="p-4 rounded-xl bg-card/60 border border-border/60 space-y-1.5">
                        <span className="font-bold text-foreground">RLS Policy Isolation:</span>
                        <p className="text-muted-foreground">Public execution revoked from public role; access log reads restricted to verified administrator accounts.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 8: SYSTEM HEALTH & AI TELEMETRY */}
            {activeSection === "health" && (
              <div className="space-y-4">
                {/* Segmented Subnav */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 p-1 bg-card/60 border border-border/60 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setHealthSubTab("infrastructure")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        healthSubTab === "infrastructure"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Infrastructure & Telemetry
                    </button>
                    <button
                      type="button"
                      onClick={() => setHealthSubTab("ai_services")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                        healthSubTab === "ai_services"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      AI Services & Key Pool (16 Keys)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHealthSubTab("tokens")}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition",
                        healthSubTab === "tokens"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      Token Telemetry & Usage
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Services Healthy
                    </span>
                  </div>
                </div>

                {/* Subtab 1: Infrastructure & Telemetry Health */}
                {healthSubTab === "infrastructure" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">PostgreSQL Database</span>
                        <div className="text-xl font-black text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" /> Connected
                        </div>
                        <p className="text-[11px] text-muted-foreground">Supabase cloud host reachable</p>
                      </div>
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">Realtime Engine</span>
                        <div className="text-xl font-black text-blue-400 flex items-center gap-1.5">
                          <Zap className="h-4 w-4" /> Active
                        </div>
                        <p className="text-[11px] text-muted-foreground">WebSockets subscriptions live</p>
                      </div>
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">AI Key Redundancy</span>
                        <div className="text-xl font-black text-amber-400">16 Keys</div>
                        <p className="text-[11px] text-muted-foreground">Groq (5) + Gemini (11) pools</p>
                      </div>
                      <div className="glass rounded-2xl p-4 border border-border/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground">Server Mode</span>
                        <div className={cn("text-xl font-black", isServerDown ? "text-rose-400" : "text-emerald-400")}>
                          {isServerDown ? "Maintenance Mode" : "Normal Mode"}
                        </div>
                        <p className="text-[11px] text-muted-foreground">App routing & access status</p>
                      </div>
                    </div>

                    <div className="glass rounded-2xl p-5 border border-border/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                          System Diagnostics & Environment
                        </h4>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setHealthSubTab("ai_services");
                          }}
                          className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 gap-1"
                        >
                          <Key className="h-3 w-3" /> Test AI Keys Pool
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-card/60 border border-border/40">
                          <div className="font-bold text-foreground">Client Environment:</div>
                          <div className="text-muted-foreground font-mono text-[11px] mt-0.5 truncate">{navigator.userAgent}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-card/60 border border-border/40">
                          <div className="font-bold text-foreground">API Latency Benchmark:</div>
                          <div className="text-emerald-400 font-mono font-bold text-sm mt-0.5">Sub-50ms Supabase Edge</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subtab 2: AI Services & Key Pool */}
                {healthSubTab === "ai_services" && (
                  <div className="space-y-4">
            {aiKeyInventoryError && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                AI key diagnostics are unavailable: {aiKeyInventoryError} Diagnostics run on the
                server and require a signed-in @kct.ac.in account with the admin role.
              </div>
            )}
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Key className="h-5 w-5 text-amber-400" /> AI Keys Diagnostic Suite: Groq API
                    Key Telemetry
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    View real-time diagnostic health, rate limit checks, and usage metrics for the
                    {aiKeyCounts.groq} Groq key slot(s) configured in server environment variables.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={loadKeyUsage}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs border-border"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh Stats
                  </Button>
                  <Button
                    onClick={handleTestAllKeys}
                    disabled={testingAllKeys}
                    variant="default"
                    size="sm"
                    className="gap-2 text-xs bg-amber-500 hover:bg-amber-600 text-black font-bold"
                  >
                    {testingAllKeys ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {testingAllKeys ? "Testing..." : "Test All Keys"}
                  </Button>
                </div>
              </div>

              {/* Telemetry info card */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" /> Active Rotation
                    Mode
                  </div>
                  <div className="text-xl font-extrabold text-foreground">Rotated Failover</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Server-side AI calls cycle through the configured keys in priority order. If one
                    key hits a rate limit or fails, the server switches to the next configured key.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Push Protected Secrets
                  </div>
                  <div className="text-xl font-extrabold text-foreground">
                    Server-Only Secrets
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Keys live only in server environment variables. The browser never receives key
                    material; diagnostics run on the server and return a status only.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-400" /> API Requests Limit
                  </div>
                  <div className="text-xl font-extrabold text-foreground">{(aiKeyCounts.groq * 14400).toLocaleString()} requests/day</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Each Groq key allows up to 14,400 free requests per day, giving the KCT Pulse
                    workspace a daily allocation of {(aiKeyCounts.groq * 14400).toLocaleString()} document question generations.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Key Index</th>
                      <th className="px-4 py-3">Account / Owner</th>
                      <th className="px-4 py-3">Slot Label</th>
                      <th className="px-4 py-3">Diagnostic Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3 text-center">Successes</th>
                      <th className="px-4 py-3 text-center">Failures</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {Array.from({ length: aiKeyCounts.groq }, (_, idx) => {
                      const sig = getAiKeySlotLabel("groq", idx);
                      const usage = keyUsageData[sig] || {
                        attempts: 0,
                        successes: 0,
                        failures: 0,
                        lastUsed: "",
                      };
                      const state = groqKeysStatus[idx] ?? { status: "unchecked" as const };

                      return (
                        <tr key={idx} className="hover:bg-card/40 transition">
                          <td className="px-4 py-4 font-mono font-bold text-foreground">
                            Key #{idx + 1}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground text-xs">
                                {groqKeyOwners[idx] || `Groq Key #${idx + 1}`}
                              </span>
                              <button
                                onClick={() => handleOpenEditKeyOwner("groq", idx)}
                                className="text-muted-foreground hover:text-amber-400 p-1 rounded hover:bg-amber-500/10 transition shrink-0"
                                title="Set / Edit Account Name"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono font-semibold text-foreground/80">
                            {sig}
                          </td>
                          <td className="px-4 py-4">
                            {state.status === "unchecked" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                                Unchecked
                              </span>
                            )}
                            {state.status === "testing" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase animate-pulse">
                                <Loader2 className="h-3 w-3 animate-spin" /> Verifying...
                              </span>
                            )}
                            {state.status === "active" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                                <CheckCircle2 className="h-3 w-3" /> Active / Healthy
                              </span>
                            )}
                            {state.status === "rate_limited" && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase">
                                  <Clock className="h-3 w-3" /> Rate Limited
                                </span>
                                {state.errorMsg && (
                                  <span
                                    className="block text-[10px] text-amber-400 font-mono max-w-[200px] truncate"
                                    title={state.errorMsg}
                                  >
                                    {state.errorMsg}
                                  </span>
                                )}
                              </div>
                            )}
                            {state.status === "invalid" && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                                  <Lock className="h-3 w-3" /> Invalid / Unauthorized
                                </span>
                                {state.errorMsg && (
                                  <span
                                    className="block text-[10px] text-rose-400 font-mono max-w-[200px] truncate"
                                    title={state.errorMsg}
                                  >
                                    {state.errorMsg}
                                  </span>
                                )}
                              </div>
                            )}
                            {state.status === "error" && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                                  Error
                                </span>
                                <span
                                  className="block text-[10px] text-rose-400 font-mono max-w-[200px] truncate"
                                  title={state.errorMsg}
                                >
                                  {state.errorMsg}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-foreground/80">
                            {usage.attempts}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-emerald-400">
                            {usage.successes}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-rose-400">
                            {usage.failures}
                          </td>
                          <td className="px-4 py-4 text-muted-foreground font-mono">
                            {usage.lastUsed
                              ? new Date(usage.lastUsed).toLocaleString()
                              : "Never Used"}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button
                              onClick={() => handleTestKey(idx)}
                              disabled={state.status === "testing"}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            >
                              Test Key
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Google Gemini 11-Key Pool Diagnostic Suite */}
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-cyan-400" /> AI Keys Diagnostic Suite: Google Gemini Pool ({aiKeyCounts.gemini} Keys)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time diagnostic health, verification checks, and usage telemetry across the {aiKeyCounts.gemini} Google Gemini key slot(s) configured on the server.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={loadKeyUsage}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs border-border"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh Stats
                  </Button>
                  <Button
                    onClick={handleTestAllGeminiKeys}
                    disabled={testingAllGeminiKeys}
                    variant="default"
                    size="sm"
                    className="gap-2 text-xs bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                  >
                    {testingAllGeminiKeys ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {testingAllGeminiKeys ? "Testing..." : `Test All ${aiKeyCounts.gemini} Keys`}
                  </Button>
                </div>
              </div>

              {/* Gemini Telemetry info card */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-cyan-400 animate-pulse" /> Server Failover Pool
                  </div>
                  <div className="text-xl font-extrabold text-foreground">Round-Robin Active</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Server requests cycle through the configured Gemini API keys. If any key hits a quota or rate limit, requests automatically cascade to the next key.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Server-Only Key Storage
                  </div>
                  <div className="text-xl font-extrabold text-foreground">Never Sent to Browser</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Keys are read from server environment variables and sent to Google only in request headers, never in URLs or browser code.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-blue-400" /> Daily Capacity
                  </div>
                  <div className="text-xl font-extrabold text-foreground">{(aiKeyCounts.gemini * 1500).toLocaleString()} requests/day</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    With 1,500 free requests per key each day, the configured pool delivers a collective capacity of {(aiKeyCounts.gemini * 1500).toLocaleString()} AI operations daily.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Key Index</th>
                      <th className="px-4 py-3">Account / Owner</th>
                      <th className="px-4 py-3">Slot Label</th>
                      <th className="px-4 py-3">Diagnostic Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3 text-center">Successes</th>
                      <th className="px-4 py-3 text-center">Failures</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {Array.from({ length: aiKeyCounts.gemini }, (_, idx) => {
                      const sig = getAiKeySlotLabel("gemini", idx);
                      const usage = keyUsageData[sig] || {
                        attempts: 0,
                        successes: 0,
                        failures: 0,
                        lastUsed: "",
                      };
                      const state = geminiKeysStatus[idx] ?? { status: "unchecked" as const };

                      return (
                        <tr key={idx} className="hover:bg-card/40 transition">
                          <td className="px-4 py-4 font-mono font-bold text-foreground">
                            Gemini #{idx + 1}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground text-xs">
                                {geminiKeyOwners[idx] || `Google Account #${idx + 1}`}
                              </span>
                              <button
                                onClick={() => handleOpenEditKeyOwner("gemini", idx)}
                                className="text-muted-foreground hover:text-cyan-400 p-1 rounded hover:bg-cyan-500/10 transition shrink-0"
                                title="Set / Edit Google Account Name"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono font-semibold text-foreground/80">
                            {sig}
                          </td>
                          <td className="px-4 py-4">
                            {state.status === "unchecked" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                                Unchecked
                              </span>
                            )}
                            {state.status === "testing" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-400 uppercase animate-pulse">
                                <Loader2 className="h-3 w-3 animate-spin" /> Verifying...
                              </span>
                            )}
                            {state.status === "active" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                                <CheckCircle2 className="h-3 w-3" /> Active / Healthy
                              </span>
                            )}
                            {state.status === "rate_limited" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase">
                                <Clock className="h-3 w-3" /> Rate Limited
                              </span>
                            )}
                            {state.status === "invalid" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                                <Lock className="h-3 w-3" /> Invalid / Unauthorized
                              </span>
                            )}
                            {state.status === "error" && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                                  Error
                                </span>
                                <span
                                  className="block text-[10px] text-rose-400 font-mono max-w-[200px] truncate"
                                  title={state.errorMsg}
                                >
                                  {state.errorMsg}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-foreground/80">
                            {usage.attempts}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-emerald-400">
                            {usage.successes}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-rose-400">
                            {usage.failures}
                          </td>
                          <td className="px-4 py-4 text-muted-foreground font-mono">
                            {usage.lastUsed
                              ? new Date(usage.lastUsed).toLocaleString()
                              : "Never Used"}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button
                              onClick={() => handleTestGeminiKey(idx)}
                              disabled={state.status === "testing"}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                            >
                              Test Key
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
                  </div>
                )}

                {/* Subtab 3: Token Telemetry & Usage */}
                {healthSubTab === "tokens" && (
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-6">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Zap className="h-5 w-5 text-cyan-400" /> AI Token Usage Telemetry & Accounting
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time prompt and completion token accounting, provider breakdown, estimated commercial cost savings, and historical audit log across all API calls.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={reloadTokens}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-border h-8"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </Button>
                  <Button
                    onClick={downloadTokenReportCSV}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-border h-8"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                  <Button
                    onClick={downloadTokenReportJSON}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-border h-8"
                  >
                    <Download className="h-3.5 w-3.5" /> Export JSON
                  </Button>
                  <Button
                    onClick={handleClearTokens}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-500 h-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Reset
                  </Button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 animate-pulse" /> Total Token Throughput
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    {tokenSummary.totalTokens.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/40">
                    <span>Prompt: <strong className="text-foreground">{tokenSummary.totalPromptTokens.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Output: <strong className="text-foreground">{tokenSummary.totalCompletionTokens.toLocaleString()}</strong></span>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Total Invocations
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    {tokenSummary.totalRequests.toLocaleString()} Calls
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/40">
                    <span className="text-emerald-400 font-bold">{tokenSummary.successfulRequests} Succeeded</span>
                    <span>•</span>
                    <span className={tokenSummary.failedRequests > 0 ? "text-rose-400 font-bold" : "text-muted-foreground"}>
                      {tokenSummary.failedRequests} Failed
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Value Generated
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    ${tokenSummary.totalCostUsd.toFixed(4)} USD
                  </div>
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
                    Commercial rate equivalent saved via free tiers
                  </div>
                </div>

                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-purple-400 animate-pulse" /> Active Key Fleet
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    16 Rotated Keys
                  </div>
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    11 Gemini (16.5k/d) + 5 Groq (72k/d)
                  </div>
                </div>
              </div>

              {/* Provider Allocation Cards */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">
                  Token Throughput by AI Provider
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Google Gemini Card */}
                  <div className="rounded-xl border border-cyan-500/30 bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-sm flex items-center gap-1.5 text-cyan-400">
                        <Sparkles className="h-4 w-4" /> Google Gemini
                      </div>
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        11-Key Pool
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xl font-mono font-black text-foreground">
                        {(tokenSummary.byProvider.gemini?.totalTokens || 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">tokens</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex justify-between">
                        <span>Input: {(tokenSummary.byProvider.gemini?.promptTokens || 0).toLocaleString()}</span>
                        <span>Output: {(tokenSummary.byProvider.gemini?.completionTokens || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between">
                      <span>{(tokenSummary.byProvider.gemini?.requests || 0)} Requests</span>
                      <span className="font-mono text-cyan-400">${(tokenSummary.byProvider.gemini?.costUsd || 0).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Groq Card */}
                  <div className="rounded-xl border border-amber-500/30 bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-sm flex items-center gap-1.5 text-amber-400">
                        <Key className="h-4 w-4" /> Groq API
                      </div>
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        5-Key Pool
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xl font-mono font-black text-foreground">
                        {(tokenSummary.byProvider.groq?.totalTokens || 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">tokens</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex justify-between">
                        <span>Input: {(tokenSummary.byProvider.groq?.promptTokens || 0).toLocaleString()}</span>
                        <span>Output: {(tokenSummary.byProvider.groq?.completionTokens || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between">
                      <span>{(tokenSummary.byProvider.groq?.requests || 0)} Requests</span>
                      <span className="font-mono text-amber-400">${(tokenSummary.byProvider.groq?.costUsd || 0).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* NVIDIA NIM Card */}
                  <div className="rounded-xl border border-emerald-500/30 bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-sm flex items-center gap-1.5 text-emerald-400">
                        <Zap className="h-4 w-4" /> NVIDIA NIM
                      </div>
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Llama 3.3 70B
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xl font-mono font-black text-foreground">
                        {(tokenSummary.byProvider.nvidia?.totalTokens || 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">tokens</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex justify-between">
                        <span>Input: {(tokenSummary.byProvider.nvidia?.promptTokens || 0).toLocaleString()}</span>
                        <span>Output: {(tokenSummary.byProvider.nvidia?.completionTokens || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between">
                      <span>{(tokenSummary.byProvider.nvidia?.requests || 0)} Requests</span>
                      <span className="font-mono text-emerald-400">${(tokenSummary.byProvider.nvidia?.costUsd || 0).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Together AI Card */}
                  <div className="rounded-xl border border-purple-500/30 bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-sm flex items-center gap-1.5 text-purple-400">
                        <Layers className="h-4 w-4" /> Together AI
                      </div>
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                        Llama Turbo
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xl font-mono font-black text-foreground">
                        {(tokenSummary.byProvider.together?.totalTokens || 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">tokens</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex justify-between">
                        <span>Input: {(tokenSummary.byProvider.together?.promptTokens || 0).toLocaleString()}</span>
                        <span>Output: {(tokenSummary.byProvider.together?.completionTokens || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between">
                      <span>{(tokenSummary.byProvider.together?.requests || 0)} Requests</span>
                      <span className="font-mono text-purple-400">${(tokenSummary.byProvider.together?.costUsd || 0).toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Telemetry Charts: Provider Allocation & Prompt vs Completion */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: AI Provider Share (Donut) */}
                <div className="rounded-2xl border border-border/60 bg-card/50 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                        <PieChartIcon className="h-4 w-4 text-cyan-400" /> AI Provider Consumption Share
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Proportion of total tokens handled by each LLM backend
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                      Live Telemetry
                    </span>
                  </div>

                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tokenProviderChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {tokenProviderChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          allowEscapeViewBox={{ x: true, y: true }}
                          offset={14}
                          wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "0.75rem",
                            color: "hsl(var(--foreground))",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                            padding: "8px 12px",
                          }}
                          formatter={(val: any) => [`${Number(val).toLocaleString()} tokens`, "Throughput"]}
                        />
                        <RechartsLegend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(val) => <span className="text-xs font-semibold text-foreground/90">{val}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Prompt vs Completion Comparison (Grouped Bar Chart) */}
                <div className="rounded-2xl border border-border/60 bg-card/50 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-amber-400" /> Prompt vs. Completion Ratio
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Input tokens (prompts) vs output tokens (generation) per provider
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                      I/O Ratio
                    </span>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tokenPromptVsCompletionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="provider" tick={{ fill: "currentColor", fontSize: 11 }} />
                        <YAxis tick={{ fill: "currentColor", fontSize: 10 }} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "0.75rem",
                            color: "hsl(var(--foreground))",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                          }}
                        />
                        <RechartsLegend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(val) => <span className="text-xs font-semibold text-foreground/90">{val === "prompt" ? "Input (Prompt)" : "Output (Generation)"}</span>}
                        />
                        <Bar dataKey="prompt" fill="#06b6d4" radius={[4, 4, 0, 0]} name="prompt" />
                        <Bar dataKey="completion" fill="#f59e0b" radius={[4, 4, 0, 0]} name="completion" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Per-Key Token Consumption Table */}
              {Object.keys(tokenSummary.byKey).length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Per-Key Token Accounting ({Object.keys(tokenSummary.byKey).length} Keys Logged)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Key Signature</th>
                          <th className="px-4 py-3">Provider</th>
                          <th className="px-4 py-3 text-right">Prompt Tokens</th>
                          <th className="px-4 py-3 text-right">Completion Tokens</th>
                          <th className="px-4 py-3 text-right">Total Tokens</th>
                          <th className="px-4 py-3 text-center">Requests</th>
                          <th className="px-4 py-3 text-center">Success Rate</th>
                          <th className="px-4 py-3">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {Object.values(tokenSummary.byKey).map((k) => (
                          <tr key={k.signature} className="hover:bg-card/40 transition">
                            <td className="px-4 py-3 font-mono font-bold text-foreground">
                              {k.signature}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                  k.provider === "gemini" && "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                                  k.provider === "groq" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                                  k.provider === "nvidia" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                                  k.provider === "together" && "bg-purple-500/10 text-purple-400 border-purple-500/30",
                                )}
                              >
                                {k.provider}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-foreground/80">
                              {k.promptTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-foreground/80">
                              {k.completionTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-black text-cyan-400">
                              {k.totalTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-center font-mono font-bold text-foreground">
                              {k.requests}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-emerald-400 font-bold">
                              {k.requests > 0 ? `${Math.round((k.successes / k.requests) * 100)}%` : "100%"}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground text-[11px]">
                              {k.lastUsed ? new Date(k.lastUsed).toLocaleTimeString() : "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Live Request Activity Audit Feed */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Live API Request Audit Stream ({filteredTokenLogs.length} Records)
                  </h4>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Provider filter */}
                    <select
                      value={tokenProviderFilter}
                      onChange={(e) => setTokenProviderFilter(e.target.value)}
                      aria-label="Filter token logs by provider"
                      className="text-xs bg-card/60 border border-border rounded-lg px-2.5 py-1.5 text-foreground"
                    >
                      <option value="all">All Providers</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="groq">Groq</option>
                      <option value="nvidia">NVIDIA NIM</option>
                      <option value="together">Together AI</option>
                    </select>

                    <div className="relative flex-1 sm:w-48">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        value={tokenSearchFilter}
                        onChange={(e) => setTokenSearchFilter(e.target.value)}
                        className="pl-8 h-8 text-xs bg-card/60 border-border"
                      />
                    </div>
                  </div>
                </div>

                {filteredTokenLogs.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card/30 p-8 text-center space-y-2">
                    <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                    <div className="text-xs font-bold text-muted-foreground">
                      No Token Requests Recorded Yet
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 max-w-sm mx-auto">
                      Generate questions from documents, chat with the AI assistant, or run diagnostic key tests to see live token telemetry stream here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Timestamp</th>
                          <th className="px-4 py-3">Provider & Model</th>
                          <th className="px-4 py-3">Feature</th>
                          <th className="px-4 py-3 text-right">Input Tokens</th>
                          <th className="px-4 py-3 text-right">Output Tokens</th>
                          <th className="px-4 py-3 text-right">Total Tokens</th>
                          <th className="px-4 py-3 text-center">Latency</th>
                          <th className="px-4 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredTokenLogs.slice(0, 50).map((log) => (
                          <tr key={log.id} className="hover:bg-card/40 transition">
                            <td className="px-4 py-3 font-mono text-muted-foreground text-[11px] whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase",
                                    log.provider === "gemini" && "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30",
                                    log.provider === "groq" && "bg-amber-500/10 text-amber-400 border border-amber-500/30",
                                    log.provider === "nvidia" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
                                    log.provider === "together" && "bg-purple-500/10 text-purple-400 border border-purple-500/30",
                                  )}
                                >
                                  {log.provider}
                                </span>
                                <span className="font-mono text-foreground/90 font-medium truncate max-w-[140px]" title={log.model}>
                                  {log.model}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] text-muted-foreground capitalize">
                                {log.feature.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/80">
                              {log.promptTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/80">
                              {log.completionTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-black text-cyan-400">
                              {log.totalTokens.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-muted-foreground text-[11px]">
                              {log.latencyMs > 0 ? `${log.latencyMs}ms` : "<10ms"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {log.success ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                                  <CheckCircle2 className="h-3 w-3" /> OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase" title={log.errorMessage}>
                                  Error
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
                )}
              </div>
            )}

            {/* VIEW 9: CONTACT MESSAGES */}
            {activeSection === "contact_messages" && (
              <div className="space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-400" /> Contact Messages & Feedback Telemetry
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage feedback, feature requests, and bug reports submitted by students and faculty.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs font-black text-blue-400">
                    {contactMessages.length} {contactMessages.length === 1 ? "Message" : "Messages"}
                  </span>
                  <Button
                    onClick={() => loadData()}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs border-border/60 hover:bg-accent h-8"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                    <span>Refresh</span>
                  </Button>
                </div>
              </div>

              {!import.meta.env.VITE_WEB3FORMS_ACCESS_KEY && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-xs leading-relaxed text-amber-500/90">
                  <Shield className="h-5 w-5 shrink-0 animate-pulse text-amber-500" />
                  <div>
                    <span className="font-extrabold block text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      Automated Email Notifications Offline
                    </span>
                    To receive contact form submissions directly in your email inbox automatically,
                    request a free access key at{" "}
                    <a
                      href="https://web3forms.com/#start"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-foreground hover:text-primary transition-colors"
                    >
                      web3forms.com
                    </a>{" "}
                    (takes 5 seconds, no signup required) and add it to your environment variables
                    as{" "}
                    <code className="font-mono bg-card px-1 py-0.5 rounded text-amber-400 border border-amber-500/20 font-black">
                      VITE_WEB3FORMS_ACCESS_KEY="..."
                    </code>
                    .
                  </div>
                </div>
              )}

              {contactMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground bg-card/10 rounded-2xl border border-dashed border-border/60 p-8 space-y-2">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/40 border border-border/60 text-muted-foreground mb-2">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-foreground">No feedback messages yet.</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Messages submitted through Contact Us will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contactMessages.map((msg) => {
                    const { dateStr, timeStr } = formatSubmissionDate(msg.created_at);
                    return (
                      <div
                        key={msg.id}
                        onClick={() => setSelectedContactMessage(msg)}
                        className={cn(
                          "group relative glass rounded-2xl p-4 sm:p-5 border border-border/60 hover:border-primary/50 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-[var(--shadow-glow)] bg-card/60 hover:bg-card/85 flex flex-col justify-between gap-3.5 select-none",
                          msg.status === "unread" && "border-blue-500/40 bg-blue-500/[0.04]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-extrabold text-sm sm:text-base text-foreground truncate">
                                {msg.name}
                              </span>
                              {msg.status === "unread" && (
                                <span
                                  className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0"
                                  title="Unread"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono truncate">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                              <span className="truncate">{msg.email}</span>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingMessage(msg);
                            }}
                            className="shrink-0 h-8 px-2.5 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/60 font-semibold gap-1.5 transition-colors"
                            title="Delete message"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2.5 border-t border-border/40 font-medium">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                            <span>{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                            <span>{timeStr}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 10: USER FEEDBACK & REPORTS */}
        {activeSection === "feedback" && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-purple-400" /> Platform Feedback & Sentiment
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Feedback categorized by topic, bug reports, and suggestions from classroom participants.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-3 py-1 text-xs font-black text-purple-400">
                    {contactMessages.length} Submissions
                  </span>
                </div>
              </div>

              {/* Feedback Category Filter Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {(["ALL", "Feedback", "Bug", "Feature", "Inquiry"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFeedbackCategoryFilter(cat)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-bold transition border",
                      feedbackCategoryFilter === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/60 text-muted-foreground border-border hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {contactMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground italic">
                  No feedback received yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contactMessages.map((msg) => {
                    const { dateStr, timeStr } = formatSubmissionDate(msg.created_at);
                    return (
                      <div
                        key={msg.id}
                        onClick={() => setSelectedContactMessage(msg)}
                        className="group relative glass rounded-2xl p-4 sm:p-5 border border-border/60 hover:border-primary/50 transition-all cursor-pointer shadow-sm bg-card/60 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-foreground truncate">{msg.name}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {msg.status || "feedback"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                          {msg.message}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 pt-2 border-t border-border/40">
                          <span>{msg.email}</span>
                          <span>{dateStr} {timeStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 11: SYSTEM SETTINGS & MAINTENANCE */}
        {activeSection === "settings" && (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" /> Institutional System Settings & Maintenance
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Emergency controls, database hygiene routines, platform maintenance, and dataset export tools.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Emergency Server Down Mode */}
                <div className="p-5 rounded-2xl bg-card/60 border border-border/60 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground flex items-center gap-2">
                        <AlertOctagon className="h-4 w-4 text-rose-500" /> Emergency Server Down Mode
                      </span>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider", isServerDown ? "bg-rose-500 text-white" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30")}>
                        {isServerDown ? "ACTIVE (DOWN)" : "ONLINE"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Puts the entire application into maintenance lock and redirects visitors to the emergency developer contact screen.
                    </p>
                  </div>
                  <Button
                    onClick={handleToggleServerDown}
                    variant={isServerDown ? "default" : "destructive"}
                    size="sm"
                    className="w-full text-xs font-bold rounded-xl h-9"
                  >
                    {isServerDown ? "Restore Application Online" : "Trigger Emergency Server Down"}
                  </Button>
                </div>

                {/* Auto-Draft Mode / Cleanup Stale Sessions */}
                <div className="p-5 rounded-2xl bg-card/60 border border-border/60 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground flex items-center gap-2">
                        <Flame className="h-4 w-4 text-amber-500" /> Stale Session Cleanup
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground font-mono">
                        {liveSessionsCount} Live
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Demotes old or abandoned live classroom sessions back into draft mode to preserve platform performance and prevent ghost connections.
                    </p>
                  </div>
                  <Button
                    onClick={handleDemoteAllLiveToDraft}
                    disabled={isDemotingAll || liveSessionsCount === 0}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold rounded-xl h-9 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  >
                    {isDemotingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    Demote All Live Sessions to Draft ({liveSessionsCount})
                  </Button>
                </div>

                {/* Database Hygiene / Purge Test Data */}
                <div className="p-5 rounded-2xl bg-card/60 border border-border/60 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-muted-foreground" /> Database Hygiene & Test Cleanup
                    </span>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Removes orphaned questions with zero responses and cleans empty test classrooms created during development.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRunCleanup}
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs font-bold rounded-xl h-9"
                    >
                      Clean Orphaned Data
                    </Button>
                    <Button
                      onClick={handlePurgeEmptySessions}
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs font-bold rounded-xl h-9 text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                    >
                      Purge Empty Sessions
                    </Button>
                  </div>
                </div>

                {/* Machine Learning Dataset Export */}
                <div className="p-5 rounded-2xl bg-card/60 border border-border/60 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4 text-cyan-400" /> ML Dataset Extraction
                    </span>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Exports anonymized question and response telemetry formatted for training institutional educational models.
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        toast.info("Extracting and anonymizing ML training dataset...");
                        await downloadMLDatasetCSV();
                        toast.success("ML Training Dataset exported successfully (CSV)!");
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        toast.error(`Export failed: ${msg}`);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold rounded-xl h-9 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    Export ML Training Dataset (CSV)
                  </Button>
                </div>
              </div>

              {/* Portal Session Security Lockout */}
              <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-foreground">Lock Administrative Session</div>
                  <div className="text-[11px] text-muted-foreground">Terminates the current administrative session and locks the portal.</div>
                </div>
                <Button
                  onClick={handleLockDeveloper}
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold rounded-xl h-8 text-rose-400 border-rose-500/30 hover:bg-rose-500/10 gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" /> Lock Developer Portal
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Dev Rename Session Dialog */}
        <Dialog open={devRenameOpen} onOpenChange={setDevRenameOpen}>
          <DialogContent className="max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                <Pencil className="h-4 w-4 text-primary" />
                Rename Session (Developer Override)
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveDevRename} className="space-y-4 pt-2">
              <div className="space-y-2 text-left">
                <label className="text-xs font-semibold text-muted-foreground">
                  Session Title
                </label>
                <Input
                  value={devNewTitle}
                  onChange={(e) => setDevNewTitle(e.target.value)}
                  required
                  autoFocus
                  placeholder="Session Title"
                  className="rounded-xl border-border bg-background/50 h-10 text-sm"
                />
                {devRenameSession && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>
                      Code:{" "}
                      <span className="font-mono font-bold text-primary">
                        {devRenameSession.code}
                      </span>
                    </span>
                    <span>
                      ID:{" "}
                      <span className="font-mono text-muted-foreground">
                        {devRenameSession.id.slice(0, 8)}...
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDevRenameOpen(false)}
                  className="rounded-xl text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    devRenaming ||
                    !devNewTitle.trim() ||
                    devNewTitle.trim() === devRenameSession?.title
                  }
                  className="gradient-bg text-white font-semibold rounded-xl text-xs h-8 gap-1.5 shadow-md"
                >
                  {devRenaming ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Key Account / Owner Modal */}
        <Dialog
          open={!!editingKeyModal}
          onOpenChange={(open) => !open && setEditingKeyModal(null)}
        >
          <DialogContent className="max-w-md glass rounded-2xl border border-border/80 shadow-2xl p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                <Pencil className="h-4 w-4 text-primary" />
                {editingKeyModal?.type === "gemini"
                  ? `Google Account / Owner for Gemini Key #${(editingKeyModal?.index ?? 0) + 1}`
                  : `Account / Owner for Groq Key #${(editingKeyModal?.index ?? 0) + 1}`}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Assign a recognizable owner or Google account name to this API key to track usage across developer accounts.
              </p>
            </DialogHeader>

            <form onSubmit={handleSaveKeyOwner} className="space-y-4 pt-2">
              <div className="space-y-2 text-left">
                <label className="text-xs font-semibold text-muted-foreground">
                  Account Name / Holder
                </label>
                <Input
                  value={editingKeyNameInput}
                  onChange={(e) => setEditingKeyNameInput(e.target.value)}
                  autoFocus
                  placeholder={
                    editingKeyModal?.type === "gemini"
                      ? "e.g., Navneeth (navneeth@gmail.com)"
                      : "e.g., Main Groq Workspace"
                  }
                  className="rounded-xl border-border bg-background/50 h-10 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Stored persistently in developer portal local storage.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingKeyModal(null)}
                  className="rounded-xl text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="gradient-bg text-white font-semibold rounded-xl text-xs h-8 gap-1.5 shadow-md"
                >
                  Save Account Name
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Faculty Override Modal */}
        <Dialog
          open={!!editingFacultyModal}
          onOpenChange={(open) => !open && setEditingFacultyModal(null)}
        >
          <DialogContent className="max-w-md glass rounded-2xl border border-border/80 shadow-2xl p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                <Pencil className="h-4 w-4 text-primary" />
                Set Faculty Identity & Contact
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Map this unlinked session creator ID to their real faculty name and college email.
              </p>
            </DialogHeader>

            <form onSubmit={handleSaveFacultyOverride} className="space-y-4 pt-2">
              <div className="space-y-3 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Faculty Full Name
                  </label>
                  <Input
                    value={editingFacultyName}
                    onChange={(e) => setEditingFacultyName(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g. Dr. K. Ramesh"
                    className="rounded-xl border-border bg-background/50 h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Faculty Email
                  </label>
                  <Input
                    type="email"
                    value={editingFacultyEmail}
                    onChange={(e) => setEditingFacultyEmail(e.target.value)}
                    placeholder="e.g. ramesh.k@kct.ac.in"
                    className="rounded-xl border-border bg-background/50 h-10 text-sm"
                  />
                </div>

                {editingFacultyModal && (
                  <div className="text-[11px] text-muted-foreground font-mono bg-card/40 p-2.5 rounded-lg border border-border/60">
                    Creator ID: {editingFacultyModal.creatorId}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingFacultyModal(null)}
                  className="rounded-xl text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!editingFacultyName.trim()}
                  className="gradient-bg text-white font-semibold rounded-xl text-xs h-8 gap-1.5 shadow-md"
                >
                  Save Faculty Mapping
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Faculty Sessions & Download Reports Dialog */}
        <FacultySessionsModal
          isOpen={!!selectedFacultyForReports}
          onClose={() => setSelectedFacultyForReports(null)}
          faculty={selectedFacultyForReports}
        />

        {/* Contact Message Details Dialog */}
        <Dialog
          open={!!selectedContactMessage}
          onOpenChange={(open) => !open && setSelectedContactMessage(null)}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-xl sm:max-w-[620px] glass rounded-2xl sm:rounded-3xl border border-border/80 shadow-2xl p-4 sm:p-6 select-none animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            {selectedContactMessage && (() => {
              const { fullStr } = formatSubmissionDate(selectedContactMessage.created_at);
              return (
                <div className="space-y-4 text-left min-w-0 max-w-full">
                  <DialogHeader>
                    <div className="flex items-start sm:items-center justify-between gap-3 border-b border-border/60 pb-3 pr-7 sm:pr-8 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-foreground truncate">
                            Contact Message
                          </DialogTitle>
                          <p className="text-xs text-muted-foreground truncate">
                            Submitted through Contact Us modal
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border shrink-0",
                          selectedContactMessage.status === "unread"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
                        )}
                      >
                        {selectedContactMessage.status}
                      </span>
                    </div>
                  </DialogHeader>

                  <div className="space-y-3.5 text-xs min-w-0">
                    {/* Identity: Full Name & Email Address */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card/45 border border-border/60 rounded-xl p-3.5 min-w-0">
                      <div className="min-w-0">
                        <span className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" /> Full Name
                        </span>
                        <span className="font-extrabold text-sm text-foreground block break-words [overflow-wrap:anywhere]">
                          {selectedContactMessage.name}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground shrink-0" /> Email Address
                        </span>
                        <a
                          href={`mailto:${selectedContactMessage.email}`}
                          className="font-bold text-xs text-primary hover:underline font-mono break-all [overflow-wrap:anywhere] block"
                        >
                          {selectedContactMessage.email}
                        </a>
                      </div>
                    </div>

                    {/* Submission: Category & Time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card/45 border border-border/60 rounded-xl p-3.5 min-w-0">
                      <div className="min-w-0">
                        <span className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
                          <Tag className="h-3 w-3 text-muted-foreground shrink-0" /> Category / Subject
                        </span>
                        <span className="inline-block rounded-md bg-primary/10 border border-primary/25 px-2.5 py-1 text-xs font-bold text-primary break-words [overflow-wrap:anywhere] max-w-full">
                          {selectedContactMessage.subject}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-muted-foreground shrink-0" /> Submitted Time
                        </span>
                        <span className="font-bold text-foreground block break-words">
                          {fullStr}
                        </span>
                        <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 break-all">
                          DB Timestamp: {selectedContactMessage.created_at}
                        </span>
                      </div>
                    </div>

                    {/* Full Message (No Truncation) */}
                    <div className="space-y-1.5 min-w-0 max-w-full">
                      <span className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" /> Message
                      </span>
                      <div className="bg-card/70 border border-border/70 rounded-xl p-4 font-sans text-xs text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed max-h-[320px] overflow-y-auto overflow-x-hidden selection:bg-primary/20 min-w-0">
                        {selectedContactMessage.message}
                      </div>
                    </div>

                    {/* Technical Metadata */}
                    <div className="bg-muted/30 border border-border/50 rounded-xl p-3 space-y-1.5 font-mono text-[11px] text-muted-foreground min-w-0">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 mb-1">
                        Technical Metadata
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 min-w-0">
                        <span className="shrink-0 text-muted-foreground/90">Message ID:</span>
                        <span className="text-foreground font-semibold select-all break-all min-w-0 sm:text-right">
                          {selectedContactMessage.id}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 min-w-0">
                        <span className="shrink-0 text-muted-foreground/90">User ID:</span>
                        <span className="text-foreground font-semibold select-all break-all min-w-0 sm:text-right">
                          {selectedContactMessage.user_id || "Anonymous / Unauthenticated"}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 min-w-0">
                        <span className="shrink-0 text-muted-foreground/90">Status:</span>
                        <span className="text-foreground font-semibold uppercase shrink-0">
                          {selectedContactMessage.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap justify-between items-center gap-2.5 pt-4 border-t border-border/60 min-w-0">
                    <Button
                      type="button"
                      onClick={() => setDeletingMessage(selectedContactMessage)}
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs border-rose-500/40 text-rose-500 hover:bg-rose-500/10 font-semibold shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedContactMessage.status === "unread" ? (
                        <Button
                          type="button"
                          onClick={() => {
                            handleUpdateMessageStatus(selectedContactMessage.id, "read");
                            setSelectedContactMessage(null);
                          }}
                          size="sm"
                          className="gradient-bg text-xs font-semibold shrink-0"
                        >
                          Mark as Read
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => {
                            handleUpdateMessageStatus(selectedContactMessage.id, "unread");
                            setSelectedContactMessage(null);
                          }}
                          variant="outline"
                          size="sm"
                          className="text-xs border-border font-semibold shrink-0"
                        >
                          Mark as Unread
                        </Button>
                      )}
                      <Button
                        type="button"
                        onClick={() => setSelectedContactMessage(null)}
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground font-semibold shrink-0"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Delete Feedback Message Confirmation Modal */}
        <AlertDialog
          open={!!deletingMessage}
          onOpenChange={(open) => !open && setDeletingMessage(null)}
        >
          <AlertDialogContent className="glass rounded-2xl border border-border/80 shadow-2xl p-6 max-w-md select-none">
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 shrink-0">
                  <Trash2 className="h-5 w-5" />
                </div>
                <AlertDialogTitle className="text-base font-bold text-foreground">
                  Delete this feedback message?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
                This action permanently removes this message from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 flex gap-2 justify-end">
              <AlertDialogCancel
                disabled={isDeletingMessage}
                onClick={() => setDeletingMessage(null)}
                className="text-xs h-9 px-4"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeletingMessage}
                onClick={confirmDeleteMessage}
                className="text-xs h-9 px-4 bg-rose-600 text-white hover:bg-rose-700 font-bold"
              >
                {isDeletingMessage ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </div>

          <footer className="mt-auto border-t border-border/60 bg-card/40 py-6 text-center text-xs text-muted-foreground">
            <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p>© {new Date().getFullYear()} KCT PULSE. Internal Developer Telemetry Portal.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium bg-muted/60 px-3 py-1 rounded-full border border-border text-foreground/70">
                  Designed by <span className="font-extrabold text-foreground">THARUN N E</span>
                </span>
                <span className="text-[11px] font-medium bg-muted/60 px-3 py-1 rounded-full border border-border text-foreground/70">
                  Developed by <span className="font-extrabold text-foreground">NAVNEETH V</span>
                </span>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
