/**
 * theme-toggle.tsx
 * Dark-only theme enforcement for KCT PULSE.
 *
 * This application uses a dark-only design. Light mode is intentionally
 * disabled. The "ThemeToggle" component still exists for backward compatibility
 * with call sites throughout the codebase but renders nothing — it no longer
 * presents a clickable control to the user.
 *
 * applyTheme() and getStoredTheme() are kept for the inline script in
 * __root.tsx which must be able to import them.
 */

export type Theme = "dark";

/** Always returns "dark". localStorage is normalised on first run. */
export function getStoredTheme(): Theme {
  if (typeof window !== "undefined") {
    // Overwrite any stored "light" preference so future page loads start dark.
    try {
      localStorage.setItem("theme", "dark");
    } catch {
      // Storage might be unavailable in some environments.
    }
  }
  return "dark";
}

/** Enforces the dark class on the document root and persists the preference. */
export function applyTheme(_theme?: Theme) {
  if (typeof window === "undefined") return;
  document.documentElement.classList.add("dark");
  try {
    localStorage.setItem("theme", "dark");
  } catch {
    // Ignore storage errors.
  }
}

/** No-op: toggling to light is not supported. Returns "dark". */
export function toggleTheme(): Theme {
  applyTheme("dark");
  return "dark";
}

export function useTheme() {
  return {
    theme: "dark" as Theme,
    setTheme: applyTheme,
    toggleTheme,
    isDark: true,
  };
}

interface ThemeToggleProps {
  variant?: "ghost" | "outline" | "default" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  className?: string;
}

/**
 * ThemeToggle — renders nothing.
 * The application is dark-only; no toggle is presented to the user.
 * This component is retained so existing import sites do not break.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ThemeToggle(_props: ThemeToggleProps) {
  return null;
}
