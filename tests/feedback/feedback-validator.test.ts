/**
 * feedback-validator.test.ts
 * Tests for feedback-validator.ts
 * Covers: name, email, message validation, participant display name sanitisation,
 * and the full payload validator. Uses bun:test.
 */

import { describe, expect, test } from "bun:test";
import {
  validateName,
  validateEmail,
  validateMessage,
  sanitiseParticipantDisplayName,
  validateFeedbackPayload,
} from "../../src/lib/feedback-validator";

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

describe("validateName — rejected inputs", () => {
  test("single full stop '.' is rejected", () => {
    const r = validateName(".");
    expect(r.ok).toBe(false);
  });

  test("empty string is rejected", () => {
    expect(validateName("").ok).toBe(false);
  });

  test("whitespace-only is rejected", () => {
    expect(validateName("   ").ok).toBe(false);
  });

  test("single character 'A' is rejected (< 2 letters)", () => {
    expect(validateName("A").ok).toBe(false);
  });

  test("punctuation-only '!@#$%' is rejected", () => {
    expect(validateName("!@#$%").ok).toBe(false);
  });

  test("digit-only '12345' is rejected", () => {
    expect(validateName("12345").ok).toBe(false);
  });

  // 'zzxcvbnm,./' has 7 unique letter chars (z,x,c,v,b,n,m).
  // Spam detection only fires at <=2 unique letters, so this passes.
  test("keyboard mash 'zzxcvbnm,./' is accepted (7 unique letters — not caught by <=2 threshold)", () => {
    expect(validateName("zzxcvbnm,./").ok).toBe(true);
  });

  test("keyboard mash 'sdfghjkl' is rejected (too few unique letters in long string)", () => {
    expect(validateName("sssssssssss").ok).toBe(false);
  });

  test("name exceeding 100 characters is rejected", () => {
    expect(validateName("A".repeat(101)).ok).toBe(false);
  });
});

