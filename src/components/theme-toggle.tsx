import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  // Also check document root class if localStorage not set yet
  if (document.documentElement.classList.contains("dark")) return "dark";
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event("theme-change"));
}

export function toggleTheme(): Theme {
  const current = getStoredTheme();
  const next: Theme = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(getStoredTheme());

    const handleThemeChange = () => {
      setThemeState(getStoredTheme());
    };

    window.addEventListener("theme-change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);
    return () => {
      window.removeEventListener("theme-change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  return {
    theme,
    setTheme: applyTheme,
    toggleTheme,
    isDark: theme === "dark",
  };
}

interface ThemeToggleProps {
  variant?: "ghost" | "outline" | "default" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({
  variant = "ghost",
  size,
  showLabel = false,
  className,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const buttonSize = size || (showLabel ? "default" : "icon");

  return (
    <Button
      type="button"
      variant={variant}
      size={buttonSize}
      onClick={toggleTheme}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={cn(
        "relative transition-all duration-300 cursor-pointer",
        className
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-indigo-600 transition-transform duration-300 hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="ml-2 text-sm font-medium">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </Button>
  );
}
