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
  | "unsupported"
  | "prompt"
  | "granted"
  | "denied"
  | "listening"
  | "error";

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
    return "prompt";
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
              setPermissionState((prev) => (prev === "listening" ? "listening" : "prompt"));
            }
          };

          syncState(status.state);
          status.onchange = () => {
            syncState(status.state);
          };
        })
        .catch((err) => {
          console.warn("[Voice Input] navigator.permissions.query unavailable:", err);
          setPermissionState((prev) => (prev === "unsupported" ? "unsupported" : "prompt"));
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
    setPermissionState((prev) => (prev === "listening" ? "granted" : prev));
  }, []);

  /**
   * Starts recognition synchronously within user gesture.
   * If permission is 'prompt', browser presents native permission prompt.
   * If permission is 'denied', notifies user to update settings without repeated prompts.
   */
  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setPermissionState("unsupported");
      toast.error(VOICE_MESSAGES.unsupported);
      return;
    }

    // Do NOT repeatedly show browser permission prompt when blocked/denied
    if (permissionState === "denied") {
      toast.error(BLOCKED_MICROPHONE_MSG);
      return;
    }

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
          // Silence timeout, stay ready in granted/prompt state
          setPermissionState((prev) => (prev === "listening" ? "granted" : prev));
        } else {
          setPermissionState("error");
          toast.error(`Voice dictation error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        setPermissionState((prev) => (prev === "listening" ? "granted" : prev));
      };

      recognitionRef.current = recognition;
      setInterimTranscript("");

      // CRITICAL: Call recognition.start() synchronously inside user gesture!
      recognition.start();
    } catch (err: unknown) {
      console.error("[Voice Input] Failed to start recognition:", err);
      setIsListening(false);
      setPermissionState("error");
      toast.error("Could not activate microphone. Check browser permissions.");
    }
  }, [language, appendMode, currentValue, onTranscriptFinal, onTranscriptChange, permissionState]);

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