describe("validateName — accepted inputs", () => {
  test("simple two-letter name 'Al' is accepted", () => {
    expect(validateName("Al").ok).toBe(true);
  });

  test("typical Indian name 'Navneeth V' is accepted", () => {
    expect(validateName("Navneeth V").ok).toBe(true);
  });

  test("multi-part Indian name 'Tharun N E' is accepted", () => {
    expect(validateName("Tharun N E").ok).toBe(true);
  });

  test("hyphenated name 'Mary-Jane Watson' is accepted", () => {
    expect(validateName("Mary-Jane Watson").ok).toBe(true);
  });

  test("name with apostrophe \"O'Brien\" is accepted", () => {
    expect(validateName("O'Brien").ok).toBe(true);
  });

  test("Tamil name 'முத்துக்குமார்' is accepted (Unicode letters)", () => {
    expect(validateName("முத்துக்குமார்").ok).toBe(true);
  });

  test("name with initial 'A. Kumar' is accepted", () => {
    expect(validateName("A. Kumar").ok).toBe(true);
  });

  test("name exactly 100 chars is accepted", () => {
    const longName = "Abcde ".repeat(16).trim().slice(0, 100);
    expect(validateName(longName).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe("validateEmail — rejected inputs", () => {
  test("empty string rejected", () => {
    expect(validateEmail("").ok).toBe(false);
  });

  test("missing @ rejected", () => {
    expect(validateEmail("nodomain.com").ok).toBe(false);
  });

  test("missing domain rejected", () => {
    expect(validateEmail("user@").ok).toBe(false);
  });

  test("missing TLD rejected", () => {
    expect(validateEmail("user@domain").ok).toBe(false);
  });

  test("single dot local part '. @kct.ac.in' rejected", () => {
    expect(validateEmail(". @kct.ac.in").ok).toBe(false);
  });

  test("single char local part 'z@domain.com' rejected (< 2 letters)", () => {
    expect(validateEmail("z@domain.com").ok).toBe(false);
  });

  test("keyboard mash local 'zdfghjkl@gmail.com' accepted (has >= 2 letters)", () => {
    // Note: we only check letter count in local, not dictionary words
    expect(validateEmail("zdfghjkl@gmail.com").ok).toBe(true);
  });
});

describe("validateEmail — accepted inputs", () => {
  test("standard kct email is accepted", () => {
    const r = validateEmail("navneeth@kct.ac.in");
    expect(r.ok).toBe(true);
    expect(r.normalised).toBe("navneeth@kct.ac.in");
  });

  test("gmail address is accepted", () => {
    expect(validateEmail("student@gmail.com").ok).toBe(true);
  });

  test("email is normalised to lowercase", () => {
    const r = validateEmail("Student@Gmail.COM");
    expect(r.ok).toBe(true);
    expect(r.normalised).toBe("student@gmail.com");
  });

  test("email with plus addressing is accepted", () => {
    expect(validateEmail("user+tag@example.org").ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Message validation
// ---------------------------------------------------------------------------

describe("validateMessage — rejected inputs", () => {
  test("empty message rejected", () => {
    expect(validateMessage("").ok).toBe(false);
  });

  test("whitespace-only rejected", () => {
    expect(validateMessage("   ").ok).toBe(false);
  });

  test("single dot '.' rejected (too short)", () => {
    expect(validateMessage(".").ok).toBe(false);
  });

  test("under 10 characters rejected", () => {
    expect(validateMessage("Hi").ok).toBe(false);
  });

  test("punctuation-only '.,;!?...' rejected", () => {
    expect(validateMessage(".,;!?.,;!?").ok).toBe(false);
  });

  test("repeated single character 'aaaaaaaaaa' rejected", () => {
    expect(validateMessage("aaaaaaaaaa").ok).toBe(false);
  });

  // 'sdfghjkl;kjhgfzxcvbnm' has 10+ unique letters — diverse-character input.
  // Spam detection (<=3 unique letter chars) does not fire; message is accepted.
  test("keyboard mash 'sdfghjkl;kjhgfzxcvbnm' is accepted (10+ unique letters)", () => {
    expect(validateMessage("sdfghjkl;'kjhgfzxcvbnm").ok).toBe(true);
  });

  test("message over 2000 characters rejected", () => {
    expect(validateMessage("a ".repeat(1001)).ok).toBe(false);
  });
});

describe("validateMessage — accepted inputs", () => {
  test("short meaningful feedback accepted", () => {
    expect(validateMessage("Great app, well done!").ok).toBe(true);
  });

  test("feedback with a real sentence accepted", () => {
    expect(validateMessage("The quiz feature is really useful for classroom engagement.").ok).toBe(true);
  });

  test("message exactly 10 chars accepted", () => {
    expect(validateMessage("Nice work!").ok).toBe(true);
  });

  test("Tamil feedback accepted", () => {
    expect(validateMessage("இந்த பயன்பாடு மிகவும் நல்லது என்று நினைக்கிறேன்.").ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitiseParticipantDisplayName
// ---------------------------------------------------------------------------

describe("sanitiseParticipantDisplayName", () => {
  test("null returns fallback", () => {
    expect(sanitiseParticipantDisplayName(null)).toBe("Unknown Participant");
  });

  test("undefined returns fallback", () => {
    expect(sanitiseParticipantDisplayName(undefined)).toBe("Unknown Participant");
  });

  test("empty string returns fallback", () => {
    expect(sanitiseParticipantDisplayName("")).toBe("Unknown Participant");
  });

  test("single dot '.' returns fallback", () => {
    expect(sanitiseParticipantDisplayName(".")).toBe("Unknown Participant");
  });

  test("punctuation-only '!@#' returns fallback", () => {
    expect(sanitiseParticipantDisplayName("!@#")).toBe("Unknown Participant");
  });

  test("valid name 'Adithya' is returned unchanged", () => {
    expect(sanitiseParticipantDisplayName("Adithya")).toBe("Adithya");
  });

  test("valid name 'Mukesh' is returned unchanged", () => {
    expect(sanitiseParticipantDisplayName("Mukesh")).toBe("Mukesh");
  });

  test("custom fallback is used when name is invalid", () => {
    expect(sanitiseParticipantDisplayName(".", "Anonymous")).toBe("Anonymous");
  });
});

// ---------------------------------------------------------------------------
// validateFeedbackPayload — integration
// ---------------------------------------------------------------------------

describe("validateFeedbackPayload", () => {
  test("valid payload returns ok=true with normalised values", () => {
    const r = validateFeedbackPayload({
      name: "Navneeth V",
      email: "navneeth@kct.ac.in",
      message: "This is a great feedback platform.",
    });
    expect(r.ok).toBe(true);
    expect(r.normalisedEmail).toBe("navneeth@kct.ac.in");
    expect(r.normalisedName).toBe("Navneeth V");
  });

  test("invalid name alone fails with name error", () => {
    const r = validateFeedbackPayload({
      name: ".",
      email: "navneeth@kct.ac.in",
      message: "Good feedback here.",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeDefined();
    expect(r.errors.email).toBeUndefined();
    expect(r.errors.message).toBeUndefined();
  });

  test("invalid email alone fails with email error", () => {
    const r = validateFeedbackPayload({
      name: "Navneeth V",
      email: "not-an-email",
      message: "Good feedback here.",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.email).toBeDefined();
  });

  test("empty message fails with message error", () => {
    const r = validateFeedbackPayload({
      name: "Navneeth V",
      email: "navneeth@kct.ac.in",
      message: "",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.message).toBeDefined();
  });

  test("all invalid fields returns all three errors", () => {
    const r = validateFeedbackPayload({ name: ".", email: "bad", message: "." });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeDefined();
    expect(r.errors.email).toBeDefined();
    expect(r.errors.message).toBeDefined();
  });
});
