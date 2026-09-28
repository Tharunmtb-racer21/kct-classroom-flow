// src/services/voice/speechRecognition.ts
/**
 * Wrapper around the native Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Provides a simple, type‑safe way to obtain a SpeechRecognition instance and to
 * check for browser support without scattering the detection logic throughout the
 * component code.
 */

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
