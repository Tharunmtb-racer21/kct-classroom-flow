import { useState, useMemo } from "react";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  FileText,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Session, Participant } from "@/types/session.types";

export interface ExamIntegrityProctoringProps {
  session: Session;
  participants: Participant[];
  recentHeartbeats: Record<string, { timestamp: string; latency_ms: number; status: string }>;
  onSelectStudent: (student: Participant) => void;
}

export function ExamIntegrityProctoring({
  session,
  participants,
  recentHeartbeats,
  onSelectStudent,
}: ExamIntegrityProctoringProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");

  // Helper to determine connection state
  const getConnectionState = (studentId: string) => {
    const hb = recentHeartbeats[studentId];
    if (!hb) return { state: "offline", latency: 0, lastSeen: "Never" };

    const elapsedMs = Date.now() - new Date(hb.timestamp).getTime();
    if (elapsedMs > 15000) {
      return { state: "offline", latency: 0, lastSeen: `${Math.round(elapsedMs / 1000)}s ago` };
    }

    return {
      state: hb.status === "unstable" ? "idle" : "online",
      latency: hb.latency_ms,
      lastSeen: "Just now",
    };
  };

  // Compute stats
  const totalStudents = participants.length;
  const avgRisk =
    totalStudents > 0
      ? Math.round(participants.reduce((acc, p) => acc + (p.risk_score || 0), 0) / totalStudents)
      : 0;

  const highRiskCount = participants.filter((p) => p.risk_level === "high").length;
  const offlineCount = participants.filter(
    (p) => getConnectionState(p.id).state === "offline",
  ).length;
  const onlineCount = totalStudents - offlineCount;

  // Filter list
  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      const conn = getConnectionState(p.id);

      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRisk = riskFilter === "all" || p.risk_level === riskFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && conn.state !== "offline") ||
        (statusFilter === "offline" && conn.state === "offline");

      return matchesSearch && matchesRisk && matchesStatus;
    });
  }, [participants, searchQuery, riskFilter, statusFilter, recentHeartbeats]);

  return (
    <div className="space-y-6 text-left">
      {/* Dynamic Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
            Total Proctoring
          </span>
          <div className="text-2xl font-extrabold text-foreground mt-1">{totalStudents}</div>
          <span className="text-[10px] text-muted-foreground">Students joined</span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
            Avg Session Risk
          </span>
          <div
            className={cn(
              "text-2xl font-extrabold mt-1",
              avgRisk >= 60
                ? "text-rose-500"
                : avgRisk >= 25
                  ? "text-amber-500"
                  : "text-emerald-500",
            )}
          >
            {avgRisk} pts
          </div>
          <span className="text-[10px] text-muted-foreground">Weighted session average</span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
            High Risk Alerts
          </span>
          <div
            className={cn(
              "text-2xl font-extrabold mt-1",
              highRiskCount > 0 ? "text-rose-500 animate-pulse" : "text-foreground",
            )}
          >
            {highRiskCount}
          </div>
          <span className="text-[10px] text-rose-500/80 font-bold">
            {highRiskCount > 0 ? "⚠️ Inspect immediately" : "All clear"}
          </span>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
            Connection Status
          </span>
          <div className="text-2xl font-extrabold text-foreground mt-1 flex items-center gap-2">
            <span className="text-emerald-500 font-bold">{onlineCount}</span>
            <span className="text-muted-foreground text-sm font-normal">/</span>
            <span className="text-rose-500 font-bold">{offlineCount}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Online vs Offline</span>
        </div>
      </div>

      {/* Grid Controller Header - Search & Filter */}
      <div className="glass rounded-2xl p-5 border border-border/50 bg-card/40 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-background/50 border-border h-10 text-sm"
          />
          <div className="flex gap-2">
            <Select value={riskFilter} onValueChange={(val: any) => setRiskFilter(val)}>
              <SelectTrigger className="w-[130px] bg-background/50 border-border text-xs h-10">
                <SelectValue placeholder="Risk Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-[130px] bg-background/50 border-border text-xs h-10">
                <SelectValue placeholder="Connection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Real-time Grid List */}
        <div className="border border-border/40 rounded-xl overflow-hidden bg-background/25">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/40 border-b border-border/40 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4 text-left">Student Name</div>
            <div className="col-span-2 text-center">Connection</div>
            <div className="col-span-2 text-center">Latency</div>
            <div className="col-span-2 text-center">Risk Score</div>
            <div className="col-span-2 text-right">Proctor Audit</div>
          </div>

          <div className="divide-y divide-border/30">
            {filteredParticipants.map((p) => {
              const conn = getConnectionState(p.id);

              return (
                <div
                  key={p.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 text-xs items-center hover:bg-muted/15 transition-colors"
                >
                  <div className="col-span-4 font-bold text-foreground/90 truncate text-left">
                    {p.name}
                  </div>

                  <div className="col-span-2 flex justify-center">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        conn.state === "online"
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                          : conn.state === "idle"
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                            : "bg-rose-500/10 border-rose-500/20 text-rose-500",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1 w-1 rounded-full",
                          conn.state === "online"
                            ? "bg-emerald-500"
                            : conn.state === "idle"
                              ? "bg-amber-500 animate-pulse"
                              : "bg-rose-500",
                        )}
                      />
                      {conn.state.toUpperCase()}
                    </span>
                  </div>

                  <div className="col-span-2 text-center font-mono text-[11px] text-muted-foreground">
                    {conn.state !== "offline" ? `${conn.latency} ms` : `--`}
                  </div>

                  <div className="col-span-2 text-center">
                    <span
                      className={cn(
                        "font-extrabold font-mono text-[11px] px-2 py-0.5 rounded-full border",
                        p.risk_level === "high"
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                          : p.risk_level === "medium"
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                      )}
                    >
                      {Math.round(p.risk_score ?? 0)} pts
                    </span>
                  </div>

                  <div className="col-span-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectStudent(p)}
                      className="h-7 px-2.5 text-[10px] rounded-lg border-border hover:bg-primary hover:text-primary-foreground font-bold flex items-center gap-1 ml-auto shadow-sm"
                    >
                      <FileText className="h-3 w-3" /> Audit Log
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredParticipants.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground italic bg-background/5">
                No students match the current proctoring filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

