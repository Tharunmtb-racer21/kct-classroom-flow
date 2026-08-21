import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  Flame,
  Globe,
  HardDrive,
  Key,
  LayoutDashboard,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developer-waf")({
  head: () => ({
    meta: [
      { title: "KCT SHIELD Firewall Telemetry Monitor · KCT PULSE" },
      {
        name: "description",
        content:
          "Real-time Web Application Firewall (WAF) logs, threat analysis, and IP rule engine.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WafMonitorDashboard,
});

function WafMonitorDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passkey, setPasskey] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [mounted, setMounted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [wafStats, setWafStats] = useState<any>(null);
  const [wafLogs, setWafLogs] = useState<any[]>([]);
  const [wafRules, setWafRules] = useState<any>(null);
  const [wafOffline, setWafOffline] = useState(true);
  const [wafIpInput, setWafIpInput] = useState("");
  const [wafRuleType, setWafRuleType] = useState<"block" | "allow">("block");
  const [searchTerm, setSearchTerm] = useState("");
  const [connectedWafUrl, setConnectedWafUrl] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [edgeWafActive, setEdgeWafActive] = useState(false);

  const DEV_TIMEOUT_MS = 30 * 60 * 1000;

  const handleLockWaf = () => {
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
        handleLockWaf();
      } else {
        setIsAuthenticated(isAuth);
      }
      // Detect production (Vercel) vs local dev
      const hostname = window.location.hostname;
      const isProd =
        hostname.includes("vercel.app") || hostname === "kct-classroom-flow.vercel.app";
      setIsProduction(isProd);
      if (isProd) {
        setEdgeWafActive(true);
        setWafOffline(false);
      }
    }
  }, []);

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkey.trim() === "Pulse_2026") {
      setIsAuthenticated(true);
      setErrorMsg("");
      localStorage.setItem("kct_dev_auth", "true");
      localStorage.setItem("kct_dev_auth_time", Date.now().toString());
    } else {
      setErrorMsg("Access Denied: Incorrect developer password.");
    }
  };

  const getWafApiUrl = () => {
    const env = (import.meta as any).env ?? {};
    const wafUrl =
      import.meta.env.VITE_WAF_API_URL || env.VITE_WAF_API_URL || "http://localhost:8081";
    return wafUrl.replace(/\/$/, "");
  };

  const fetchWafData = async () => {
    setLoading(true);
    const urlsToTry = [getWafApiUrl(), "http://localhost:8081", "http://127.0.0.1:8081"];

    let success = false;
    for (const url of urlsToTry) {
      if (!url) continue;
      try {
        const headers = {
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        };
        const [statsRes, logsRes, rulesRes] = await Promise.all([
          fetch(`${url}/api/stats`, { headers }),
          fetch(`${url}/api/logs`, { headers }),
          fetch(`${url}/api/rules`, { headers }),
        ]);
        if (statsRes.ok && logsRes.ok && rulesRes.ok) {
          const stats = await statsRes.json();
          const logs = await logsRes.json();
          const rules = await rulesRes.json();
          setWafStats(stats);
          setWafLogs(logs);
          setWafRules(rules);
          setWafOffline(false);
          setConnectedWafUrl(url);
          success = true;
          break;
        }
      } catch {
        // Try next
      }
    }

    if (!success) {
      setWafOffline(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated || isProduction) return;
    fetchWafData();
    const interval = setInterval(fetchWafData, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isProduction]);

  const handleAddWafIPRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wafIpInput.trim()) return;
    try {
      const wafUrl = connectedWafUrl || getWafApiUrl();
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
      const wafUrl = connectedWafUrl || getWafApiUrl();
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

  const filteredLogs = (wafLogs || []).filter((log) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (log.ip || "").toLowerCase().includes(term) ||
      (log.path || "").toLowerCase().includes(term) ||
      (log.method || "").toLowerCase().includes(term) ||
      (log.rules || []).some((r: string) => r.toLowerCase().includes(term))
    );
  });

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#080b11] text-foreground p-6">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <p className="mt-3 text-sm text-muted-foreground font-mono">
          Initializing WAF Shield Console...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#080b11] text-foreground relative selection:bg-red-500/20">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle variant="ghost" />
        </div>
        <div className="w-full max-w-md bg-card/65 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-red-500/20 text-center space-y-6">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 mx-auto shadow-inner">
            <ShieldAlert className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">KCT SHIELD WAF Portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Authorized System Administrator Console.
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
                className="h-11 bg-background/50 border-border text-center font-mono tracking-widest"
              />
              {errorMsg && (
                <p className="text-xs font-semibold text-destructive mt-1 text-center animate-shake">
                  {errorMsg}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
            >
              <Key className="h-4 w-4" /> Authenticate Firewall Access
            </Button>
          </form>

          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5 text-red-500" /> Authorized Admin & Developer Use Only
          </div>
        </div>
      </div>
    );
  }

  const total = wafStats?.total ?? 0;
  const allowed = wafStats?.allowed ?? 0;
  const blocked = wafStats?.blocked ?? 0;
  const rateLimited = wafStats?.rateLimited ?? 0;
  const allowedPct = total > 0 ? Math.round((allowed / total) * 100) : 0;
  const blockedPct = total > 0 ? Math.round((blocked / total) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#080b11] text-foreground selection:bg-red-500/20">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-[#0f172a]/80 backdrop-blur-xl px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 border border-red-500/30 text-red-500">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base tracking-tight">
                KCT <span className="text-red-500">SHIELD</span>
              </span>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1",
                  wafOffline && !edgeWafActive
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    wafOffline && !edgeWafActive ? "bg-rose-500" : "bg-emerald-400 animate-ping",
                  )}
                />
                {edgeWafActive
                  ? "EDGE WAF ACTIVE"
                  : wafOffline
                    ? "OFFLINE"
                    : "WAF TELEMETRY ACTIVE"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Web Application Firewall Engine & Traffic Analyzer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={fetchWafData}
            variant="outline"
            size="sm"
            className="gap-2 text-xs border-border bg-card/60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Force Refresh
          </Button>

          <Button
            onClick={handleLockWaf}
            variant="destructive"
            size="sm"
            className="gap-2 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white"
          >
            <Lock className="h-3.5 w-3.5" /> Lock Console
          </Button>

          <Link to="/developer">
            <Button variant="outline" size="sm" className="gap-2 text-xs border-border bg-card/60">
              <ArrowLeft className="h-3.5 w-3.5" /> Developer Portal
            </Button>
          </Link>

          <Link to="/dashboard">
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white gap-2 text-xs font-semibold shadow-lg shadow-red-600/10"
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Back to App
            </Button>
          </Link>
          <ThemeToggle variant="ghost" size="sm" />
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* KPI metrics cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card/45 border border-border/60 backdrop-blur-xl rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-1 bg-blue-500/60 w-full" />
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Total Packets Processed
            </span>
            <span className="text-3xl font-black text-white mt-1.5 block">{total}</span>
            <span className="text-[10px] text-muted-foreground block mt-1.5">
              Incoming raw HTTP requests
            </span>
          </div>

          <div className="bg-card/45 border border-border/60 backdrop-blur-xl rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-1 bg-emerald-500/60 w-full" />
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Allowed Traffic
            </span>
            <span className="text-3xl font-black text-emerald-400 mt-1.5 block">{allowed}</span>
            <span className="text-[10px] text-emerald-500 font-bold block mt-1.5">
              {allowedPct}% Success Rate
            </span>
          </div>

          <div className="bg-card/45 border border-border/60 backdrop-blur-xl rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-1 bg-rose-500/60 w-full" />
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Threats Blocked
            </span>
            <span className="text-3xl font-black text-rose-500 mt-1.5 block">{blocked}</span>
            <span className="text-[10px] text-rose-500 font-bold block mt-1.5">
              {blockedPct}% Malicious Requests
            </span>
          </div>

          <div className="bg-card/45 border border-border/60 backdrop-blur-xl rounded-2xl p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-1 bg-amber-500/60 w-full" />
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Rate Limits Throttled
            </span>
            <span className="text-3xl font-black text-amber-500 mt-1.5 block">{rateLimited}</span>
            <span className="text-[10px] text-muted-foreground block mt-1.5">
              Temporary IP bursts blocked
            </span>
          </div>
        </div>

        {edgeWafActive && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-4 max-w-3xl mx-auto">
            <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-emerald-400">
                Edge WAF Middleware Active on Vercel
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-lg mx-auto leading-relaxed">
                KCT SHIELD is running as{" "}
                <strong className="text-emerald-400">Vercel Edge Middleware</strong> and is actively
                protecting all incoming requests to{" "}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-emerald-400 font-mono text-[11px]">
                  kct-classroom-flow.vercel.app
                </code>
                . Every HTTP request is inspected for SQLi, XSS, Path Traversal, and Command
                Injection attacks in real-time at the edge.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto mt-4">
              <div className="bg-card/45 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  SQL Injection
                </span>
                <span className="text-xs font-black text-white mt-1 block">Protected ✓</span>
              </div>
              <div className="bg-card/45 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  XSS Attack
                </span>
                <span className="text-xs font-black text-white mt-1 block">Protected ✓</span>
              </div>
              <div className="bg-card/45 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Path Traversal
                </span>
                <span className="text-xs font-black text-white mt-1 block">Protected ✓</span>
              </div>
              <div className="bg-card/45 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  CMD Injection
                </span>
                <span className="text-xs font-black text-white mt-1 block">Protected ✓</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic mt-2">
              Note: Live telemetry logs and IP override rules require a local KCT SHIELD API server
              (port 8081). The edge middleware does not store logs persistently.
            </p>
          </div>
        )}

        {wafOffline && !edgeWafActive && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-4 max-w-2xl mx-auto">
            <AlertOctagon className="h-10 w-10 text-rose-500 mx-auto animate-pulse" />
            <div>
              <h3 className="text-base font-bold text-rose-500">
                Firewall Daemon Local Service Offline
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
                The local telemetry monitor cannot connect to your running KCT SHIELD API server.
                Make sure the local WAF is running via{" "}
                <code className="bg-black/50 px-1 py-0.5 rounded text-rose-400 font-mono">
                  npm run dev
                </code>{" "}
                or that your hosted API URL is configured in Vercel.
              </p>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono bg-black/45 py-2 px-3 rounded border border-border/40 inline-block break-all max-w-md space-y-1">
              <div>Configured WAF URL: {getWafApiUrl()}</div>
              <div>Fallback Local WAF URL: http://localhost:8081</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Incidents Stream Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass border border-border/60 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-red-500" /> Live Threat Incident Log Stream
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time HTTP request packets scoring history.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter by IP, Route, Rules..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-xs bg-[#0b0f19] border-border"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/60 bg-[#080b11]/80">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0f172a]/70 border-b border-border/60 text-muted-foreground uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Client IP</th>
                      <th className="px-4 py-3">Request Details</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Rules</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center py-12 text-muted-foreground italic font-sans text-xs"
                        >
                          No WAF security events detected.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => {
                        let actionBadge = "bg-green-500/10 text-emerald-400 border-emerald-500/20";
                        if (log.action === "BLOCK")
                          actionBadge = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                        if (log.action === "RATE_LIMIT")
                          actionBadge = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                        if (log.action === "MONITOR")
                          actionBadge = "bg-purple-500/10 text-purple-400 border-purple-500/20";

                        return (
                          <tr key={log.id} className="hover:bg-card/25 transition">
                            <td className="px-4 py-4 text-muted-foreground text-[10px]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-4 font-bold text-white">{log.ip}</td>
                            <td className="px-4 py-4">
                              <span className="text-blue-400 font-bold mr-1">{log.method}</span>
                              <span className="text-foreground">{log.path}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={cn(
                                  "px-2 py-0.5 border rounded-full text-[10px] font-black uppercase tracking-wider",
                                  actionBadge,
                                )}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "px-4 py-4 font-black",
                                log.score >= 50
                                  ? "text-rose-500"
                                  : log.score >= 20
                                    ? "text-purple-400"
                                    : "text-emerald-400",
                              )}
                            >
                              {log.score}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-1">
                                {log.rules.length > 0 ? (
                                  log.rules.map((r: string) => (
                                    <span
                                      key={r}
                                      className="px-1.5 py-0.2 rounded bg-card text-[9px] text-gray-400 border border-border/30"
                                    >
                                      {r}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-600 italic font-sans text-[11px]">
                                    None
                                  </span>
                                )}
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
          </div>

          {/* Firewall controls sidebar */}
          <div className="space-y-6">
            {/* Quick Rules Form */}
            <div className="glass border border-border/60 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-rose-500" /> Quick IP Policies Engine
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Override WAF actions manually for specific IPs.
                </p>
              </div>

              <form onSubmit={handleAddWafIPRule} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Client IP Address
                  </label>
                  <Input
                    placeholder="e.g. 192.168.1.100"
                    value={wafIpInput}
                    onChange={(e) => setWafIpInput(e.target.value)}
                    className="h-9 text-xs font-mono bg-[#0b0f19] border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Rule Behavior
                  </label>
                  <select
                    value={wafRuleType}
                    onChange={(e: any) => setWafRuleType(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-[#0b0f19] border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                  >
                    <option value="block">BLOCK (Strict Deny IP)</option>
                    <option value="allow">ALLOW (Bypass WAF checks)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full h-9 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  Add Firewall Override Rule
                </Button>
              </form>
            </div>

            {/* Active overrides list */}
            <div className="glass border border-border/60 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Active Rule overrides
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Whitelist/blacklist policies in local DB storage.
                </p>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 text-xs font-mono pr-1">
                {(!wafRules?.rules || wafRules.rules.length === 0) &&
                Object.keys(wafRules?.tempBlocks ?? {}).length === 0 ? (
                  <p className="text-muted-foreground italic text-center py-6 font-sans text-xs">
                    No manual IP overrides or temporary blocks active.
                  </p>
                ) : (
                  <>
                    {wafRules?.rules.map((rule: any) => (
                      <div
                        key={rule.ip}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/50"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              rule.type === "allow"
                                ? "bg-emerald-500 animate-pulse"
                                : "bg-rose-500",
                            )}
                          />
                          <span className="text-white font-bold">{rule.ip}</span>
                          <span
                            className={cn(
                              "px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold border",
                              rule.type === "allow"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20",
                            )}
                          >
                            {rule.type}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteWafIPRule(rule.ip)}
                          className="text-rose-500 hover:text-rose-400 transition text-[10px] font-black cursor-pointer"
                        >
                          REMOVE
                        </button>
                      </div>
                    ))}
                    {Object.entries(wafRules?.tempBlocks ?? {}).map(([ip, expiresAt]: any) => (
                      <div
                        key={ip}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                          <span className="text-white font-bold">{ip}</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] uppercase font-bold border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                            block (temp)
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground italic font-sans">
                          Expiring
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/20 py-6 text-center text-xs text-muted-foreground mt-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KCT PULSE. Internal WAF Security Engine dashboard.</p>
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
