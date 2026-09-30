import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a display name from an explicit display name, email address, or fallback ID.
 * Transforms email handles like `tharun.n.e` or `faculty_ubxv9y` into title-cased names like `Tharun N E` or `Faculty Ubxv9y`.
 */
export function formatDisplayName(
  displayName?: string | null,
  email?: string | null,
  fallbackId?: string | null,
): string {
  if (displayName && displayName.trim() && displayName.trim().toLowerCase() !== "faculty") {
    return displayName.trim();
  }

  if (email && email.includes("@")) {
    const handle = email.split("@")[0];
    const words = handle.split(/[._-]/).filter(Boolean);
    if (words.length > 0) {
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }

  if (fallbackId) {
    const shortId = fallbackId.slice(0, 6).toUpperCase();
    return `Faculty Member (${shortId})`;
  }

  return "Faculty Member";
}

/**
 * Resolves and formats a student's display name from their participant record.
 * Filters out accidental greetings or placeholder strings (such as "Hi", "Hello", "Hey", "Test")
 * so the faculty view displays a genuine student identity or a clear safe fallback.
 *
 * Preference order:
 * 1. Student name (if valid and not a trivial greeting/placeholder)
 * 2. Existing safe fallback ("Anonymous Student" or "Anonymous Student (ABCD)")
 */
export function formatStudentDisplayName(
  rawName?: string | null,
  fallbackId?: string | null,
): string {
  if (!rawName) {
    if (fallbackId) {
      return `Anonymous Student (${fallbackId.slice(0, 4).toUpperCase()})`;
    }
    return "Anonymous Student";
  }

  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // Trivial greetings, single-word filler or placeholders that testers or students might type
  const TRIVIAL_PLACEHOLDERS = new Set([
    "hi",
    "hello",
    "hey",
    "hola",
    "test",
    "testing",
    "guest",
    "anonymous",
    "anon",
    "null",
    "undefined",
  ]);

  if (TRIVIAL_PLACEHOLDERS.has(lower)) {
    if (fallbackId) {
      return `Anonymous Student (${fallbackId.slice(0, 4).toUpperCase()})`;
    }
    return "Anonymous Student";
  }

  return trimmed;
}

/**
 * Creates a throttled function that only invokes `fn` at most once per every `waitMs` milliseconds.
 * Preserves the trailing invocation if multiple calls were made within the window.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, waitMs);
    } else {
      lastArgs = args;
    }
  };
}
