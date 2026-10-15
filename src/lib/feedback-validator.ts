/**
 * feedback-validator.ts
 * Centralised, client-side feedback validation for KCT PULSE.
 *
 * Security note: This is a usability guard only.
 * Web3Forms / Supabase are the last line of defence.
 * Never trust these checks as a security boundary.
 */

export interface FieldValidationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of meaningful (letter) characters required in a name. */
const NAME_MIN_LETTERS = 2;
/** Maximum length of the full name field (characters). */
const NAME_MAX_LENGTH = 100;
/** Minimum meaningful message length after trimming. */
const MESSAGE_MIN_LENGTH = 10;
/** Maximum message length we accept. */
const MESSAGE_MAX_LENGTH = 2000;
/** Minimum elapsed seconds between form open and submission (honeypot timing). */
export const MIN_SUBMISSION_SECONDS = 3;

// ---------------------------------------------------------------------------
// Name Validation
// ---------------------------------------------------------------------------

/**
 * Validates a full-name field according to the rules:
 * - Trim + normalise repeated internal whitespace.
 * - Must contain >= NAME_MIN_LETTERS Unicode letter characters.
 * - Must not consist only of punctuation / symbols / digits.
 * - Must not exceed NAME_MAX_LENGTH characters.
 * - Permits Unicode letters (e.g. Indian names), spaces, hyphens, apostrophes.
 */
export function validateName(raw: string): FieldValidationResult {
  const trimmed = raw.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return { ok: false, error: "Please enter your name." };
  }

  if (trimmed.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  // Count Unicode letter characters (covers Latin, Devanagari, Tamil, Arabic, etc.)
  const letterCount = [...trimmed].filter((ch) => /\p{L}/u.test(ch)).length;

  if (letterCount < NAME_MIN_LETTERS) {
    return {
      ok: false,
      error:
        "Please enter a real name with at least two letters. Single characters, punctuation marks, and symbol-only entries are not accepted.",
    };
  }

  // Detect repeated-character spam (e.g. "aaaaaaaaaa", "zzxcvbnm,./")
  if (trimmed.replace(/[\s\-'.]/g, "").length >= 8) {
    const noSpace = trimmed.replace(/[\s\-'.]/g, "");
    const uniqueLetters = new Set([...noSpace].filter((c) => /\p{L}/u.test(c)));
    if (uniqueLetters.size <= 2 && noSpace.length >= 8) {
      return {
        ok: false,
        error: "That does not look like a valid name. Please enter your real name.",
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Email Validation
// ---------------------------------------------------------------------------

/**
 * Validates an email address:
 * - Trim + lowercase for consistent comparison.
 * - Must match a structurally valid email pattern.
 * - Must have a domain with a real TLD (>= 2 chars).
 * - Rejects placeholder-like local parts.
 */
export function validateEmail(raw: string): FieldValidationResult & { normalised?: string } {
  const trimmed = raw.trim().toLowerCase();

  if (!trimmed) {
    return { ok: false, error: "Please enter your email address." };
  }

  const emailRegex = /^[^\s@][^\s@]*@[^\s@]+\.[a-z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { ok: false, error: "Please enter a valid email address (e.g. name@domain.com)." };
  }

  const [local] = trimmed.split("@");
  const localLetterCount = [...local].filter((ch) => /[a-z]/i.test(ch)).length;
  if (localLetterCount < 2) {
    return {
      ok: false,
      error:
        "That email address does not look real. Please use a valid address where we can reach you.",
    };
  }

  return { ok: true, normalised: trimmed };
}

// ---------------------------------------------------------------------------
// Message Validation
// ---------------------------------------------------------------------------

/**
 * Validates the feedback message body:
 * - Trim input.
 * - Reject empty / too short.
 * - Reject messages with no meaningful alphanumeric or Unicode-letter content.
 * - Reject repeated-character or punctuation-only spam.
 * - Enforce maximum length.
 */
export function validateMessage(raw: string): FieldValidationResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "Please write your message before sending." };
  }

  if (trimmed.length < MESSAGE_MIN_LENGTH) {
    return {
      ok: false,
      error: `Message is too short. Please provide at least ${MESSAGE_MIN_LENGTH} characters.`,
    };
  }

  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message is too long. Please keep it under ${MESSAGE_MAX_LENGTH} characters.`,
    };
  }

  const hasLetterOrDigit = /[\p{L}\d]/u.test(trimmed);
  if (!hasLetterOrDigit) {
    return {
      ok: false,
      error:
        "Your message appears to contain only punctuation or symbols. Please write a real message.",
    };
  }

  // Detect trivial repeated-character spam
  const uniqueChars = new Set([...trimmed.replace(/\s/g, "")]);
  if (uniqueChars.size <= 2 && trimmed.replace(/\s/g, "").length > 8) {
    return {
      ok: false,
      error: "Your message looks like automated input. Please describe your feedback in words.",
    };
  }

  // Detect keyboard-mash: long string with only 3-4 unique letters
  const letterChars = [...trimmed].filter((c) => /\p{L}/u.test(c));
  if (letterChars.length >= 12) {
    const uniqueLetters = new Set(letterChars.map((c) => c.toLowerCase()));
    if (uniqueLetters.size <= 3) {
      return {
        ok: false,
        error: "Your message does not look like real text. Please write a meaningful message.",
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Participant / Dashboard Name Sanitisation
// ---------------------------------------------------------------------------

/**
 * Returns a sanitised display name for a participant entry in the dashboard.
 * If the stored name is missing, blank, or fails the letter-count check,
 * returns the provided fallback (default: "Unknown Participant").
 * Does NOT modify stored data; this is display-only.
 */
export function sanitiseParticipantDisplayName(
  rawName: string | null | undefined,
  fallback = "Unknown Participant",
): string {
  if (!rawName) return fallback;
  const trimmed = rawName.trim();
  if (!trimmed) return fallback;
  const letterCount = [...trimmed].filter((ch) => /\p{L}/u.test(ch)).length;
  if (letterCount < NAME_MIN_LETTERS) return fallback;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Full Feedback Payload Validation
// ---------------------------------------------------------------------------

export interface FeedbackPayload {
  name: string;
  email: string;
  message: string;
}

export interface FeedbackValidationResult {
  ok: boolean;
  normalisedName?: string;
  normalisedEmail?: string;
  normalisedMessage?: string;
  errors: { name?: string; email?: string; message?: string };
}

/**
 * Validates all three feedback fields together and returns normalised values
 * when valid. Collects all errors so the UI can show them simultaneously.
 */
export function validateFeedbackPayload(payload: FeedbackPayload): FeedbackValidationResult {
  const nameResult = validateName(payload.name);
  const emailResult = validateEmail(payload.email);
  const messageResult = validateMessage(payload.message);

  const errors: FeedbackValidationResult["errors"] = {};
  if (!nameResult.ok) errors.name = nameResult.error;
  if (!emailResult.ok) errors.email = emailResult.error;
  if (!messageResult.ok) errors.message = messageResult.error;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: {},
    normalisedName: payload.name.trim().replace(/\s+/g, " "),
    normalisedEmail: emailResult.normalised,
    normalisedMessage: payload.message.trim(),
  };
}
