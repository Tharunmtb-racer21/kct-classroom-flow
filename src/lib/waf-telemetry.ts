/**
 * waf-telemetry.ts
 * Enterprise Non-Blocking Telemetry Dispatcher for KCT SHIELD Edge WAF.
 *
 * Dispatches WAF security decisions and packet counters to Supabase
 * via the SECURITY DEFINER RPC `record_waf_event`.
 *
 * CRITICAL SAFETY GUARANTEE:
 * Telemetry failures are strictly isolated and will NEVER impede or alter
 * the WAF blocking decision or request lifecycle.
 */

export interface WafTelemetryEvent {
  action: "ALLOW" | "BLOCK" | "RATE_LIMIT" | "MONITOR";
  score: number;
  rules?: string[];
  path: string;
  method?: string;
  clientIp: string;
  incidentId?: string;
  details?: Record<string, any>;
}

/**
 * Anonymizes client IP address using SHA-256 hashing.
 * Raw client IP addresses are NEVER persisted in telemetry tables.
 */
export async function hashClientIp(ip: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(ip + "_kct_shield_salt");
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 16);
  } catch {
    return "anon_client";
  }
}

/**
 * Strips sensitive query parameters and truncates paths safely.
 */
export function sanitizeRequestPath(rawPath: string): string {
  try {
    const clean = rawPath.split("?")[0] || "/";
    return clean.substring(0, 256);
  } catch {
    return "/";
  }
}

/**
 * Emits telemetry event asynchronously.
 * Strictly non-blocking: absorbs all network and database errors.
 */
export async function recordWafTelemetryEvent(event: WafTelemetryEvent): Promise<void> {
  try {
    // 1. Resolve environment variables
    const ingestSecret = process.env.WAF_INGEST_SECRET || "";
    if (!ingestSecret) {
      return;
    }

    const supabaseUrl =
      (process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "https://zojnzycfwstyubqinztd.supabase.co")
        .trim()
        .replace(/\/$/, "");

    const supabaseKey = (
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_uoMpgz1BZW2WocmeNWXg4A_bNQACBlD"
    ).trim();

    if (!supabaseUrl || !supabaseKey) {
      return;
    }

    const ipHash = await hashClientIp(event.clientIp || "127.0.0.1");
    const sanitizedPath = sanitizeRequestPath(event.path);
    const sanitizedMethod = (event.method || "GET").toUpperCase().substring(0, 10);

    const rpcEndpoint = `${supabaseUrl}/rest/v1/rpc/record_waf_event`;

    // 2. Transmit via lightweight fetch with short 2.5s abort timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
      await fetch(rpcEndpoint, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_secret: ingestSecret,
          p_action: event.action,
          p_score: event.score,
          p_rules: event.rules || [],
          p_path: sanitizedPath,
          p_method: sanitizedMethod,
          p_ip_hash: ipHash,
          p_incident_id: event.incidentId || "INC-ANON",
          p_details: event.details || {},
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    // Telemetry failure MUST NOT fail the request.
    // Silently log warning in server logs and safely return.
    if (err?.name !== "AbortError") {
      console.warn("[KCT SHIELD Telemetry] Ingest skipped:", err?.message || err);
    }
  }
}
