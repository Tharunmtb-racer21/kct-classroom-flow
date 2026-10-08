/**
 * security-intelligence.ts
 * Pure deterministic helpers and status calculators for Security Intelligence.
 */

export type LayerStatus = "Active (verified)" | "Degraded" | "Not active" | "Unverifiable";

export interface LayerHealthInfo {
  id: number;
  name: string;
  status: LayerStatus;
  description: string;
  evidence: string;
  latencyMs?: number;
}

export type SystemSecurityStatus = "Protected" | "Degraded" | "Attention Required" | "Unavailable";

/**
 * Returns the ISO timestamp corresponding to midnight (00:00:00) today
 * in the Asia/Kolkata timezone (UTC+05:30).
 */
export function getStartOfTodayIST(): string {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const year = istNow.getUTCFullYear();
  const month = String(istNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istNow.getUTCDate()).padStart(2, "0");
  const midnightIST = new Date(`${year}-${month}-${day}T00:00:00+05:30`);
  return midnightIST.toISOString();
}

/**
 * Pure deterministic calculation of System Security Status.
 */
export function calculateSystemSecurityStatus(
  layers: LayerHealthInfo[],
  hasCriticalError: boolean,
): { status: SystemSecurityStatus; reason: string } {
  if (hasCriticalError) {
    return {
      status: "Unavailable",
      reason: "Critical security telemetry could not be retrieved from the database.",
    };
  }

  const dbLayer = layers.find((l) => l.name === "Postgres DB");
  const authLayer = layers.find((l) => l.name === "Firebase Auth");
  const rlsLayer = layers.find((l) => l.name === "Supabase RLS");

  if (!dbLayer || (dbLayer.status === "Degraded" && (dbLayer.latencyMs || 0) > 2000)) {
    return {
      status: "Attention Required",
      reason: "Database connectivity degraded or response latency critically elevated.",
    };
  }

  if (authLayer?.status !== "Active (verified)") {
    return {
      status: "Attention Required",
      reason: "Faculty authentication context is unverified or lost.",
    };
  }

  if (rlsLayer?.status !== "Active (verified)") {
    return {
      status: "Attention Required",
      reason: "Row-Level Security verification failed.",
    };
  }

  const degradedLayers = layers.filter((l) => l.status === "Degraded");
  if (degradedLayers.length > 0) {
    return {
      status: "Degraded",
      reason: `${degradedLayers.length} security layer(s) reporting degraded metrics.`,
    };
  }

  return {
    status: "Protected",
    reason: "All verified production security controls operational.",
  };
}
