/**
 * voice-input-button.tsx
 * Speech-to-Text Dictation & Real-Time Transcript Preview Component for KCT PULSE.
 * Uses Web Speech API (webkitSpeechRecognition / SpeechRecognition) with graceful
 * browser permission handling and animated voice waveform visualization.
 */

import { Mic, MicOff, Check, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useVoiceRecognition,
  VOICE_MESSAGES,
} from "@/services/voice/speechRecognition";
import { VoiceWaveform } from "@/components/voice/voice-waveform";

interface VoiceInputButtonProps {
  onTranscriptFinal: (text: string) => void;
  onTranscriptChange?: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
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
  onListeningChange,
  currentValue = "",
  className,
  buttonText = "Voice Input",
  size = "sm",
  variant = "outline",
  appendMode = true,
  language = "en-US",
}: VoiceInputButtonProps) {
  const {
    permissionState,
    isListening,
    interimTranscript,
    isSupported,
    toggleListening,
    stopListening,
    clearInterim,
  } = useVoiceRecognition({
    language,
    appendMode,
    currentValue,
    onTranscriptFinal,
    onTranscriptChange,
    onListeningChange,
  });

  // Handle manual insert of interim transcript
  const handleAcceptInterim = () => {
    if (interimTranscript.trim()) {
      const finalVal =
        appendMode && currentValue.trim()
          ? `${currentValue.trim()} ${interimTranscript.trim()}`
          : interimTranscript.trim();
      onTranscriptFinal(finalVal);
      clearInterim();
      stopListening();
      toast.success("Transcript added to input field!");
    }
  };

  // Determine button title / tooltip matching state requirements
  const getButtonTitle = () => {
    switch (permissionState) {
      case "unsupported":
        return VOICE_MESSAGES.unsupported;
      case "listening":
        return VOICE_MESSAGES.listening;
      case "requesting-permission":
        return "Requesting microphone permission...";
      case "denied":
        return VOICE_MESSAGES.denied;
      case "error":
        return "Voice input error. Click to retry";
      case "idle":
      case "prompt":
      case "granted":
      default:
        return isListening ? VOICE_MESSAGES.listening : VOICE_MESSAGES.prompt;
    }
  };

  // Render disabled state when browser does not support Web Speech API
  if (!isSupported) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled
        aria-label="Voice input not supported"
        className={cn(
          "gap-2 opacity-50 cursor-not-allowed select-none",
          className,
        )}
        title={VOICE_MESSAGES.unsupported}
      >
        <MicOff className="h-4 w-4 text-muted-foreground" />
        {size !== "icon" && <span className="text-xs">{buttonText}</span>}
      </Button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <Button
        type="button"
        variant={isListening ? "destructive" : variant}
        size={size}
        onClick={toggleListening}
        aria-label={isListening ? "Stop voice input" : "Start voice input"}
        className={cn(
          "gap-2 transition-all font-semibold select-none",
          isListening && "animate-pulse shadow-lg shadow-rose-500/20",
          permissionState === "denied" && "border-destructive/40 text-muted-foreground",
          className,
        )}
        title={getButtonTitle()}
      >
        {isListening ? (
          <>
            <MicOff className="h-4 w-4 text-white animate-bounce shrink-0" />
            {size !== "icon" && (
              <>
                <VoiceWaveform active={isListening} compact={true} />
                <span className="text-xs">Listening...</span>
              </>
            )}
          </>
        ) : (
          <>
            <Mic
              className={cn(
                "h-4 w-4",
                permissionState === "denied" ? "text-destructive/70" : "text-primary",
              )}
            />
            {size !== "icon" && <span className="text-xs">{buttonText}</span>}
          </>
        )}
      </Button>

      {/* Floating Live Transcript Preview Card */}
      {isListening && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-80 glass rounded-2xl p-3 shadow-2xl border border-primary/40 bg-card/95 backdrop-blur-xl animate-in fade-in zoom-in-95 space-y-2">
          <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 animate-pulse text-cyan-400" /> Live Transcript Preview
            </span>
            <VoiceWaveform active={isListening} compact={true} />
          </div>

          <div className="text-xs font-medium text-foreground bg-background/60 p-2.5 rounded-xl border border-border/50 min-h-[42px] max-h-24 overflow-y-auto italic">
            {interimTranscript.trim() ? (
              <span>"{interimTranscript}"</span>
            ) : (
              <span className="text-muted-foreground not-italic flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-spin" /> {VOICE_MESSAGES.listening}
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
