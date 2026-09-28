/**
 * voice-input-button.tsx
 * Speech-to-Text Dictation & Real-Time Transcript Preview Component for KCT PULSE.
 * Uses Web Speech API (webkitSpeechRecognition / SpeechRecognition) to transcribe
 * spoken audio in real time, rendering a live transcript preview bubble and auto-filling
 * input fields for hands-free answer submission and prompt dictation.
 */

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Check, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  SpeechRecognitionWrapper,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/services/voice/speechRecognition";

interface VoiceInputButtonProps {
  onTranscriptFinal: (text: string) => void;
  onTranscriptChange?: (text: string) => void;
  currentValue?: string;
  className?: string;
  buttonText?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  appendMode?: boolean; // If true, appends transcribed text to currentValue
  language?: string; // Language code (default 'en-US')
}

export function VoiceInputButton({
  onTranscriptFinal,
  onTranscriptChange,
  currentValue = "",
  className,
  buttonText = "Voice Input",
  size = "sm",
  variant = "outline",
  appendMode = true,
  language = "en-US",
}: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionWrapper | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Support already checked above
    // Proceed to create recognition instance

    try {
      const recognition = getSpeechRecognition(language);
      if (!recognition) {
        setIsSupported(false);
        return;
      }
      // Configuration handled by wrapper; ensure properties are set for safety
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

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

          onTranscriptFinal(newCombined);
          if (onTranscriptChange) {
            onTranscriptChange(newCombined);
          }
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
        toast.success("Listening... Speak your answer now 🎙️");
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("[Voice Input] Speech recognition error:", event.error);
        setIsListening(false);
        if (event.error === "not-allowed") {
          toast.error(
            "Microphone permission blocked. Please allow microphone access in your browser settings (click 🔒 in address bar).",
          );
        } else if (event.error !== "no-speech") {
          toast.error(`Voice dictation error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;
    } catch (err: unknown) {
      console.error("[Voice Input] Failed to initialize SpeechRecognition:", err);
      setIsSupported(false);
    }
  }, [language, appendMode, currentValue, onTranscriptFinal, onTranscriptChange]);

  const toggleListening = () => {
    if (!isSupported) {
      toast.error(
        "Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.",
      );
      return;
    }

    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      toast.info("Voice input stopped.");
    } else {
      try {
        setInterimTranscript("");
        recognitionRef.current.start();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to start voice recognition:", msg);
        toast.error("Could not activate microphone. Check browser permissions.");
        setIsListening(false);
      }
    }
  };

  const handleAcceptInterim = () => {
    if (interimTranscript.trim()) {
      const finalVal =
        appendMode && currentValue.trim()
          ? `${currentValue.trim()} ${interimTranscript.trim()}`
          : interimTranscript.trim();
      onTranscriptFinal(finalVal);
      setInterimTranscript("");
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      toast.success("Transcript added to input field!");
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="relative inline-flex items-center">
      <Button
        type="button"
        variant={isListening ? "destructive" : variant}
        size={size}
        onClick={toggleListening}
        className={cn(
          "gap-2 transition-all font-semibold select-none",
          isListening && "animate-pulse shadow-lg shadow-rose-500/20",
          className,
        )}
        title={isListening ? "Stop listening" : "Click to dictate by voice"}
      >
        {isListening ? (
          <>
            <MicOff className="h-4 w-4 text-white animate-bounce" />
            <span className="text-xs">Listening...</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 text-primary" />
            {size !== "icon" && <span className="text-xs">{buttonText}</span>}
          </>
        )}
      </Button>

      {/* Floating Live Transcript Preview Card */}
      {isListening && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 glass rounded-2xl p-3 shadow-2xl border border-primary/40 bg-card/95 backdrop-blur-xl animate-in fade-in zoom-in-95 space-y-2">
          <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 animate-pulse text-rose-500" /> Live Transcript
              Preview
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
          </div>

          <div className="text-xs font-medium text-foreground bg-background/60 p-2.5 rounded-xl border border-border/50 min-h-[42px] max-h-24 overflow-y-auto italic">
            {interimTranscript.trim() ? (
              <span>"{interimTranscript}"</span>
            ) : (
              <span className="text-muted-foreground not-italic flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-spin" /> Speak now... your
                speech will appear here.
              </span>
            )}
          </div>

          {interimTranscript.trim() && (
            <Button
              type="button"
              size="sm"
              onClick={handleAcceptInterim}
              className="w-full h-7 text-[11px] gradient-bg font-bold gap-1"
            >
              <Check className="h-3 w-3" /> Insert Transcript Now
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
