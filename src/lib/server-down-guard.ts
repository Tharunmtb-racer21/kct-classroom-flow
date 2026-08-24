/**
 * server-down-guard.ts
 * Emergency Maintenance & Supabase Server Down Kill-Switch Manager.
 * Toggled from the Developer WAF Panel (/developer-waf or /developer).
 * When enabled, broadcasts an emergency maintenance state across all open client windows,
 * displaying a full-screen "Supabase Server Down — Please contact developer" warning.
 */

const SERVER_DOWN_KEY = "kct_pulse_supabase_server_down";
const BROADCAST_EVENT_NAME = "kct_supabase_server_down_change";

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  broadcastChannel = new BroadcastChannel("kct_pulse_server_down_channel");
}

/**
 * Checks if Supabase Server Down emergency mode is currently enabled.
 */
export function isSupabaseServerDown(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SERVER_DOWN_KEY) === "true";
}

/**
 * Toggles Supabase Server Down emergency mode ON / OFF and broadcasts to all active tabs.
 */
export function setSupabaseServerDown(enabled: boolean): void {
  if (typeof window === "undefined") return;

  if (enabled) {
    localStorage.setItem(SERVER_DOWN_KEY, "true");
  } else {
    localStorage.removeItem(SERVER_DOWN_KEY);
  }

  // 1. Dispatch local window event
  window.dispatchEvent(new CustomEvent(BROADCAST_EVENT_NAME, { detail: { enabled } }));

  // 2. Broadcast to other open browser tabs via BroadcastChannel
  if (broadcastChannel) {
    broadcastChannel.postMessage({ enabled });
  }
}

/**
 * Subscribes to Supabase Server Down mode changes across windows/tabs.
 */
export function subscribeServerDownChanges(callback: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    callback(detail?.enabled ?? isSupabaseServerDown());
  };

  const handleBroadcastMessage = (e: MessageEvent) => {
    if (e.data && typeof e.data.enabled === "boolean") {
      callback(e.data.enabled);
    }
  };

  window.addEventListener(BROADCAST_EVENT_NAME, handleCustomEvent);

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener(BROADCAST_EVENT_NAME, handleCustomEvent);
    if (broadcastChannel) {
      broadcastChannel.removeEventListener("message", handleBroadcastMessage);
    }
  };
}
