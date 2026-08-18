import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseExamIntegrityProps {
  sessionId: string;
  participantId: string | null;
  isExam: boolean;
  currentQuestionId: string | null;
  settings?: {
    maxFullscreenExits: number;
    blockClipboard: boolean;
    blockRightClick: boolean;
  };
}

export function useExamIntegrity({
  sessionId,
  participantId,
  isExam,
  currentQuestionId,
  settings = {
    maxFullscreenExits: 3,
    blockClipboard: true,
    blockRightClick: true,
  },
}: UseExamIntegrityProps) {
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState<number>(0);
  const [downlink, setDownlink] = useState<number>(10);
  const [connectionType, setConnectionType] = useState<string>("unknown");

  // Keep track of durations
  const hiddenStartRef = useRef<number | null>(null);
  const blurStartRef = useRef<number | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());

  // Log an integrity event to Supabase
  const logEvent = async (eventType: string, durationSeconds?: number, metadata: any = {}) => {
    if (!participantId || !isExam) return;

    const event = {
      session_id: sessionId,
      participant_id: participantId,
      event_type: eventType,
      question_id: currentQuestionId,
      timestamp: new Date().toISOString(),
      duration_seconds: durationSeconds ?? null,
      client_metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    };

    if (!navigator.onLine) {
      // Store in local storage queue if offline
      const queueKey = `exam-offline-events-${sessionId}`;
      const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
      queue.push(event);
      localStorage.setItem(queueKey, JSON.stringify(queue));
      return;
    }

    try {
      await (supabase as any).from("exam_integrity_events").insert(event);
    } catch (err) {
      console.error("Failed to log integrity event:", err);
    }
  };

  // Sync offline events queue
  const syncOfflineEvents = async () => {
    if (!participantId) return;
    const queueKey = `exam-offline-events-${sessionId}`;
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    if (queue.length === 0) return;

    try {
      const { error } = await (supabase as any).from("exam_integrity_events").insert(queue);
      if (!error) {
        localStorage.removeItem(queueKey);
        toast.success("Synchronized offline integrity events with server.");
        logEvent("CONNECTION_RESTORED", undefined, { syncedCount: queue.length });
      }
    } catch (err) {
      console.error("Failed to sync offline events:", err);
    }
  };

  // Fullscreen helper
  const requestFullscreen = async () => {
    const docEl = document.documentElement;
    try {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if ((docEl as any).webkitRequestFullscreen) {
        await (docEl as any).webkitRequestFullscreen();
      } else if ((docEl as any).msRequestFullscreen) {
        await (docEl as any).msRequestFullscreen();
      }
      setIsFullscreenActive(true);
      setIsWarningOpen(false);
    } catch (err) {
      console.error("Failed to enter fullscreen:", err);
      toast.error("Fullscreen entry blocked. Please click again to permit fullscreen.");
    }
  };

  // ── 1. Listeners for Fullscreen, Visibility, Focus ──────────────────
  useEffect(() => {
    if (!isExam || !participantId) return;

    // A. Fullscreenchange listener
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      setIsFullscreenActive(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen) {
        // Exited fullscreen
        setFullscreenExits((prev) => {
          const nextCount = prev + 1;
          logEvent("FULLSCREEN_EXITED", undefined, { exitCount: nextCount });
          
          if (nextCount >= settings.maxFullscreenExits) {
            setWarningMessage(`Maximum fullscreen exits reached (${nextCount}/${settings.maxFullscreenExits}). Faculty has been alerted.`);
          } else {
            setWarningMessage(`Fullscreen mode exited. Re-entry is required to resume exam. Warning: ${nextCount}/${settings.maxFullscreenExits}`);
          }
          setIsWarningOpen(true);
          return nextCount;
        });
      } else {
        // Re-entered fullscreen
        logEvent("FULLSCREEN_ENTERED");
      }
    };

    // B. Visibilitychange listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenStartRef.current = Date.now();
        logEvent("PAGE_HIDDEN");
      } else if (document.visibilityState === "visible") {
        const duration = hiddenStartRef.current
          ? Math.round((Date.now() - hiddenStartRef.current) / 1000)
          : 0;
        logEvent("PAGE_VISIBLE", duration);
        hiddenStartRef.current = null;
      }
    };

    // C. Focus and Blur listeners
    const handleWindowBlur = () => {
      blurStartRef.current = Date.now();
      logEvent("WINDOW_BLUR");
    };

    const handleWindowFocus = () => {
      const duration = blurStartRef.current
        ? Math.round((Date.now() - blurStartRef.current) / 1000)
        : 0;
      logEvent("WINDOW_FOCUS", duration);
      blurStartRef.current = null;
    };

    // Attach listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    // Initial log of exam entry
    logEvent("EXAM_STARTED");

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isExam, participantId, sessionId, currentQuestionId]);

  // ── 2. Listeners for ContextMenu, Clipboard, and Keyboard Keypresses ────
  useEffect(() => {
    if (!isExam || !participantId) return;

    // Block right-clicks
    const handleContextMenu = (e: MouseEvent) => {
      if (settings.blockRightClick) {
        e.preventDefault();
        logEvent("RIGHT_CLICK");
        toast.error("Right-click context menu is restricted during exams.");
      }
    };

    // Block copies
    const handleCopy = (e: ClipboardEvent) => {
      if (settings.blockClipboard) {
        e.preventDefault();
        logEvent("COPY_ATTEMPT");
        toast.error("Clipboard copy is disabled during this exam.");
      }
    };

    // Block cuts
    const handleCut = (e: ClipboardEvent) => {
      if (settings.blockClipboard) {
        e.preventDefault();
        logEvent("CUT_ATTEMPT");
        toast.error("Clipboard cut is disabled during this exam.");
      }
    };

    // Block pastes
    const handlePaste = (e: ClipboardEvent) => {
      if (settings.blockClipboard) {
        e.preventDefault();
        logEvent("PASTE_ATTEMPT");
        toast.error("Clipboard paste is disabled during this exam.");
      }
    };

    // Block critical shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      
      // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+U (view source), F12
      if (isCmdOrCtrl && ["c", "v", "x", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        logEvent("KEYBOARD_SHORTCUT", undefined, { keyCombo: `Ctrl+${e.key.toUpperCase()}` });
        toast.error("Keyboard shortcut disabled.");
      }
      
      if (e.key === "F12") {
        e.preventDefault();
        logEvent("KEYBOARD_SHORTCUT", undefined, { keyCombo: "F12" });
        toast.error("Developer console is restricted.");
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("cut", handleCut);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("cut", handleCut);
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExam, participantId, settings]);

  // ── 3. Heartbeat & Network Quality Monitor ────────────────────────────
  useEffect(() => {
    if (!isExam || !participantId) return;

    // Listen to browser network changes
    const handleOnline = () => {
      setIsOnline(true);
      logEvent("NETWORK_ONLINE");
      syncOfflineEvents();
    };

    const handleOffline = () => {
      setIsOnline(false);
      logEvent("NETWORK_OFFLINE");
      toast.error("Network connection lost. Progress will be saved locally.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Heartbeat sending loop
    const sendHeartbeat = async () => {
      if (!navigator.onLine || !participantId) return;

      const startTime = Date.now();
      
      // Fetch connection info if supported
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      const type = connection?.effectiveType || connection?.type || "unknown";
      const down = connection?.downlink || 10;
      setDownlink(down);
      setConnectionType(type);

      try {
        const { error } = await (supabase as any).from("exam_heartbeats").insert({
          session_id: sessionId,
          participant_id: participantId,
          latency_ms: latency, // send last measured latency
          downlink_mbps: down,
          connection_type: type,
        });

        if (!error) {
          const rtt = Date.now() - startTime;
          setLatency(rtt);
          lastHeartbeatRef.current = Date.now();
        }
      } catch (err) {
        console.error("Heartbeat sync failure:", err);
      }
    };

    // Start polling loop
    const pingInterval = setInterval(sendHeartbeat, 6000); // Heartbeat every 6 seconds

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isExam, participantId, sessionId, latency]);

  return {
    isFullscreenActive,
    fullscreenExits,
    isWarningOpen,
    warningMessage,
    isOnline,
    latency,
    downlink,
    connectionType,
    requestFullscreen,
    logEvent,
  };
}
