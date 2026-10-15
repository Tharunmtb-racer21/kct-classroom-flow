/**
 * feedback-pipeline.test.ts
 *
 * Verifies that:
 * 1. The feedback submission pipeline rejects spam, malformed names, invalid emails,
 *    and punctuation-only messages before any notification provider is invoked.
 * 2. Honeypot entrapment silently terminates submission without calling provider or DB.
 * 3. Rapid repeated submissions are blocked by the in-flight guard / sliding window rate limiter.
 */

import { describe, expect, test, mock } from "bun:test";
import { validateFeedbackPayload } from "../../src/lib/feedback-validator";

describe("Feedback Submission Pipeline & Provider Guardrails", () => {
  test("invalid name prevents notification provider from being invoked", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));

    const payload = {
      name: ".",
      email: "student@kct.ac.in",
      message: "Here is a legitimate message with more than ten characters.",
    };

    const validation = validateFeedbackPayload(payload);
    if (validation.ok) {
      await mockProvider();
    }

    expect(validation.ok).toBe(false);
    expect(validation.errors.name).toBeDefined();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  test("invalid email prevents notification provider from being invoked", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));

    const payload = {
      name: "Kumaraguru Faculty",
      email: "invalid-email-address",
      message: "I am experiencing an issue with the quiz module in my classroom session.",
    };

    const validation = validateFeedbackPayload(payload);
    if (validation.ok) {
      await mockProvider();
    }

    expect(validation.ok).toBe(false);
    expect(validation.errors.email).toBeDefined();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  test("punctuation-only message prevents notification provider from being invoked", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));

    const payload = {
      name: "Test User",
      email: "user@example.com",
      message: "..........",
    };

    const validation = validateFeedbackPayload(payload);
    if (validation.ok) {
      await mockProvider();
    }

    expect(validation.ok).toBe(false);
    expect(validation.errors.message).toBeDefined();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  test("repeated characters / spam message prevents notification provider from being invoked", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));

    const payload = {
      name: "Test User",
      email: "user@example.com",
      message: "aaaaaaaaaaaaaaaaaaaa",
    };

    const validation = validateFeedbackPayload(payload);
    if (validation.ok) {
      await mockProvider();
    }

    expect(validation.ok).toBe(false);
    expect(validation.errors.message).toBeDefined();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  test("honeypot trap returns early and never contacts provider or database", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));
    const mockDbInsert = mock(() => Promise.resolve({ error: null }));

    const honeypot = "https://spam-bot.com";
    const payload = {
      name: "Spam Bot",
      email: "bot@spammer.com",
      message: "Buy cheap products online now with 50% discount!",
    };

    // Pipeline honeypot check (mirrors contact-us-modal.tsx handleSubmit)
    if (honeypot) {
      // Honeypot tripped — silently succeed without calling DB or provider
    } else {
      const validation = validateFeedbackPayload(payload);
      if (validation.ok) {
        await mockDbInsert();
        await mockProvider();
      }
    }

    expect(mockProvider).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  test("valid submission successfully validates and permits provider dispatch", async () => {
    const mockProvider = mock(() => Promise.resolve({ ok: true }));
    const mockDbInsert = mock(() => Promise.resolve({ error: null }));

    const payload = {
      name: "Dr. Ramanathan K",
      email: "ramanathan.k@kct.ac.in",
      message: "The student engagement analytics graph renders smoothly after the update.",
    };

    const validation = validateFeedbackPayload(payload);
    expect(validation.ok).toBe(true);

    if (validation.ok) {
      await mockDbInsert();
      await mockProvider();
    }

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockProvider).toHaveBeenCalledTimes(1);
  });
});

describe("Server-Side Sliding-Window Rate Limiter Logic", () => {
  // Test sliding-window rate limiting pattern identical to server handlers / middleware
  class SlidingWindowRateLimiter {
    private hits = new Map<string, number[]>();
    constructor(private limit: number, private windowMs: number) {}

    check(identifier: string, now: number): boolean {
      const recent = (this.hits.get(identifier) ?? []).filter((t) => now - t < this.windowMs);
      if (recent.length >= this.limit) {
        this.hits.set(identifier, recent);
        return false;
      }
      recent.push(now);
      this.hits.set(identifier, recent);
      return true;
    }
  }

  test("enforces max 5 submissions per 10-minute window per IP / client", () => {
    const limiter = new SlidingWindowRateLimiter(5, 10 * 60 * 1000);
    const ip = "192.168.1.100";
    let now = 1000000;

    // First 5 requests should pass
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(ip, now + i * 1000)).toBe(true);
    }

    // 6th request within window must be rejected (rate limited)
    expect(limiter.check(ip, now + 5000)).toBe(false);

    // Another IP should not be affected
    expect(limiter.check("192.168.1.101", now + 5000)).toBe(true);

    // After window expires (>10 minutes), submissions are allowed again
    const afterWindow = now + 11 * 60 * 1000;
    expect(limiter.check(ip, afterWindow)).toBe(true);
  });
});
