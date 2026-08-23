/**
 * ml-anomaly-detector.ts
 * ML-based Anomaly Detection Layer for KCT PULSE.
 * Evaluates real-time classroom submission timing, payload frequency, and request patterns
 * to identify automated bot activity, rapid response spamming, or suspicious traffic spikes.
 */

export interface RequestActivitySample {
  ipAddress?: string;
  participantId?: string;
  sessionId?: string;
  timestampMs: number;
  payloadLength?: number;
  isFailedAuth?: boolean;
  isMalformedPayload?: boolean;
}

export interface AnomalyAssessment {
  riskScore: number; // 0 to 100
  status: "NORMAL" | "MONITOR" | "SUSPICIOUS" | "CRITICAL";
  statusLabel: string;
  statusIcon: string;
  triggeredAnomalies: string[];
  primaryReason: string;
  suggestedAction: "ALLOW" | "RATE_LIMIT" | "TEMPORARY_BLOCK";
}

/**
 * In-memory sliding window cache for request velocity tracking
 */
const activityWindows = new Map<string, number[]>();

/**
 * Evaluate anomaly risk score for incoming classroom actions or requests
 */
export function evaluateBehavioralAnomaly(sample: RequestActivitySample): AnomalyAssessment {
  const {
    ipAddress = "127.0.0.1",
    participantId,
    timestampMs,
    payloadLength = 0,
    isFailedAuth = false,
    isMalformedPayload = false,
  } = sample;

  const key = participantId || ipAddress;
  const now = timestampMs;

  // Track timestamps in sliding 60-second window
  let history = activityWindows.get(key) || [];
  history = history.filter((t) => now - t <= 60000);
  history.push(now);
  activityWindows.set(key, history);

  const triggeredAnomalies: string[] = [];
  let riskScore = 0;

  // 1. Rapid Submission Velocity Anomaly (< 500ms between consecutive actions)
  if (history.length >= 2) {
    const lastDelta = history[history.length - 1] - history[history.length - 2];
    if (lastDelta < 400) {
      riskScore += 45;
      triggeredAnomalies.push(`Abnormally rapid submission speed (${lastDelta}ms delta)`);
    } else if (lastDelta < 800) {
      riskScore += 25;
      triggeredAnomalies.push(`Fast response velocity (${lastDelta}ms delta)`);
    }
  }

  // 2. High Request Frequency Anomaly (> 15 requests within 10 seconds)
  const recent10sCount = history.filter((t) => now - t <= 10000).length;
  if (recent10sCount > 15) {
    riskScore += 40;
    triggeredAnomalies.push(`Unusually high request frequency (${recent10sCount} req / 10s)`);
  } else if (recent10sCount > 8) {
    riskScore += 20;
    triggeredAnomalies.push(`Elevated request volume (${recent10sCount} req / 10s)`);
  }

  // 3. Large / Malformed Payload Anomaly
  if (isMalformedPayload) {
    riskScore += 35;
    triggeredAnomalies.push("Malformed payload or invalid structure detected");
  }

  if (payloadLength > 250000) {
    // 250KB limit for normal responses
    riskScore += 30;
    triggeredAnomalies.push(
      `Abnormally large payload size (${Math.round(payloadLength / 1024)} KB)`,
    );
  }

  // 4. Failed Authentication / Repeated Unauthorized Request Anomaly
  if (isFailedAuth) {
    riskScore += 40;
    triggeredAnomalies.push("Repeated failed authentication attempt");
  }

  // Cap risk score between 0 and 100
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Determine Status & Action
  let status: "NORMAL" | "MONITOR" | "SUSPICIOUS" | "CRITICAL" = "NORMAL";
  let statusLabel = "Protected / Normal Activity";
  let statusIcon = "🟢";
  let suggestedAction: "ALLOW" | "RATE_LIMIT" | "TEMPORARY_BLOCK" = "ALLOW";
  let primaryReason = "Normal classroom activity parameters.";

  if (riskScore >= 75) {
    status = "CRITICAL";
    statusLabel = "Suspicious Activity Detected";
    statusIcon = "🚨";
    suggestedAction = "TEMPORARY_BLOCK";
    primaryReason = triggeredAnomalies[0] || "Critical anomaly risk threshold exceeded.";
  } else if (riskScore >= 45) {
    status = "SUSPICIOUS";
    statusLabel = "Elevated Traffic Risk";
    statusIcon = "⚠️";
    suggestedAction = "RATE_LIMIT";
    primaryReason = triggeredAnomalies[0] || "Substantial behavioral deviation detected.";
  } else if (riskScore >= 20) {
    status = "MONITOR";
    statusLabel = "Monitored Pattern";
    statusIcon = "🟡";
    suggestedAction = "ALLOW";
    primaryReason = triggeredAnomalies[0] || "Slight request velocity anomaly.";
  }

  return {
    riskScore,
    status,
    statusLabel,
    statusIcon,
    triggeredAnomalies,
    primaryReason,
    suggestedAction,
  };
}
