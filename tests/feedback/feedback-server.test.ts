/**
 * feedback-server.test.ts
 *
 * Comprehensive tests for the server-side feedback pipeline:
 * 1. handleFeedbackSubmission validates name, email, subject, message, length limits.
 * 2. Invalid payloads reject with 400 and NEVER call Web3Forms or DB.
 * 3. Honeypot entrapment returns early with fake success and NEVER calls Web3Forms or DB.
 * 4. Rate-limiting strictly enforces max 5 submissions per 10-minute window per client IP.
 * 5. Spoofed X-Forwarded-For headers with client-appended prefixes do not bypass rate-limiting.
 * 6. Valid submissions invoke the notification provider exactly once and insert into DB.
 * 7. Provider failures (HTTP 500, non-200) and timeouts produce truthful, safe responses.
 * 8. Missing WEB3FORMS_ACCESS_KEY is handled safely (saved to DB only, provider not called).
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  handleFeedbackSubmission,
  FeedbackRateLimiter,
  resolveClientIp,
  sendWeb3FormsNotification,
  FeedbackSubmissionError,
  type FeedbackHandlerDependencies,
  type FeedbackSubmissionInput,
} from "../../src/lib/feedback-handler.server";

describe("Server-Side Feedback Submission Handler (handleFeedbackSubmission)", () => {
  let rateLimiter: FeedbackRateLimiter;
  let mockFetch: ReturnType<typeof mock>;
  let mockDbInsert: ReturnType<typeof mock>;
  let deps: FeedbackHandlerDependencies;

  const validPayload: FeedbackSubmissionInput = {
    name: "Dr. Anandhi S",
    email: "anandhi.s@kct.ac.in",
    subject: "Feature Request",
    message: "Would love to see an automated attendance export for student poll sessions.",
  };

  const defaultHeaders = {
    get: (name: string) => {
      if (name.toLowerCase() === "x-real-ip") return "203.0.113.195";
      return null;
    },
  };

  beforeEach(() => {
    rateLimiter = new FeedbackRateLimiter(5, 10 * 60_000);
    mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    mockDbInsert = mock(() => Promise.resolve({ error: null }));
    deps = {
      rateLimiter,
      dbInsert: mockDbInsert,
      fetchFn: mockFetch as unknown as typeof fetch,
      getEnvKey: () => "test-server-access-key-not-real",
    };
  });

  // 1. Valid Submission
  test("valid submission inserts to DB and calls Web3Forms exactly once", async () => {
    const result = await handleFeedbackSubmission(validPayload, defaultHeaders, deps);

    expect(result.success).toBe(true);
    expect(result.delivered).toBe(true);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify DB payload
    const insertedRecord = mockDbInsert.mock.calls[0][0];
    expect(insertedRecord.name).toBe("Dr. Anandhi S");
    expect(insertedRecord.email).toBe("anandhi.s@kct.ac.in");
    expect(insertedRecord.subject).toBe("Feature Request");
    expect(insertedRecord.status).toBe("unread");

    // Verify Web3Forms request
    const fetchArgs = mockFetch.mock.calls[0];
    expect(fetchArgs[0]).toBe("https://api.web3forms.com/submit");
    const sentBody = JSON.parse(fetchArgs[1].body);
    expect(sentBody.access_key).toBe("test-server-access-key-not-real");
    expect(sentBody.email).toBe("anandhi.s@kct.ac.in");
  });

  // 2. Invalid Name
  test("single dot '.' name rejects with 400 and NEVER invokes Web3Forms or DB", async () => {
    const badInput: FeedbackSubmissionInput = { ...validPayload, name: "." };

    try {
      await handleFeedbackSubmission(badInput, defaultHeaders, deps);
      expect().fail("Should have thrown 400");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      const fbErr = err as FeedbackSubmissionError;
      expect(fbErr.status).toBe(400);
      expect(fbErr.fieldErrors?.name).toBeDefined();
    }

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 3. Malformed Email
  test("malformed email address rejects with 400 and NEVER invokes Web3Forms or DB", async () => {
    const badInput: FeedbackSubmissionInput = { ...validPayload, email: "invalid-email" };

    try {
      await handleFeedbackSubmission(badInput, defaultHeaders, deps);
      expect().fail("Should have thrown 400");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      const fbErr = err as FeedbackSubmissionError;
      expect(fbErr.status).toBe(400);
      expect(fbErr.fieldErrors?.email).toBeDefined();
    }

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 4. Punctuation-Only Message
  test("punctuation-only message rejects with 400 and NEVER invokes Web3Forms or DB", async () => {
    const badInput: FeedbackSubmissionInput = { ...validPayload, message: "............" };

    try {
      await handleFeedbackSubmission(badInput, defaultHeaders, deps);
      expect().fail("Should have thrown 400");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      const fbErr = err as FeedbackSubmissionError;
      expect(fbErr.status).toBe(400);
      expect(fbErr.fieldErrors?.message).toBeDefined();
    }

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 5. Oversized Payload (>2000 characters)
  test("message exceeding 2000 characters rejects with 400 and NEVER invokes Web3Forms or DB", async () => {
    const badInput: FeedbackSubmissionInput = {
      ...validPayload,
      message: "A".repeat(2001),
    };

    try {
      await handleFeedbackSubmission(badInput, defaultHeaders, deps);
      expect().fail("Should have thrown 400");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      const fbErr = err as FeedbackSubmissionError;
      expect(fbErr.status).toBe(400);
      expect(fbErr.fieldErrors?.message).toContain("too long");
    }

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 6. Honeypot Entrapment
  test("honeypot submission returns early success and NEVER contacts DB or Web3Forms", async () => {
    const honeypotInput: FeedbackSubmissionInput = {
      ...validPayload,
      honeypot: "https://spammer-link.org",
    };

    const result = await handleFeedbackSubmission(honeypotInput, defaultHeaders, deps);

    expect(result.success).toBe(true);
    expect(result.delivered).toBe(false);
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 7. Server-Side Rate Limiting (5 requests per 10 minutes)
  test("6th submission within 10 minutes from same IP throws 429 and NEVER calls Web3Forms", async () => {
    // 5 submissions should succeed
    for (let i = 0; i < 5; i++) {
      const res = await handleFeedbackSubmission(validPayload, defaultHeaders, deps);
      expect(res.success).toBe(true);
    }
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // 6th submission must be rejected with 429
    try {
      await handleFeedbackSubmission(validPayload, defaultHeaders, deps);
      expect().fail("Should have thrown 429");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      const fbErr = err as FeedbackSubmissionError;
      expect(fbErr.status).toBe(429);
      expect(fbErr.message).toContain("Too many");
    }

    // Provider fetch count must still be 5 (6th attempt never called provider)
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  // 8. Spoofed IP Anti-Bypass
  test("forged client prefixes in X-Forwarded-For cannot bypass rate limiting", async () => {
    // First 5 requests from trusted real-ip
    for (let i = 0; i < 5; i++) {
      await handleFeedbackSubmission(validPayload, defaultHeaders, deps);
    }

    // Attacker tries to bypass rate limiting by sending a different fake X-Forwarded-For prefix
    // but the edge proxy still reports the real connecting IP in x-real-ip
    const spoofAttemptHeaders = {
      get: (name: string) => {
        if (name.toLowerCase() === "x-real-ip") return "203.0.113.195"; // Real edge IP
        if (name.toLowerCase() === "x-forwarded-for")
          return `1.2.3.${Math.floor(Math.random() * 200)}, 203.0.113.195`;
        return null;
      },
    };

    try {
      await handleFeedbackSubmission(validPayload, spoofAttemptHeaders, deps);
      expect().fail("Spoofed attempt should have been blocked by real IP");
    } catch (err: unknown) {
      expect(err instanceof FeedbackSubmissionError).toBe(true);
      expect((err as FeedbackSubmissionError).status).toBe(429);
    }
  });

  // 9. Provider Failure (HTTP 500) Gracefully Handled
  test("provider HTTP 500 failure records non-fatal delivery failure but preserves DB record", async () => {
    const failingFetch = mock(() =>
      Promise.resolve(new Response("Service Unavailable", { status: 500 })),
    );

    const failingDeps: FeedbackHandlerDependencies = {
      ...deps,
      fetchFn: failingFetch as unknown as typeof fetch,
    };

    const result = await handleFeedbackSubmission(validPayload, defaultHeaders, failingDeps);

    // DB insertion still succeeded
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    // Provider was attempted
    expect(failingFetch).toHaveBeenCalledTimes(1);
    // Result indicates DB success but email delivery false
    expect(result.success).toBe(true);
    expect(result.delivered).toBe(false);
  });

  // 10. Provider Network Timeout Gracefully Handled
  test("provider network timeout returns non-fatal delivery failure", async () => {
    const timeoutFetch = mock(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const timeoutDeps: FeedbackHandlerDependencies = {
      ...deps,
      fetchFn: timeoutFetch as unknown as typeof fetch,
    };

    const result = await handleFeedbackSubmission(validPayload, defaultHeaders, timeoutDeps);

    expect(result.success).toBe(true);
    expect(result.delivered).toBe(false);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  // 11. Missing WEB3FORMS_ACCESS_KEY
  test("missing WEB3FORMS_ACCESS_KEY saves to database without calling provider", async () => {
    const noKeyDeps: FeedbackHandlerDependencies = {
      ...deps,
      getEnvKey: () => undefined,
    };

    const result = await handleFeedbackSubmission(validPayload, defaultHeaders, noKeyDeps);

    expect(result.success).toBe(true);
    expect(result.delivered).toBe(false);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("Client IP Resolution (resolveClientIp)", () => {
  test("prefers x-real-ip if valid", () => {
    const headers = {
      get: (h: string) => {
        if (h === "x-real-ip") return "198.51.100.42";
        if (h === "x-forwarded-for") return "1.1.1.1, 2.2.2.2";
        return null;
      },
    };
    expect(resolveClientIp(headers)).toBe("198.51.100.42");
  });

  test("uses rightmost valid IP in x-forwarded-for if x-real-ip is absent", () => {
    const headers = {
      get: (h: string) => {
        if (h === "x-forwarded-for") return "client.spoofed.ip, 198.51.100.88";
        return null;
      },
    };
    expect(resolveClientIp(headers)).toBe("198.51.100.88");
  });

  test("falls back to 127.0.0.1 if no valid IP is present", () => {
    const headers = {
      get: () => "invalid-non-ip-string",
    };
    expect(resolveClientIp(headers)).toBe("127.0.0.1");
  });
});
