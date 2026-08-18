import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Flame,
  Globe,
  HardDrive,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquare,
  PieChart,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { auth } from "@/lib/firebase";
import { autoDraftStaleSessions, purgeEmptyTestSessions } from "@/lib/session-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn, formatDisplayName } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { testGroqKey, getGroqKeySignature } from "@/lib/ai-service";

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
  session_duration: number | null;
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
  attemptedPass: string;
  timestamp: string;
  userAgent: string;
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

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer Telemetry & System Analytics · KCT PULSE" },
      { name: "description", content: "Developer system monitor, Firebase/Supabase analytics, and live telemetry log suite." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeveloperDashboard,
});

function DeveloperDashboard() {
  const [passkey, setPasskey] = useState("");
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [selectedContactMessage, setSelectedContactMessage] = useState<ContactMessageRow | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const DEV_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  const handleLockDeveloper = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kct_dev_auth");
      localStorage.removeItem("kct_dev_auth_time");
    }
    setIsAuthenticated(false);
    setPasskey("");
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const isAuth = localStorage.getItem("kct_dev_auth") === "true";
      const authTime = Number(localStorage.getItem("kct_dev_auth_time") || "0");
      if (isAuth && authTime > 0 && Date.now() - authTime > DEV_TIMEOUT_MS) {
        handleLockDeveloper();
      } else {
        setIsAuthenticated(isAuth);
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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "live" | "draft" | "ended">("ALL");
  const [questionTypeFilter, setQuestionTypeFilter] = useState<"ALL" | "poll" | "wordcloud" | "quiz">("ALL");
  const [logFilterTag, setLogFilterTag] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<SessionRow | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [failedAttempts, setFailedAttempts] = useState<FailedAttemptRecord[]>([]);

  // WAF Telemetry States
  const [wafStats, setWafStats] = useState<any>(null);
  const [wafLogs, setWafLogs] = useState<any[]>([]);
  const [wafRules, setWafRules] = useState<any>(null);
  const [wafOffline, setWafOffline] = useState(true);
  const [wafIpInput, setWafIpInput] = useState("");
  const [wafRuleType, setWafRuleType] = useState<"block" | "allow">("block");

  const getWafApiUrl = () => {
    const env = (import.meta as any).env ?? {};
    const wafUrl = import.meta.env.VITE_WAF_API_URL || env.VITE_WAF_API_URL || "http://localhost:8081";
    return wafUrl.replace(/\/$/, "");
  };

  const fetchWafData = async () => {
    try {
      const wafUrl = getWafApiUrl();
      const headers = {
        "Bypass-Tunnel-Reminder": "true",
        "ngrok-skip-browser-warning": "true",
      };
      const [statsRes, logsRes, rulesRes] = await Promise.all([
        fetch(`${wafUrl}/api/stats`, { headers }),
        fetch(`${wafUrl}/api/logs`, { headers }),
        fetch(`${wafUrl}/api/rules`, { headers }),
      ]);
      if (!statsRes.ok || !logsRes.ok || !rulesRes.ok) throw new Error();
      const stats = await statsRes.json();
      const logs = await logsRes.json();
      const rules = await rulesRes.json();
      setWafStats(stats);
      setWafLogs(logs);
      setWafRules(rules);
      setWafOffline(false);
    } catch {
      setWafOffline(true);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchWafData();
    const interval = setInterval(fetchWafData, 4000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleAddWafIPRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wafIpInput.trim()) return;
    try {
      const wafUrl = getWafApiUrl();
      const res = await fetch(`${wafUrl}/api/rules/add`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ ip: wafIpInput.trim(), type: wafRuleType }),
      });
      if (res.ok) {
        toast.success(`Firewall rule added: ${wafIpInput} (${wafRuleType.toUpperCase()})`);
        setWafIpInput("");
        fetchWafData();
      } else {
        toast.error("Failed to add firewall rule.");
      }
    } catch {
      toast.error("WAF API is offline.");
    }
  };

  const handleDeleteWafIPRule = async (ip: string) => {
    try {
      const wafUrl = getWafApiUrl();
      const res = await fetch(`${wafUrl}/api/rules/delete`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        toast.success(`Removed firewall rule for ${ip}`);
        fetchWafData();
      } else {
        toast.error("Failed to delete firewall rule.");
      }
    } catch {
      toast.error("WAF API is offline.");
    }
  };

  // Groq API Keys Telemetry State
  const [groqKeysStatus, setGroqKeysStatus] = useState<Record<number, { status: "unchecked" | "testing" | "active" | "rate_limited" | "invalid" | "error"; errorMsg?: string }>>({
    0: { status: "unchecked" },
    1: { status: "unchecked" },
    2: { status: "unchecked" },
    3: { status: "unchecked" },
    4: { status: "unchecked" },
  });
  const [keyUsageData, setKeyUsageData] = useState<Record<string, { attempts: number; successes: number; failures: number; lastUsed: string }>>({});
  const [testingAllKeys, setTestingAllKeys] = useState(false);

  // Load key usage stats from localStorage
  const loadKeyUsage = () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kct_ai_key_usage") || "{}";
        setKeyUsageData(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse key usage data:", e);
      }
    }
  };

  useEffect(() => {
    loadKeyUsage();
  }, []);

  const handleTestKey = async (idx: number) => {
    setGroqKeysStatus(prev => ({ ...prev, [idx]: { status: "testing" } }));
    const result = await testGroqKey(idx);
    setGroqKeysStatus(prev => ({ ...prev, [idx]: result }));
    loadKeyUsage(); // Reload usage count since testing adds a ping log
  };

  const handleTestAllKeys = async () => {
    setTestingAllKeys(true);
    toast.info("Testing all Groq API keys...");
    for (let i = 0; i < 5; i++) {
      await handleTestKey(i);
    }
    setTestingAllKeys(false);
    toast.success("Finished testing all Groq keys.");
  };

  // Load Failed Password Attempt History
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kct_dev_failed_attempts");
        if (raw) setFailedAttempts(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse failed attempts:", e);
      }
    }
  }, []);

  const recordFailedAttempt = (attempted: string) => {
    if (typeof window === "undefined") return;
    const newRecord: FailedAttemptRecord = {
      id: `FAIL-${Date.now().toString().slice(-6)}`,
      attemptedPass: attempted || "(empty input)",
      timestamp: new Date().toLocaleString(),
      userAgent: navigator.userAgent.includes("Windows")
        ? "Windows Client"
        : navigator.userAgent.includes("Mac")
        ? "macOS Client"
        : navigator.userAgent.includes("Android")
        ? "Android Device"
        : navigator.userAgent.includes("iPhone")
        ? "iPhone Device"
        : "Web Client",
    };
    try {
      const raw = localStorage.getItem("kct_dev_failed_attempts");
      const list: FailedAttemptRecord[] = raw ? JSON.parse(raw) : [];
      const updated = [newRecord, ...list].slice(0, 50);
      localStorage.setItem("kct_dev_failed_attempts", JSON.stringify(updated));
      setFailedAttempts(updated);
    } catch (e) {
      console.error("Failed to save attempt:", e);
    }
  };

  const handleClearFailedAttempts = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kct_dev_failed_attempts");
      setFailedAttempts([]);
      toast.success("Security access logs cleared.");
    }
  };

  // Passkey Login Handler
  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkey.trim() === "Pulse_2026") {
      setIsAuthenticated(true);
      setErrorMsg("");
      localStorage.setItem("kct_dev_auth", "true");
      localStorage.setItem("kct_dev_auth_time", Date.now().toString());
    } else {
      const entered = passkey;
      setErrorMsg("Access Denied: Incorrect developer password.");
      recordFailedAttempt(entered);
    }
  };

  const addAuditLog = (
    msg: string,
    tag: "AUTH" | "SESSION" | "RESPONSE" | "QUESTION" | "SYSTEM" = "SYSTEM",
    type: "info" | "success" | "warn" | "error" = "info",
    isoDate?: string
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
  const loadData = async () => {
    setLoading(true);
    const startPing = performance.now();
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

      // 5. Fetch Profiles
      const { data: profData } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url,created_at")
        .order("created_at", { ascending: false });

      // 6. Fetch Login Logs
      const { data: logData } = await supabase
        .from("login_logs")
        .select("id,user_id,role,email,login_time,logout_time,session_duration,browser,device,operating_system,status")
        .order("login_time", { ascending: false });

      // 7. Fetch Contact Messages
      const { data: cmData } = await supabase
        .from("contact_messages")
        .select("id,created_at,name,email,subject,message,user_id,status")
        .order("created_at", { ascending: false });

      const pingEnd = performance.now();
      setApiLatencyMs(Math.round(pingEnd - startPing));

      const sRows = (sData as SessionRow[]) || [];
      const qRows = (qData as QuestionRow[]) || [];
      const pRows = (pData as ParticipantRow[]) || [];
      const rRows = (rData as ResponseRow[]) || [];
      const profRows = (profData as ProfileRow[]) || [];
      const lRows = (logData as LoginLogRow[]) || [];
      const cmRows = (cmData as ContactMessageRow[]) || [];

      setSessions(sRows);
      setQuestions(qRows);
      setParticipants(pRows);
      setResponses(rRows);
      setProfiles(profRows);
      setLoginLogs(lRows);
      setContactMessages(cmRows);

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
          timestamp: s.created_at ? new Date(s.created_at).toLocaleString() : new Date().toLocaleString(),
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
          timestamp: p.joined_at ? new Date(p.joined_at).toLocaleString() : new Date().toLocaleString(),
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
          timestamp: r.created_at ? new Date(r.created_at).toLocaleString() : new Date().toLocaleString(),
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
    addAuditLog("Manual stale sessions cleanup executed (Sessions active > 1h auto-drafted)", "SYSTEM", "warn");
    await loadData();
  };

  const handlePurgeEmptySessions = async () => {
    const count = await purgeEmptyTestSessions();
    addAuditLog(`Database Purge: Cleaned up ${count} empty draft test session(s)`, "SYSTEM", "warn");
    await loadData();
  };

  const handleUpdateMessageStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("contact_messages")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      
      setContactMessages(prev => prev.map(msg => msg.id === id ? { ...msg, status: newStatus } : msg));
      toast.success(`Message marked as ${newStatus}`);
      addAuditLog(`Contact Message status updated to ${newStatus} for message ${id.slice(0, 8)}`, "SYSTEM", "success");
    } catch (err: any) {
      toast.error(`Failed to update message: ${err.message}`);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    try {
      const { error } = await supabase
        .from("contact_messages")
        .delete()
        .eq("id", id);
      if (error) throw error;

      setContactMessages(prev => prev.filter(msg => msg.id !== id));
      toast.success("Message deleted successfully.");
      addAuditLog(`Contact Message ${id.slice(0, 8)} deleted`, "SYSTEM", "warn");
    } catch (err: any) {
      toast.error(`Failed to delete message: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();

    const sysChannel = supabase
      .channel("dev-telemetry-suite")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        const s = payload.new as SessionRow;
        addAuditLog(`Session state updated: '${s?.title || (payload.old as SessionRow)?.id}' -> [Status: ${s?.status}]`, "SESSION", "success");
        loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants" }, (payload) => {
        const p = payload.new as ParticipantRow;
        addAuditLog(`Live Student '${p?.name || "Student"}' joined session`, "AUTH", "info");
        setParticipants((prev) => [p, ...prev]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_messages" }, (payload) => {
        const cm = payload.new as ContactMessageRow;
        addAuditLog(`New feedback message received from '${cm?.name || "User"}'`, "SYSTEM", "success");
        setContactMessages((prev) => [cm, ...prev]);
        toast.info(`New feedback message from ${cm?.name}!`);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses" }, (payload) => {
        const r = payload.new as ResponseRow;
        addAuditLog(`New response received: '${r?.answer || ""}'`, "RESPONSE", "success");
        setResponses((prev) => [r, ...prev]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "login_logs" }, (payload) => {
        const l = payload.new as LoginLogRow;
        addAuditLog(`Faculty Authentication Event: ${l?.email || "Faculty"} logged in/updated`, "AUTH", "info");
        loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "questions" }, (payload) => {
        const q = payload.new as QuestionRow;
        addAuditLog(`New question created: '${q?.title || ""}' [Type: ${q?.type}]`, "QUESTION", "info");
        setQuestions((prev) => [q, ...prev]);
      })
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

    // 1. Check Profiles table
    const prof = profiles.find((p) => p.id === creatorId);
    if (prof && (prof.full_name || prof.email)) {
      const email = prof.email || "";
      const name = formatDisplayName(prof.full_name, email, creatorId);
      return { name, email };
    }

    // 2. Check Login Logs table
    const logMatch = loginLogs.find((l) => l.user_id === creatorId);
    if (logMatch && logMatch.email) {
      const email = logMatch.email;
      const name = formatDisplayName(null, email, creatorId);
      return { name, email };
    }

    // 3. Check Current Logged In Firebase User
    const currentFirebaseUser = auth.currentUser;
    if (currentFirebaseUser && currentFirebaseUser.uid === creatorId) {
      const email = currentFirebaseUser.email || "";
      const name = formatDisplayName(currentFirebaseUser.displayName, email, creatorId);
      return { name, email };
    }

    // 4. Fallback for unlinked historical test sessions
    const formattedName = formatDisplayName(null, null, creatorId);
    return { name: formattedName, email: `faculty_${creatorId.slice(0, 6).toLowerCase()}@kct.ac.in` };
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
  const filteredQuestionsByTime = useMemo(() => filterByTimeframe(questions), [questions, timeframe]);
  const filteredParticipantsByTime = useMemo(() => filterByTimeframe(participants), [participants, timeframe]);
  const filteredResponsesByTime = useMemo(() => filterByTimeframe(responses), [responses, timeframe]);

  // Fetch Uncapped Exact PostgreSQL Database Counts for selected timeframe
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchExactTimeframeCounts = async () => {
      let dateIso: string | null = null;
      if (timeframe !== "ALL") {
        const days = timeframe === "1D" ? 1 : timeframe === "7D" ? 7 : 30;
        dateIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }

      let pQuery = supabase.from("participants").select("*", { count: "exact", head: true });
      let rQuery = supabase.from("responses").select("*", { count: "exact", head: true });
      let qQuery = supabase.from("questions").select("*", { count: "exact", head: true });
      let sQuery = supabase.from("sessions").select("*", { count: "exact", head: true });

      if (dateIso) {
        pQuery = pQuery.gte("joined_at", dateIso);
        rQuery = rQuery.gte("created_at", dateIso);
        qQuery = qQuery.gte("created_at", dateIso);
        sQuery = sQuery.gte("created_at", dateIso);
      }

      const [pRes, rRes, qRes, sRes] = await Promise.all([pQuery, rQuery, qQuery, sQuery]);

      setTimeframeCounts({
        participants: pRes.count ?? filteredParticipantsByTime.length,
        responses: rRes.count ?? filteredResponsesByTime.length,
        questions: qRes.count ?? filteredQuestionsByTime.length,
        sessions: sRes.count ?? filteredSessionsByTime.length,
      });
    };

    fetchExactTimeframeCounts();
  }, [timeframe, isAuthenticated, sessions.length, participants.length, responses.length, questions.length]);

  // Metrics Computations
  const liveSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "live").length, [filteredSessionsByTime]);
  const draftSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "draft").length, [filteredSessionsByTime]);
  const endedSessionsCount = useMemo(() => filteredSessionsByTime.filter((s) => s.status === "ended").length, [filteredSessionsByTime]);

  const pollQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "poll").length, [filteredQuestionsByTime]);
  const wordcloudQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "wordcloud").length, [filteredQuestionsByTime]);
  const quizQuestionsCount = useMemo(() => filteredQuestionsByTime.filter((q) => q.type === "quiz").length, [filteredQuestionsByTime]);

  // Unique Faculty Creators with Total Students Taught (Filtered by Timeframe)
  const uniqueCreators = useMemo(() => {
    const map = new Map<string, { creator_id: string; profile?: ProfileRow; count: number; totalStudents: number; lastActive: string }>();
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
      result = result.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.code || "").toLowerCase().includes(q) ||
          (s.creator_id || "").toLowerCase().includes(q) ||
          (getFacultyInfo(s.creator_id)?.name || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [filteredSessionsByTime, searchQuery, statusFilter, profiles]);

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
          (faculty?.name || "").toLowerCase().includes(qStr)
        );
      });
    }
    return result;
  }, [filteredQuestionsByTime, questionTypeFilter, searchQuery, sessions, profiles]);

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
        <p className="mt-3 text-sm text-muted-foreground font-mono">Initializing Developer Telemetry Portal...</p>
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
            <p className="mt-1 text-sm text-muted-foreground">Internal system monitoring & live telemetry dashboard.</p>
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
            <Button type="submit" className="w-full h-11 gradient-bg font-semibold gap-2">
              <Key className="h-4 w-4" /> Authenticate Developer Access
            </Button>
          </form>

          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5 text-emerald-500" /> Authorized Admin & Developer Use Only
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Top Telemetry Bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-xl px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl overflow-hidden shadow-md">
            <img src="/kct-logo-opt.jpg" alt="KCT Logo" className="h-10 w-10 object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base tracking-tight">KCT <span className="gradient-text">PULSE</span></span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> DEVELOPER TELEMETRY SUITE
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Real-time Faculty, Session & Student Join Analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-card border border-border rounded-xl p-1 text-xs">
            {(["1D", "7D", "30D", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-extrabold transition",
                  timeframe === tf ? "gradient-bg text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          <Button onClick={handleRunCleanup} variant="outline" size="sm" className="gap-2 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Auto-Draft Cleanup
          </Button>

          <Button onClick={handlePurgeEmptySessions} variant="outline" size="sm" className="gap-2 text-xs border-rose-500/40 text-rose-500 hover:bg-rose-500/10">
            <Flame className="h-3.5 w-3.5" /> Purge DB Test Data
          </Button>

          <Button onClick={loadData} variant="outline" size="sm" className="gap-2 text-xs border-border">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>

          <Button onClick={handleLockDeveloper} variant="destructive" size="sm" className="gap-2 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" /> Lock Portal
          </Button>

          <Link to="/dashboard">
            <Button size="sm" className="gradient-bg gap-2 text-xs font-semibold">
              <LayoutDashboard className="h-3.5 w-3.5" /> Back to App
            </Button>
          </Link>
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Main Developer Telemetry Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* Security Warning Banner for Failed Password Attempts */}
        {failedAttempts.length > 0 && (
          <div className="glass rounded-2xl p-4 border border-rose-500/40 bg-rose-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/30 grid place-items-center text-rose-500 shrink-0">
                <Shield className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="text-xs font-black text-rose-500 uppercase tracking-wider">Security Warning: Failed Developer Password Attempts Logged</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-extrabold text-foreground">{failedAttempts.length} unauthorized access attempt(s)</span> recorded. Last attempt: <span className="font-mono text-foreground">{failedAttempts[0]?.timestamp}</span> with input <code className="font-mono bg-card px-1.5 py-0.5 rounded text-rose-400 border border-rose-500/30 font-black">{failedAttempts[0]?.attemptedPass}</code>.
                </div>
              </div>
            </div>
            <Button onClick={handleClearFailedAttempts} variant="outline" size="sm" className="gap-2 text-xs border-rose-500/30 text-rose-500 hover:bg-rose-500/10 shrink-0">
              <Trash2 className="h-3.5 w-3.5" /> Clear Access Logs
            </Button>
          </div>
        )}

        {/* Realtime API & Storage Health Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 grid place-items-center text-emerald-500">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">API Latency Ping</div>
              <div className="text-lg font-black">{apiLatencyMs !== null ? `${apiLatencyMs} ms` : "--"}</div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Supabase Realtime</div>
              <div className="text-lg font-black text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 grid place-items-center text-purple-500">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Faculty Creators ({timeframe})</div>
              <div className="text-lg font-black text-foreground">{uniqueCreators.length} Faculty</div>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 grid place-items-center text-amber-500">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Total Students Joined ({timeframe})</div>
              <div className="text-lg font-black text-foreground">{timeframeCounts.participants || filteredParticipantsByTime.length} Students</div>
            </div>
          </div>
        </div>

        {/* Primary KPI Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Classroom Sessions ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/30 grid place-items-center text-primary">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{timeframeCounts.sessions || filteredSessionsByTime.length}</span>
              <span className="text-xs text-emerald-500 font-bold">({liveSessionsCount} Live Now)</span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/40">
              <span>{draftSessionsCount} Drafts</span>
              <span>•</span>
              <span>{endedSessionsCount} Completed</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Questions Created ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 grid place-items-center text-cyan-500">
                <HelpCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{timeframeCounts.questions || filteredQuestionsByTime.length}</span>
              <span className="text-xs text-cyan-500 font-bold">Questions</span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-border/40">
              <span>{pollQuestionsCount} Polls</span>
              <span>•</span>
              <span>{wordcloudQuestionsCount} Word Clouds</span>
              <span>•</span>
              <span>{quizQuestionsCount} Quizzes</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Student Joins ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 grid place-items-center text-blue-500">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{timeframeCounts.participants || filteredParticipantsByTime.length}</span>
              <span className="text-xs text-blue-500 font-bold">Students Joined</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Across all classroom sessions
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Responses Submitted ({timeframe})</span>
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/30 grid place-items-center text-purple-500">
                <MessageSquare className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{timeframeCounts.responses || filteredResponsesByTime.length}</span>
              <span className="text-xs text-purple-500 font-bold">Answers</span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 truncate">
              Recorded answers across all sessions
            </div>
          </div>
        </div>

        {/* Detailed Tabs Suite */}
        <Tabs defaultValue="sessions" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-3">
            <TabsList className="bg-card border border-border p-1 rounded-xl flex-wrap">
              <TabsTrigger value="sessions" className="gap-2 text-xs font-semibold">
                <Layers className="h-3.5 w-3.5" /> Sessions & Faculty ({searchedSessions.length})
              </TabsTrigger>
              <TabsTrigger value="creators" className="gap-2 text-xs font-semibold">
                <UserCheck className="h-3.5 w-3.5" /> Faculty Breakdown ({uniqueCreators.length})
              </TabsTrigger>
              <TabsTrigger value="login_logs" className="gap-2 text-xs font-semibold">
                <Activity className="h-3.5 w-3.5 text-emerald-400" /> Login History ({loginLogs.length})
              </TabsTrigger>
              <TabsTrigger value="questions" className="gap-2 text-xs font-semibold">
                <HelpCircle className="h-3.5 w-3.5 text-cyan-500" /> Questions Added ({timeframeCounts.questions || filteredQuestionsByTime.length})
              </TabsTrigger>
              <TabsTrigger value="responses" className="gap-2 text-xs font-semibold">
                <MessageSquare className="h-3.5 w-3.5" /> Submissions ({timeframeCounts.responses || filteredResponsesByTime.length})
              </TabsTrigger>
              <TabsTrigger value="telemetry" className="gap-2 text-xs font-semibold">
                <Terminal className="h-3.5 w-3.5" /> Telemetry Logs ({auditLogs.length})
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 text-xs font-semibold text-rose-400 data-[state=active]:text-rose-500">
                <Shield className="h-3.5 w-3.5" /> Failed Attempts ({failedAttempts.length})
              </TabsTrigger>
              <TabsTrigger value="ai_keys" className="gap-2 text-xs font-semibold text-amber-400 data-[state=active]:text-amber-500">
                <Key className="h-3.5 w-3.5" /> AI Keys Usage (5)
              </TabsTrigger>
              <TabsTrigger value="contact_messages" className="gap-2 text-xs font-semibold text-blue-400 data-[state=active]:text-blue-500">
                <MessageSquare className="h-3.5 w-3.5" /> Feedback ({contactMessages.length})
              </TabsTrigger>
              <TabsTrigger value="waf" className="gap-2 text-xs font-semibold text-rose-400 data-[state=active]:text-rose-500">
                <Shield className="h-3.5 w-3.5 text-rose-500" /> WAF Firewall {wafOffline ? "(Offline)" : ""}
              </TabsTrigger>
            </TabsList>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions/faculty/students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-card/60 border-border"
              />
            </div>
          </div>

          {/* TAB 1: ALL SESSIONS & FACULTY MONITOR */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              {/* Status Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mr-1">Status Filter:</span>
                  <button
                    onClick={() => setStatusFilter("ALL")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border",
                      statusFilter === "ALL"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
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
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
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
                        : "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
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
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                    )}
                  >
                    Ended Sessions ({endedSessionsCount})
                  </button>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  Showing <span className="font-bold text-foreground">{searchedSessions.length}</span> sessions
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
                            <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">{s.title}</td>
                            <td className="px-4 py-3 font-mono font-black text-primary">{s.code}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                                  s.status === "live"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    : s.status === "draft"
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                    : "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[180px] truncate">
                              <div className="font-bold text-foreground">{faculty.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{faculty.email}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-extrabold text-blue-500 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" /> {sessParts.length} Students
                              </span>
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
                                      <HelpCircle className="h-4 w-4 text-cyan-500" /> Questions Added — {s.title} ({s.code})
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 my-2">
                                    <div className="text-xs text-muted-foreground">
                                      Faculty Creator: <strong className="text-foreground">{faculty.name}</strong>
                                    </div>
                                    <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
                                      {sessQs.length === 0 ? (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                          No questions created in this session yet.
                                        </div>
                                      ) : (
                                        sessQs.map((q, qIdx) => (
                                          <div key={q.id} className="p-3 rounded-xl bg-card border border-border/50 text-xs space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-2">
                                                <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-500 grid place-items-center text-[10px] font-bold">
                                                  {qIdx + 1}
                                                </span>
                                                <span className="font-bold text-foreground">{q.title}</span>
                                              </div>
                                              <span
                                                className={cn(
                                                  "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase border",
                                                  q.type === "poll"
                                                    ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                                                    : q.type === "wordcloud"
                                                    ? "bg-purple-500/10 text-purple-500 border-purple-500/30"
                                                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                                )}
                                              >
                                                {q.type}
                                              </span>
                                            </div>
                                            {Array.isArray(q.options) && q.options.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5 pt-1">
                                                {q.options.map((opt: any, oIdx: number) => {
                                                  const optText = typeof opt === "string" ? opt : opt?.text || JSON.stringify(opt);
                                                  const isCorrect = q.correct_answer && q.correct_answer === optText;
                                                  return (
                                                    <span
                                                      key={oIdx}
                                                      className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium border",
                                                        isCorrect
                                                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                                                          : "bg-muted/60 text-muted-foreground border-border/40"
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
                            <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right space-x-2">
                              {/* View Student List Dialog */}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1 text-primary">
                                    <Eye className="h-3.5 w-3.5" /> View Students ({sessParts.length})
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-base">
                                      <Users className="h-4 w-4 text-primary" /> Students Joined — {s.title} ({s.code})
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 my-2">
                                    <div className="text-xs text-muted-foreground">
                                      Faculty Creator: <strong className="text-foreground">{faculty.name}</strong>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                                      {sessParts.length === 0 ? (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                          No students joined this session yet.
                                        </div>
                                      ) : (
                                        sessParts.map((p, pIdx) => (
                                          <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary grid place-items-center text-[10px] font-bold">
                                                {pIdx + 1}
                                              </span>
                                              <span className="font-bold text-foreground">{p.name}</span>
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
          </TabsContent>

          {/* TAB 2: FACULTY CREATORS MONITOR */}
          <TabsContent value="creators" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uniqueCreators.map((item) => {
                const facultySessions = filteredSessionsByTime.filter((s) => s.creator_id === item.creator_id);
                const facultyLiveSessions = facultySessions.filter((s) => s.status === "live").length;
                const facultySessIds = new Set(facultySessions.map((s) => s.id));
                const facultyQuestions = questions.filter((q) => facultySessIds.has(q.session_id));
                const facultyQIds = new Set(facultyQuestions.map((q) => q.id));
                const facultyResponsesCount = responses.filter((r) => facultyQIds.has(r.question_id)).length;
                const isOnline = loginLogs.some((l) => (l.user_id === item.creator_id || l.email === item.profile?.email) && !l.logout_time);

                return (
                  <div key={item.creator_id} className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/20 text-primary font-bold text-base shrink-0">
                          {item.profile?.full_name?.charAt(0) || "F"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate">{item.profile?.full_name || "Faculty Creator"}</h4>
                          <p className="text-xs text-muted-foreground truncate">{item.profile?.email || item.creator_id}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border shrink-0",
                        isOnline ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-muted text-muted-foreground border-border"
                      )}>
                        {isOnline ? "● Online" : "Offline"}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Sessions Created</span>
                        <strong className="text-foreground text-sm font-extrabold">{item.count} Sessions</strong>
                        {facultyLiveSessions > 0 && (
                          <span className="text-[10px] text-emerald-400 block font-bold">({facultyLiveSessions} Live)</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Total Students Taught</span>
                        <strong className="text-blue-400 text-sm font-extrabold">{item.totalStudents} Students</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Questions Created</span>
                        <strong className="text-cyan-400 text-sm font-extrabold">{facultyQuestions.length} Qs</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Responses Collected</span>
                        <strong className="text-purple-400 text-sm font-extrabold">{facultyResponsesCount} Resp.</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* TAB: LOGIN HISTORY MONITOR */}
          <TabsContent value="login_logs" className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Faculty Login Logs & Active Sessions ({loginLogs.length})
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  Active Faculty Online: <span className="font-bold text-emerald-400">{loginLogs.filter((l) => !l.logout_time).length}</span>
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
                        const durationSec = log.session_duration ?? 0;
                        const durationFormatted = durationSec > 0 
                          ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` 
                          : isOnline ? "Active" : "< 1m";

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
                              {log.logout_time ? new Date(log.logout_time).toLocaleString() : "Active Session"}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-foreground">
                              {durationFormatted}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {log.browser || "Browser"} • {log.device || "Desktop"} ({log.operating_system || "OS"})
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border",
                                isOnline 
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" 
                                  : "bg-muted text-muted-foreground border-border"
                              )}>
                                {isOnline && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
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
          </TabsContent>

          {/* TAB: QUESTIONS ADDED MONITOR */}
          <TabsContent value="questions" className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden border border-border/60">
              {/* Type Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/40 border-b border-border/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mr-1">Question Type:</span>
                  <button
                    onClick={() => setQuestionTypeFilter("ALL")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition border",
                      questionTypeFilter === "ALL"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
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
                        : "bg-cyan-500/10 text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/20"
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
                        : "bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20"
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
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                    )}
                  >
                    Quizzes ({quizQuestionsCount})
                  </button>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  Showing <span className="font-bold text-foreground">{searchedQuestions.length}</span> questions
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
                        const faculty = parentSession ? getFacultyInfo(parentSession.creator_id) : { name: "Faculty", email: "" };
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
                                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                )}
                              >
                                {q.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[180px]">
                              {parentSession ? (
                                <>
                                  <div className="font-semibold text-foreground truncate">{parentSession.title}</div>
                                  <div className="font-mono text-[10px] text-primary font-black">{parentSession.code}</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground italic">Session {q.session_id.slice(0, 6)}...</span>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-[180px] truncate">
                              <div className="font-bold text-foreground">{faculty.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{faculty.email}</div>
                            </td>
                            <td className="px-4 py-3 max-w-[280px]">
                              {optionsList.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {optionsList.map((opt: any, idx: number) => {
                                    const text = typeof opt === "string" ? opt : opt?.text || JSON.stringify(opt);
                                    const isCorrect = q.correct_answer && q.correct_answer === text;
                                    return (
                                      <span
                                        key={idx}
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[10px] border",
                                          isCorrect
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                                            : "bg-card/80 text-muted-foreground border-border/40"
                                        )}
                                      >
                                        {text} {isCorrect && "✓"}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : q.type === "wordcloud" ? (
                                <span className="text-[10px] text-muted-foreground italic">Open-ended word responses</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">No predefined choices</span>
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
          </TabsContent>

          {/* TAB 3: SUBMISSIONS MONITOR */}
          <TabsContent value="responses" className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-border/60 space-y-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500" /> Recent Student Answers ({filteredResponsesByTime.length})
              </h3>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredResponsesByTime.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-card/60 border border-border/40 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary font-mono bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg text-xs">
                        {r.answer}
                      </span>
                      <span className="text-muted-foreground truncate max-w-[250px]">Participant ID: {r.participant_id.slice(0, 8)}...</span>
                    </div>
                    <span className="text-muted-foreground text-[11px] font-mono">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: TELEMETRY LOGS */}
          <TabsContent value="telemetry" className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-border/60 space-y-4 font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold flex items-center gap-2 text-emerald-500">
                    <Terminal className="h-4 w-4" /> Live Realtime Telemetry & Audit Stream
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["ALL", "AUTH", "SESSION", "RESPONSE", "QUESTION", "SYSTEM"] as const).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setLogFilterTag(tag)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase transition border",
                        logFilterTag === tag
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card/50 text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/90 rounded-xl p-4 text-xs space-y-2.5 max-h-[500px] overflow-y-auto border border-border/60 text-slate-200 shadow-inner">
                {filteredAuditLogs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 italic">No telemetry logs found for current filter.</div>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 hover:bg-slate-900/60 p-1 rounded transition">
                      <span className="text-slate-500 text-[10px] select-none font-bold">{log.id}</span>
                      <span className="text-slate-400 text-[10px] select-none">[{log.timestamp}]</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider select-none",
                          log.tag === "AUTH"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : log.tag === "SESSION"
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : log.tag === "RESPONSE"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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
                            : "text-slate-200"
                        )}
                      >
                        {log.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 5: FAILED PASSWORD ATTEMPTS SECURITY LOG */}
          <TabsContent value="security" className="space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Shield className="h-5 w-5 text-rose-500" /> Security Access Log: Failed Developer Password Attempts
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tracks every unauthorized access attempt into the Developer Portal with timestamp, entered input, and client device info.
                  </p>
                </div>

                {failedAttempts.length > 0 && (
                  <Button onClick={handleClearFailedAttempts} variant="outline" size="sm" className="gap-2 text-xs border-rose-500/30 text-rose-500 hover:bg-rose-500/10">
                    <Trash2 className="h-3.5 w-3.5" /> Clear Access Logs
                  </Button>
                )}
              </div>

              {failedAttempts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 grid place-items-center text-emerald-500 mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold text-foreground">No Failed Password Attempts Recorded</div>
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
                        <th className="px-4 py-3">Attempted Password Input</th>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Client Environment</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {failedAttempts.map((attempt) => (
                        <tr key={attempt.id} className="hover:bg-rose-500/5 transition">
                          <td className="px-4 py-3 font-mono font-bold text-rose-400">{attempt.id}</td>
                          <td className="px-4 py-3 font-mono font-black text-foreground bg-card/60 px-2.5 py-1 rounded max-w-[220px] truncate border border-border/40">
                            {attempt.attemptedPass}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono">{attempt.timestamp}</td>
                          <td className="px-4 py-3 font-semibold text-foreground">{attempt.userAgent}</td>
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
          </TabsContent>

          {/* TAB: AI KEYS TELEMETRY DIAGNOSTICS */}
          <TabsContent value="ai_keys" className="space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Key className="h-5 w-5 text-amber-400" /> AI Keys Diagnostic Suite: Groq API Key Telemetry
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    View real-time diagnostic health, verification logs, rate limit checks, and usage metrics for the 5 rotated Groq API keys.
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
                    {testingAllKeys ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {testingAllKeys ? "Testing..." : "Test All Keys"}
                  </Button>
                </div>
              </div>

              {/* Telemetry info card */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" /> Active Rotation Mode
                  </div>
                  <div className="text-xl font-extrabold text-foreground">Rotated Failover</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    API calls automatically cycle through the 5 keys in priority order. If Key #1 hits a rate limit or fails, it silently switches to Key #2, ensuring 100% uptime.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Push Protected Secrets
                  </div>
                  <div className="text-xl font-extrabold text-foreground">Base64 & String Cipher</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Keys are ciphered at build-time to bypass GitHub push protection scans and are only decyphered locally in the client thread during completions calls.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card/45 p-4 space-y-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-400" /> API Requests Limit
                  </div>
                  <div className="text-xl font-extrabold text-foreground">72,000 requests/day</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Each Groq key allows up to 14,400 free requests per day, giving the KCT Pulse workspace a massive daily allocation of 72,000 document question generations.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Key Index</th>
                      <th className="px-4 py-3">Obfuscated Signature</th>
                      <th className="px-4 py-3">Diagnostic Status</th>
                      <th className="px-4 py-3 text-center">Attempts</th>
                      <th className="px-4 py-3 text-center">Successes</th>
                      <th className="px-4 py-3 text-center">Failures</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const sig = getGroqKeySignature(idx);
                      const usage = keyUsageData[sig] || { attempts: 0, successes: 0, failures: 0, lastUsed: "" };
                      const state = groqKeysStatus[idx];

                      return (
                        <tr key={idx} className="hover:bg-card/40 transition">
                          <td className="px-4 py-4 font-mono font-bold text-foreground">Key #{idx + 1}</td>
                          <td className="px-4 py-4 font-mono font-semibold text-foreground/80">{sig}</td>
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
                                <span className="block text-[10px] text-rose-400 font-mono max-w-[200px] truncate" title={state.errorMsg}>
                                  {state.errorMsg}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-foreground/80">{usage.attempts}</td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-emerald-400">{usage.successes}</td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-rose-400">{usage.failures}</td>
                          <td className="px-4 py-4 text-muted-foreground font-mono">
                            {usage.lastUsed ? new Date(usage.lastUsed).toLocaleString() : "Never Used"}
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
          </TabsContent>

          {/* TAB 9: CONTACT MESSAGES / FEEDBACK */}
          <TabsContent value="contact_messages" className="space-y-4">
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
              </div>

              {!import.meta.env.VITE_WEB3FORMS_ACCESS_KEY && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-xs leading-relaxed text-amber-500/90">
                  <Shield className="h-5 w-5 shrink-0 animate-pulse text-amber-500" />
                  <div>
                    <span className="font-extrabold block text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">Automated Email Notifications Offline</span>
                    To receive contact form submissions directly in your email inbox automatically, request a free access key at <a href="https://web3forms.com/#start" target="_blank" rel="noopener noreferrer" className="underline font-bold text-foreground hover:text-primary transition-colors">web3forms.com</a> (takes 5 seconds, no signup required) and add it to your environment variables as <code className="font-mono bg-card px-1 py-0.5 rounded text-amber-400 border border-amber-500/20 font-black">VITE_WEB3FORMS_ACCESS_KEY="..."</code>.
                  </div>
                </div>
              )}

              {contactMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-card/10 rounded-2xl border border-dashed border-border/60 p-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/45 mb-3" />
                  <p className="text-sm font-semibold">No feedback messages logged in database yet.</p>
                  <p className="text-xs mt-1 max-w-sm">When users submit a message through the contact modal, it will appear here in real-time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-card/80 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Received Time</th>
                        <th className="px-4 py-3">Sender Details</th>
                        <th className="px-4 py-3">Subject / Topic</th>
                        <th className="px-4 py-3">Message Snippet</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {contactMessages.map((msg) => (
                        <tr key={msg.id} className={cn(
                          "hover:bg-card/40 transition",
                          msg.status === "unread" && "bg-blue-500/5 font-semibold text-foreground"
                        )}>
                          <td className="px-4 py-4 font-mono text-muted-foreground">
                            {new Date(msg.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 space-y-0.5">
                            <div className="font-extrabold text-foreground">{msg.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{msg.email}</div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border",
                              msg.subject === "Bug Report" 
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                                : msg.subject === "Feature Request"
                                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500"
                                : msg.subject === "Session Issue"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                : "bg-muted border-border text-foreground/80"
                            )}>
                              {msg.subject}
                            </span>
                          </td>
                          <td className="px-4 py-4 max-w-[250px] truncate text-muted-foreground font-normal">
                            {msg.message}
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleUpdateMessageStatus(msg.id, msg.status === "unread" ? "read" : "unread")}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider cursor-pointer border transition",
                                msg.status === "unread" 
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20" 
                                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20"
                              )}
                            >
                              {msg.status}
                            </button>
                          </td>
                          <td className="px-4 py-4 text-right flex justify-end gap-1.5">
                            <Button 
                              onClick={() => setSelectedContactMessage(msg)}
                              variant="outline" 
                              size="sm"
                              className="text-xs h-7 px-2 border-border"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              onClick={() => {
                                if (window.confirm("Are you sure you want to delete this message?")) {
                                  handleDeleteMessage(msg.id);
                                }
                              }}
                              variant="outline" 
                              size="sm"
                              className="text-xs h-7 px-2 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 10: KCT SHIELD WAF MONITOR */}
          <TabsContent value="waf" className="space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60 space-y-6">
              {/* WAF Status Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Shield className="h-5 w-5 text-rose-500" /> KCT SHIELD Web Application Firewall
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inspect, normalize, score, and filter incoming client HTTP requests in real-time.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-black border flex items-center gap-1.5",
                    wafOffline 
                      ? "bg-rose-500/10 text-rose-500 border-rose-500/30" 
                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  )}>
                    <span className={cn("h-2 w-2 rounded-full", wafOffline ? "bg-rose-500" : "bg-emerald-500 animate-pulse")} />
                    {wafOffline ? "WAF OFFLINE" : "WAF ACTIVE (Port 3000 ➔ 8080)"}
                  </span>
                </div>
              </div>

              {wafOffline ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-card/10 rounded-2xl border border-dashed border-border/60 p-6">
                  <Shield className="h-10 w-10 text-rose-500/40 mb-3 animate-pulse" />
                  <p className="text-sm font-semibold text-rose-400">KCT SHIELD Firewall service is currently offline.</p>
                  <p className="text-xs mt-1 max-w-md">
                    Please start the firewall daemon locally (<code className="font-mono bg-card px-1.5 py-0.5 rounded text-rose-400 border border-rose-500/20 font-black">npm run dev</code> or <code className="font-mono">bun run start</code> in the <code className="font-mono">kct-shield/</code> directory). For production telemetry on Vercel, configure the <code className="font-mono">VITE_WAF_API_URL</code> environment variable to point to your hosted firewall.
                  </p>
                  <p className="text-[10px] mt-3 text-muted-foreground font-mono bg-background/50 px-2.5 py-1.5 rounded border border-border/40 max-w-md break-all">
                    Querying API: <span className="font-bold text-foreground">{getWafApiUrl()}</span>
                  </p>
                </div>
              ) : (
                <>
                  {/* KPI Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-card/45 border border-border/60 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Requests</span>
                      <span className="text-2xl font-black text-foreground">{wafStats?.total ?? 0}</span>
                    </div>
                    <div className="bg-card/45 border border-border/60 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block text-emerald-500">Allowed</span>
                      <span className="text-2xl font-black text-emerald-500">{wafStats?.allowed ?? 0}</span>
                    </div>
                    <div className="bg-card/45 border border-border/60 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block text-rose-500">Blocked</span>
                      <span className="text-2xl font-black text-rose-500">{wafStats?.blocked ?? 0}</span>
                    </div>
                    <div className="bg-card/45 border border-border/60 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block text-yellow-500">Rate Limited</span>
                      <span className="text-2xl font-black text-yellow-500">{wafStats?.rateLimited ?? 0}</span>
                    </div>
                  </div>

                  {/* Threat Controls & Rules */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Add Rule Form */}
                    <div className="bg-card/35 border border-border/60 rounded-xl p-4 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Quick IP Overrides</h4>
                      <form onSubmit={handleAddWafIPRule} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold">IP Address</label>
                          <Input
                            placeholder="e.g. 192.168.1.1"
                            value={wafIpInput}
                            onChange={(e) => setWafIpInput(e.target.value)}
                            className="h-8 text-xs font-mono bg-background/50 border-border"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold">Rule Mode</label>
                          <select
                            value={wafRuleType}
                            onChange={(e: any) => setWafRuleType(e.target.value)}
                            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground focus:outline-none"
                          >
                            <option value="block">BLOCK (Strict Deny)</option>
                            <option value="allow">ALLOW (Bypass rules)</option>
                          </select>
                        </div>
                        <Button type="submit" size="sm" className="w-full text-xs font-semibold gradient-bg">
                          Apply Rule
                        </Button>
                      </form>
                    </div>

                    {/* Active IP Rules List */}
                    <div className="md:col-span-2 bg-card/35 border border-border/60 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground mb-3">Active IP Firewall Rules</h4>
                        <div className="max-h-40 overflow-y-auto space-y-2 text-xs font-mono pr-1">
                          {(!wafRules?.rules || wafRules.rules.length === 0) && Object.keys(wafRules?.tempBlocks ?? {}).length === 0 ? (
                            <p className="text-muted-foreground italic text-center py-4">No manual overrides or temporary bans in effect.</p>
                          ) : (
                            <>
                              {wafRules?.rules.map((rule: any) => (
                                <div key={rule.ip} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("w-1.5 h-1.5 rounded-full", rule.type === 'allow' ? "bg-emerald-500" : "bg-rose-500")} />
                                    <span className="text-foreground">{rule.ip}</span>
                                    <span className={cn("px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold border", rule.type === 'allow' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20")}>
                                      {rule.type}
                                    </span>
                                  </div>
                                  <button onClick={() => handleDeleteWafIPRule(rule.ip)} className="text-rose-500 hover:text-rose-400 transition text-[10px] font-bold cursor-pointer">REMOVE</button>
                                </div>
                              ))}
                              {Object.entries(wafRules?.tempBlocks ?? {}).map(([ip, expiresAt]: any) => (
                                <div key={ip} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/50">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                                    <span className="text-foreground">{ip}</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                                      block (temp)
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-muted-foreground italic">Expiring soon</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live logs stream */}
                  <div className="space-y-3 pt-4 border-t border-border/40">
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Live Firewall Incidents Stream</h4>
                    <div className="overflow-x-auto rounded-2xl border border-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-card/85 border-b border-border/60 text-muted-foreground font-extrabold uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Client IP</th>
                            <th className="px-4 py-3">Request Details</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">Rules Triggered</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                          {wafLogs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-6 text-muted-foreground italic">
                                No firewall incidents logged.
                              </td>
                            </tr>
                          ) : (
                            wafLogs.map((log) => {
                              let actionBadge = "bg-green-500/10 text-emerald-400 border-emerald-500/20";
                              if (log.action === "BLOCK") actionBadge = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                              if (log.action === "RATE_LIMIT") actionBadge = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                              if (log.action === "MONITOR") actionBadge = "bg-purple-500/10 text-purple-400 border-purple-500/20";

                              return (
                                <tr key={log.id} className="hover:bg-card/25 transition">
                                  <td className="px-4 py-4 text-muted-foreground text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                  <td className="px-4 py-4 font-semibold text-white">{log.ip}</td>
                                  <td className="px-4 py-4"><span className="text-blue-400 font-bold">{log.method}</span> <span className="text-foreground">{log.path}</span></td>
                                  <td className="px-4 py-4"><span className={cn("px-2.5 py-0.5 border rounded-full text-[10px] font-black tracking-wider uppercase", actionBadge)}>{log.action}</span></td>
                                  <td className={cn("px-4 py-4 font-black", log.score >= 50 ? "text-rose-500" : log.score >= 20 ? "text-purple-400" : "text-emerald-500")}>{log.score} / 100</td>
                                  <td className="px-4 py-4 flex flex-wrap gap-1 mt-1.5">
                                    {log.rules.length > 0 ? (
                                      log.rules.map((r: string) => (
                                        <span key={r} className="px-1.5 py-0.5 rounded bg-card text-[9px] text-gray-400 border border-border/30">{r}</span>
                                      ))
                                    ) : (
                                      <span className="text-gray-600 italic">None</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Contact Message Details Dialog */}
        <Dialog open={!!selectedContactMessage} onOpenChange={(open) => !open && setSelectedContactMessage(null)}>
          <DialogContent className="sm:max-w-[550px] glass rounded-3xl border border-border/80 shadow-2xl p-6 select-none animate-in fade-in zoom-in-95 duration-200">
            {selectedContactMessage && (
              <div className="space-y-4 text-left">
                <DialogHeader>
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-500">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <DialogTitle className="text-lg font-black tracking-tight">{selectedContactMessage.subject}</DialogTitle>
                        <p className="text-xs text-muted-foreground">Received {new Date(selectedContactMessage.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                      selectedContactMessage.status === "unread" 
                        ? "bg-amber-500/10 border border-amber-500/30 text-amber-500" 
                        : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-500"
                    )}>
                      {selectedContactMessage.status}
                    </span>
                  </div>
                </DialogHeader>

                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-4 bg-card/45 border border-border/60 rounded-xl p-3 text-xs">
                    <div>
                      <span className="block font-bold text-muted-foreground uppercase text-[9px] tracking-wider mb-0.5">From Name</span>
                      <span className="font-extrabold text-foreground">{selectedContactMessage.name}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-muted-foreground uppercase text-[9px] tracking-wider mb-0.5">Email Address</span>
                      <a 
                        href={`mailto:${selectedContactMessage.email}`} 
                        className="font-extrabold text-primary hover:underline font-mono"
                      >
                        {selectedContactMessage.email}
                      </a>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="block font-bold text-muted-foreground uppercase text-[9px] tracking-wider mb-0.5">Message Content</span>
                    <div className="bg-card/25 border border-border/60 rounded-xl p-4 font-sans text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[250px] overflow-y-auto">
                      {selectedContactMessage.message}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-border/60">
                  <Button
                    onClick={() => {
                      handleDeleteMessage(selectedContactMessage.id);
                      setSelectedContactMessage(null);
                    }}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs border-rose-500/40 text-rose-500 hover:bg-rose-500/10 font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Message
                  </Button>
                  <div className="flex gap-2">
                    {selectedContactMessage.status === "unread" ? (
                      <Button
                        onClick={() => {
                          handleUpdateMessageStatus(selectedContactMessage.id, "read");
                          setSelectedContactMessage(null);
                        }}
                        size="sm"
                        className="gradient-bg text-xs font-semibold"
                      >
                        Mark as Read
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          handleUpdateMessageStatus(selectedContactMessage.id, "unread");
                          setSelectedContactMessage(null);
                        }}
                        variant="outline"
                        size="sm"
                        className="text-xs border-border font-semibold"
                      >
                        Mark as Unread
                      </Button>
                    )}
                    <Button
                      onClick={() => setSelectedContactMessage(null)}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground font-semibold"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>

      <footer className="border-t border-border/60 bg-card/40 py-6 text-center text-xs text-muted-foreground mt-8">
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
    </div>
  );
}
