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
  fallbackId?: string | null
): string {
  if (displayName && displayName.trim() && displayName.trim().toLowerCase() !== "faculty") {
    return displayName.trim();
  }

  if (email && email.includes("@")) {
    const handle = email.split("@")[0];
    const words = handle.split(/[._-]/).filter(Boolean);
    if (words.length > 0) {
      return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  if (fallbackId) {
    const shortId = fallbackId.slice(0, 6).toUpperCase();
    return `Faculty Member (${shortId})`;
  }

  return "Faculty Member";
}

