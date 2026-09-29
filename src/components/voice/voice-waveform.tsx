/**
 * voice-waveform.tsx
 * Reusable animated voice-listening waveform component for KCT Pulse.
 * Pure React + CSS animation using transform: scaleY(...) without canvas or JS loops.
 * Complies with accessibility (aria-hidden) and prefers-reduced-motion standards.
 */

import React from "react";
import { cn } from "@/lib/utils";

export interface VoiceWaveformProps {
  /** Whether active listening is currently occurring */
  active: boolean;
  /** True for compact inline controls (microphone button), false for larger assistant banner */
  compact?: boolean;
  /** Additional custom class names for the container */
  className?: string;
}

interface BarConfig {
  baseHeight: number; // percentage 1-100
  duration: number; // in seconds
  delay: number; // in seconds (negative for instant asynchronous offset)
}

// 20 vertical bars with varied heights and asynchronous oscillation timings
const BARS_DATA: BarConfig[] = [
  { baseHeight: 35, duration: 0.95, delay: -0.1 },
  { baseHeight: 60, duration: 1.15, delay: -0.6 },
  { baseHeight: 45, duration: 0.85, delay: -0.3 },
  { baseHeight: 80, duration: 1.3, delay: -0.85 },
  { baseHeight: 65, duration: 1.0, delay: -0.2 },
  { baseHeight: 95, duration: 1.25, delay: -0.7 },
  { baseHeight: 70, duration: 0.9, delay: -0.4 },
  { baseHeight: 100, duration: 1.2, delay: -0.9 },
  { baseHeight: 85, duration: 0.8, delay: -0.15 },
  { baseHeight: 90, duration: 1.1, delay: -0.5 },
  { baseHeight: 95, duration: 1.05, delay: -0.35 },
  { baseHeight: 85, duration: 0.85, delay: -0.75 },
  { baseHeight: 100, duration: 1.35, delay: -0.25 },
  { baseHeight: 65, duration: 0.95, delay: -0.65 },
  { baseHeight: 80, duration: 1.15, delay: -0.45 },
  { baseHeight: 55, duration: 0.8, delay: -0.15 },
  { baseHeight: 75, duration: 1.25, delay: -0.8 },
  { baseHeight: 45, duration: 1.0, delay: -0.3 },
  { baseHeight: 60, duration: 0.9, delay: -0.55 },
  { baseHeight: 35, duration: 1.1, delay: -0.2 },
];

export function VoiceWaveform({
  active,
  compact = false,
  className,
}: VoiceWaveformProps) {
  // Use 16 bars for compact inline controls, full 20 for assistant display
  const bars = compact ? BARS_DATA.slice(2, 18) : BARS_DATA;

  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={cn(
        "inline-flex items-center justify-center select-none pointer-events-none transition-all duration-300",
        compact ? "h-5 gap-[2px] px-1" : "h-8 gap-1 px-2",
        active ? "opacity-100" : "opacity-30",
        className,
      )}
    >
      <style>{`
        @keyframes voiceWaveScale {
          0%, 100% {
            transform: scaleY(0.18);
          }
          50% {
            transform: scaleY(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .voice-wave-bar-pulse {
            animation: none !important;
            transform: scaleY(0.5) !important;
          }
        }
      `}</style>

      {bars.map((bar, index) => {
        const heightStyle = `${bar.baseHeight}%`;

        return (
          <span
            key={index}
            className={cn(
              "voice-wave-bar-pulse block rounded-full transition-transform origin-center",
              compact ? "w-[2px]" : "w-[3.5px]",
              active
                ? "bg-gradient-to-t from-cyan-500 via-teal-300 to-white shadow-[0_0_6px_rgba(34,211,238,0.55)]"
                : "bg-muted-foreground/35",
            )}
            style={{
              height: heightStyle,
              animation: active
                ? `voiceWaveScale ${bar.duration}s ease-in-out infinite alternate ${bar.delay}s`
                : "none",
              transform: active ? undefined : "scaleY(0.2)",
              willChange: active ? "transform" : "auto",
            }}
          />
        );
      })}
    </div>
  );
}
export default VoiceWaveform;
