import { supabase } from "@/integrations/supabase/client";

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

export async function logUserLogin(user: { uid: string; email: string | null }, role: string = "faculty") {
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
      console.error("Failed to log user login:", error);
      return null;
    }

    if (typeof window !== "undefined" && data?.id) {
      sessionStorage.setItem("kct_active_login_log_id", data.id);
      sessionStorage.setItem("kct_active_login_time", loginTime);
    }

    return data?.id ?? null;
  } catch (err) {
    console.error("Error in logUserLogin:", err);
    return null;
  }
}

export async function logUserLogout() {
  try {
    if (typeof window === "undefined") return;

    const logId = sessionStorage.getItem("kct_active_login_log_id");
    const loginTimeStr = sessionStorage.getItem("kct_active_login_time");

    const logoutTime = new Date();
    let sessionDurationSeconds = 0;

    if (loginTimeStr) {
      const loginTime = new Date(loginTimeStr);
      sessionDurationSeconds = Math.max(0, Math.floor((logoutTime.getTime() - loginTime.getTime()) / 1000));
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

    sessionStorage.removeItem("kct_active_login_log_id");
    sessionStorage.removeItem("kct_active_login_time");
  } catch (err) {
    console.error("Error in logUserLogout:", err);
  }
}
