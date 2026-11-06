import { supabase } from "@/integrations/supabase/client";
import { auth } from "@/lib/firebase";

export function getClientMetadata() {
  if (typeof window === "undefined") {
    return { browser: "Unknown", device: "Desktop", os: "Unknown" };
  }

  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  else if (ua.includes("MSIE") || ua.includes("Trident/")) browser = "Internet Explorer";

  let os = "Unknown";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("X11") || ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let device = "Desktop";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    device = /iPad|Tablet/i.test(ua) ? "Tablet" : "Mobile";
  }

  return { browser, device, os };
}

let activeLoggingPromise: Promise<string | null> | null = null;

export async function logUserLogin(
  user: { uid: string; email: string | null },
  role: string = "faculty",
) {
  if (typeof window !== "undefined") {
    const existingLogId =
      sessionStorage.getItem("current_login_log_id") ||
      sessionStorage.getItem("kct_active_login_log_id");
    if (existingLogId) {
      return existingLogId;
    }
  }

  if (activeLoggingPromise) {
    return await activeLoggingPromise;
  }

  activeLoggingPromise = (async () => {
    try {
      const { browser, device, os } = getClientMetadata();
      const loginTime = new Date().toISOString();

      const { data, error } = await supabase
        .from("login_logs")
        .insert({
          user_id: user.uid,
          email: user.email,
          role: role,
          login_time: loginTime,
          browser: browser,
          device: device,
          operating_system: os,
          status: "active",
        })
        .select("id")
        .single();

      if (error) {
        console.error("[LoginTelemetry] Failed to log user login:", {
          code: error.code,
          message: error.message,
          details: error.details,
        });
        return null;
      }

      if (typeof window !== "undefined" && data?.id) {
        sessionStorage.setItem("current_login_log_id", data.id);
        sessionStorage.setItem("kct_active_login_log_id", data.id);
        sessionStorage.setItem("kct_active_login_time", loginTime);
      }

      return data?.id ?? null;
    } catch (err: any) {
      console.error("[LoginTelemetry] Error in logUserLogin:", err?.message || err);
      return null;
    } finally {
      activeLoggingPromise = null;
    }
  })();

  return await activeLoggingPromise;
}

export async function ensureSessionLogged(
  user: { uid: string; email: string | null },
  role: string = "faculty",
): Promise<string | null> {
  if (typeof window === "undefined" || !user?.uid) return null;

  const existingLogId =
    sessionStorage.getItem("current_login_log_id") ||
    sessionStorage.getItem("kct_active_login_log_id");

  if (existingLogId) {
    return existingLogId;
  }

  return await logUserLogin(user, role);
}

export async function logUserLogout() {
  try {
    if (typeof window === "undefined") return;

    const logId =
      sessionStorage.getItem("current_login_log_id") ||
      sessionStorage.getItem("kct_active_login_log_id");
    const loginTimeStr = sessionStorage.getItem("kct_active_login_time");

    const logoutTime = new Date();
    let sessionDurationSeconds = 0;

    if (loginTimeStr) {
      const loginTime = new Date(loginTimeStr);
      sessionDurationSeconds = Math.max(
        0,
        Math.floor((logoutTime.getTime() - loginTime.getTime()) / 1000),
      );
    }

    if (logId) {
      await supabase
        .from("login_logs")
        .update({
          logout_time: logoutTime.toISOString(),
          session_duration: sessionDurationSeconds,
          status: "logged_out",
        })
        .eq("id", logId);
    }

    sessionStorage.removeItem("current_login_log_id");
    sessionStorage.removeItem("kct_active_login_log_id");
    sessionStorage.removeItem("kct_active_login_time");
  } catch (err) {
    console.error("Error in logUserLogout:", err);
  }
}

/**
 * Records a developer or WAF console password entry event into public.login_logs.
 * Captures user identity (from Firebase auth / profile), client device metadata,
 * and exact ISO timestamp.
 */
export async function logDeveloperAccessEvent(
  context: "Developer Portal" | "WAF Console" = "Developer Portal",
  role: string = "developer",
): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user?.uid) {
      console.warn(`[LoginTelemetry] Cannot log ${context} entry: No signed-in Firebase user.`);
      return null;
    }

    const { browser, device, os } = getClientMetadata();
    const loginTime = new Date().toISOString();

    const { data, error } = await supabase
      .from("login_logs")
      .insert({
        user_id: user.uid,
        email: user.email,
        role: role,
        login_time: loginTime,
        browser: browser,
        device: `${device} • ${context}`,
        operating_system: os,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[LoginTelemetry] Failed to log ${context} entry:`, error);
      return null;
    }

    if (typeof window !== "undefined" && data?.id) {
      const storageKey =
        context === "WAF Console" ? "kct_waf_login_log_id" : "kct_dev_login_log_id";
      sessionStorage.setItem(storageKey, data.id);
      sessionStorage.setItem(`${storageKey}_time`, loginTime);
    }

    return data?.id ?? null;
  } catch (err) {
    console.error(`[LoginTelemetry] Error in logDeveloperAccessEvent:`, err);
    return null;
  }
}

/**
 * Closes an active developer or WAF console session by recording logout time & duration.
 */
export async function closeDeveloperAccessLog(
  logId?: string | null,
  context: "Developer Portal" | "WAF Console" = "Developer Portal",
): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const storageKey =
      context === "WAF Console" ? "kct_waf_login_log_id" : "kct_dev_login_log_id";
    const targetLogId = logId || sessionStorage.getItem(storageKey);
    const loginTimeStr = sessionStorage.getItem(`${storageKey}_time`);

    const logoutTime = new Date();
    let sessionDurationSeconds = 0;

    if (loginTimeStr) {
      const loginTime = new Date(loginTimeStr);
      sessionDurationSeconds = Math.max(
        0,
        Math.floor((logoutTime.getTime() - loginTime.getTime()) / 1000),
      );
    }

    if (targetLogId) {
      await supabase
        .from("login_logs")
        .update({
          logout_time: logoutTime.toISOString(),
          session_duration: sessionDurationSeconds,
          status: "logged_out",
        })
        .eq("id", targetLogId);
    }

    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`${storageKey}_time`);
  } catch (err) {
    console.error(`[LoginTelemetry] Error in closeDeveloperAccessLog:`, err);
  }
}
