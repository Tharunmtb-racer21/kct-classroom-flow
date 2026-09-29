// src/services/voice/speechRecognition.ts
/**
 * Wrapper around the native Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Provides a simple, type‑safe way to obtain a SpeechRecognition instance and to
 * check for browser support and permission state without scattering the detection logic throughout the
 * component code.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

export interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

export interface SpeechRecognitionErrorEvent {
  error: string;
}

export interface SpeechRecognitionWrapper {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export type VoicePermissionState =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "denied"
  | "error"
  | "unsupported"
  | "prompt"
  | "granted";

export interface VoicePermissionMessages {
  prompt: string;
  listening: string;
  denied: string;
  unsupported: string;
}

export const VOICE_MESSAGES: VoicePermissionMessages = {
  prompt: "Click the microphone to start",
  listening: "Listening... Speak now",
  denied: "Microphone access is blocked. Allow it in your browser settings and try again.",
  unsupported: "Voice input isn't supported in this browser.",
};

export const BLOCKED_MICROPHONE_MSG =
  "Microphone access is blocked. Please allow microphone access for KCT Pulse in your browser site settings and try again.";

/**
 * Returns true if the current environment supports the Web Speech API.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as any;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Creates and returns a SpeechRecognition instance configured with the given
 * language. If the API is not available, `null` is returned.
 *
 * @param language BCP‑47 language tag (e.g. "en-US"). Defaults to "en-US".
 */
export function getSpeechRecognition(
  language: string = "en-US",
): SpeechRecognitionWrapper | null {
  if (!isSpeechRecognitionSupported()) return null;

  const win = window as any;
  const SpeechRecognitionConstructor =
    win.SpeechRecognition || win.webkitSpeechRecognition;

  const instance = new SpeechRecognitionConstructor() as SpeechRecognitionWrapper;
  instance.continuous = true;
  instance.interimResults = true;
  instance.lang = language;
  instance.onstart = null;
  instance.onresult = null;
  instance.onerror = null;
  instance.onend = null;

  return instance;
}

export interface UseVoiceRecognitionOptions {
  language?: string;
  appendMode?: boolean;
  currentValue?: string;
  onTranscriptFinal?: (text: string) => void;
  onTranscriptChange?: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
}

/**
 * Reusable hook for Web Speech API recognition and graceful browser permission handling.
 * Works seamlessly across both Question Voice Input and PULSE AI Assistant.
 */
export function useVoiceRecognition({
  language = "en-US",
  appendMode = true,
  currentValue = "",
  onTranscriptFinal,
  onTranscriptChange,
  onListeningChange,
}: UseVoiceRecognitionOptions = {}) {
  const [permissionState, setPermissionState] = useState<VoicePermissionState>(() => {
    if (typeof window === "undefined" || !isSpeechRecognitionSupported()) {
      return "unsupported";
    }
    return "idle";
  });

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionWrapper | null>(null);

  // Sync listening state change to caller if callback provided
  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  // Monitor browser permission state changes passively
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isSpeechRecognitionSupported()) {
      setPermissionState("unsupported");
      return;
    }

    let permStatus: PermissionStatus | null = null;
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          permStatus = status;
          const syncState = (s: PermissionState) => {
            if (s === "granted") {
              setPermissionState((prev) => (prev === "listening" ? "listening" : "granted"));
            } else if (s === "denied") {
              setPermissionState("denied");
            } else {
              setPermissionState((prev) => (prev === "listening" ? "listening" : "idle"));
            }
          };

          syncState(status.state);
          status.onchange = () => {
            syncState(status.state);
          };
        })
        .catch((err) => {
          console.warn("[Voice Input] navigator.permissions.query unavailable:", err);
        });
    }

    return () => {
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, []);

  // Cleanup active recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setPermissionState((prev) => (prev === "listening" ? "idle" : prev));
  }, []);

  /**
   * Internal routine to instantiate and start SpeechRecognition
   * once microphone permission is established.
   */
  const startRecognition = useCallback(() => {
    // Clean up previous instance if running
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = getSpeechRecognition(language);
      if (!recognition) {
        setPermissionState("unsupported");
        toast.error(VOICE_MESSAGES.unsupported);
        return;
      }

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsListening(true);
        setPermissionState("listening");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcriptChunk;
          } else {
            currentInterim += transcriptChunk;
          }
        }

        setInterimTranscript(currentInterim);

        if (finalChunk.trim()) {
          const newCombined =
            appendMode && currentValue.trim()
              ? `${currentValue.trim()} ${finalChunk.trim()}`
              : finalChunk.trim();

          onTranscriptFinal?.(newCombined);
          onTranscriptChange?.(newCombined);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("[Voice Input] Speech recognition error event:", event.error);
        setIsListening(false);

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          // Native browser permission was denied or blocked
          setPermissionState("denied");
          toast.error(BLOCKED_MICROPHONE_MSG);
        } else if (event.error === "no-speech") {
          // Silence timeout, stay ready
          setPermissionState("idle");
        } else {
          setPermissionState("error");
          toast.error(`Voice dictation error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        setPermissionState((prev) => (prev === "listening" ? "idle" : prev));
      };

      recognitionRef.current = recognition;
      setInterimTranscript("");
      recognition.start();
    } catch (err: unknown) {
      console.error("[Voice Input] Failed to start recognition:", err);
      setIsListening(false);
      setPermissionState("error");
      toast.error("Could not activate microphone. Check browser permissions.");
    }
  }, [language, appendMode, currentValue, onTranscriptFinal, onTranscriptChange]);

  /**
   * Primary entry point invoked exclusively via user microphone click.
   * Requests getUserMedia({ audio: true }) to trigger native browser prompt on first use,
   * immediately stops temporary media tracks, then initiates SpeechRecognition.
   */
  const startListening = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      setPermissionState("unsupported");
      toast.error(VOICE_MESSAGES.unsupported);
      return;
    }

    // Do NOT repeatedly request permission when user already selected Block
    if (permissionState === "denied") {
      toast.error(BLOCKED_MICROPHONE_MSG);
      return;
    }

    // If permission was already granted, do not unnecessarily request permission again; start immediately
    if (permissionState === "granted") {
      startRecognition();
      return;
    }

    // If getUserMedia is unavailable in environment, fall back safely to SpeechRecognition directly
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      startRecognition();
      return;
    }

    setPermissionState("requesting-permission");

    try {
      // 1. Explicitly request microphone permission via getUserMedia directly on user click
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Stop temporary MediaStream tracks immediately to release the audio hardware
      stream.getTracks().forEach((track) => track.stop());

      setPermissionState("granted");

      // Then start the existing Web Speech API recognition
      startRecognition();
    } catch (err: any) {
      console.warn("[Voice Input] getUserMedia error:", err);
      setIsListening(false);

      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        err?.message?.includes?.("denied")
      ) {
        // User denied permission in browser prompt or origin is blocked
        setPermissionState("denied");
        toast.error(BLOCKED_MICROPHONE_MSG);
      } else {
        setPermissionState("error");
        toast.error("Microphone access could not be acquired.");
      }
    }
  }, [permissionState, startRecognition]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  const clearInterim = useCallback(() => {
    setInterimTranscript("");
  }, []);

  return {
    permissionState,
    isListening,
    interimTranscript,
    isSupported: permissionState !== "unsupported",
    startListening,
    stopListening,
    toggleListening,
    clearInterim,
  };
}
