/**
 * tests/security/developer-faculty-resolution.test.ts
 *
 * Regression test suite for faculty/creator identity resolution in KCT Classroom Flow.
 * Verifies:
 *   1. Full Firebase UID exact matching (no truncated codes used as lookup keys).
 *   2. Authoritative profile name and email resolution via formatDisplayName.
 *   3. Fallback when full_name is missing/empty but email is present.
 *   4. "No email synced" is only used when email is genuinely null or empty.
 *   5. Consistency across multiple sessions for the same creator.
 *   6. Loading state and unlinked profile fallback handling.
 */

import { describe, expect, test } from "bun:test";
import { formatDisplayName } from "../../src/lib/utils";

type MockProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

type MockLoginLog = {
  user_id: string;
  email: string | null;
};

interface ResolveFacultyOptions {
  creatorId?: string | null;
  profiles: MockProfile[];
  loginLogs?: MockLoginLog[];
  loading?: boolean;
  currentUser?: { uid: string; displayName?: string | null; email?: string | null } | null;
  overrides?: Record<string, { name: string; email?: string }>;
}

function resolveFacultyInfo({
  creatorId,
  profiles,
  loginLogs = [],
  loading = false,
  currentUser = null,
  overrides = {},
}: ResolveFacultyOptions): { name: string; email: string } {
  if (!creatorId) {
    return { name: "Faculty (Unknown)", email: "unknown@kct.ac.in" };
  }

  // Guard against showing premature unlinked placeholders while initial data load is pending
  if (loading && profiles.length === 0) {
    return { name: "Loading...", email: "Loading..." };
  }

  // 0. Developer Custom Overrides
  if (overrides[creatorId]) {
    return {
      name: overrides[creatorId].name,
      email: overrides[creatorId].email || "No email synced",
    };
  }

  // 1. Authoritative Profiles table (exact full UID match)
  const prof = profiles.find((p) => p.id === creatorId);
  if (prof) {
    const email = prof.email && prof.email.trim() ? prof.email.trim() : null;
    const name = formatDisplayName(prof.full_name, email, creatorId);
    return {
      name,
      email: email || "No email synced",
    };
  }

  // 2. Login logs fallback
  const logMatch = loginLogs.find((l) => l.user_id === creatorId);
  if (logMatch && logMatch.email && logMatch.email.trim()) {
    const email = logMatch.email.trim();
    const name = formatDisplayName(null, email, creatorId);
    return { name, email };
  }

  // 3. Current logged-in user fallback
  if (currentUser && currentUser.uid === creatorId) {
    const email =
      currentUser.email && currentUser.email.trim() ? currentUser.email.trim() : null;
    const name = formatDisplayName(currentUser.displayName, email, creatorId);
    return {
      name,
      email: email || "No email synced",
    };
  }

  // 4. Fallback for unlinked sessions
  const shortId = creatorId.slice(0, 6).toUpperCase();
  return {
    name: `Unlinked Profile (${shortId})`,
    email: "No email synced",
  };
}

describe("Faculty profile identity resolution", () => {
  const sampleCreatorId = "w8XpY7c3RaB2qLm9Nz4KvT1s";
  const sampleCreatorId2 = "k9Lp5GtAubF8wMz1Qx7NrY3c";

  test("resolves full authoritative profile with full_name and email", () => {
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: "Dr. K. Senthil Kumar",
        email: "senthilkumar.k@kct.ac.in",
      },
    ];

    const result = resolveFacultyInfo({ creatorId: sampleCreatorId, profiles });
    expect(result.name).toBe("Dr. K. Senthil Kumar");
    expect(result.email).toBe("senthilkumar.k@kct.ac.in");
    expect(result.name).not.toContain("Unlinked");
    expect(result.email).not.toBe("No email synced");
  });

  test("uses full Firebase UID exact match and never matches on truncated short codes", () => {
    const shortCode = sampleCreatorId.slice(0, 6);
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: "Prof. Priya Raman",
        email: "priya.raman@kct.ac.in",
      },
    ];

    // Attempting to resolve with the shortcode instead of full UID must not match full UID
    const shortLookup = resolveFacultyInfo({ creatorId: shortCode, profiles });
    expect(shortLookup.name).toBe(`Unlinked Profile (${shortCode.toUpperCase()})`);

    // Resolving with full UID correctly matches
    const fullLookup = resolveFacultyInfo({ creatorId: sampleCreatorId, profiles });
    expect(fullLookup.name).toBe("Prof. Priya Raman");
    expect(fullLookup.email).toBe("priya.raman@kct.ac.in");
  });

  test("recovers real name from email when full_name is null or empty", () => {
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: null,
        email: "tharun.n.e@kct.ac.in",
      },
      {
        id: sampleCreatorId2,
        full_name: "   ",
        email: "anand.kumar.m@kct.ac.in",
      },
    ];

    const res1 = resolveFacultyInfo({ creatorId: sampleCreatorId, profiles });
    expect(res1.name).toBe("Tharun N E");
    expect(res1.email).toBe("tharun.n.e@kct.ac.in");

    const res2 = resolveFacultyInfo({ creatorId: sampleCreatorId2, profiles });
    expect(res2.name).toBe("Anand Kumar M");
    expect(res2.email).toBe("anand.kumar.m@kct.ac.in");
  });

  test("does not report 'No email synced' if profile has valid email", () => {
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: "Faculty Member",
        email: "faculty.test@kct.ac.in",
      },
    ];

    const result = resolveFacultyInfo({ creatorId: sampleCreatorId, profiles });
    expect(result.email).toBe("faculty.test@kct.ac.in");
  });

  test("only reports 'No email synced' when email is truly null, empty, or whitespace", () => {
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: "Dr. Lakshmi V",
        email: null,
      },
      {
        id: sampleCreatorId2,
        full_name: "Dr. Suresh P",
        email: "   ",
      },
    ];

    const res1 = resolveFacultyInfo({ creatorId: sampleCreatorId, profiles });
    expect(res1.name).toBe("Dr. Lakshmi V");
    expect(res1.email).toBe("No email synced");

    const res2 = resolveFacultyInfo({ creatorId: sampleCreatorId2, profiles });
    expect(res2.name).toBe("Dr. Suresh P");
    expect(res2.email).toBe("No email synced");
  });

  test("returns Loading... during initial telemetry fetch without flashing unlinked status", () => {
    const result = resolveFacultyInfo({
      creatorId: sampleCreatorId,
      profiles: [],
      loading: true,
    });
    expect(result.name).toBe("Loading...");
    expect(result.email).toBe("Loading...");
  });

  test("resolves consistent creator name and email across multiple sessions", () => {
    const profiles: MockProfile[] = [
      {
        id: sampleCreatorId,
        full_name: "Dr. Ramesh Babu",
        email: "ramesh.babu@kct.ac.in",
      },
    ];

    const sessionA = { id: "sess-1", creator_id: sampleCreatorId, title: "Data Structures" };
    const sessionB = { id: "sess-2", creator_id: sampleCreatorId, title: "Algorithms" };
    const sessionC = { id: "sess-3", creator_id: sampleCreatorId, title: "OS Lab" };

    const resA = resolveFacultyInfo({ creatorId: sessionA.creator_id, profiles });
    const resB = resolveFacultyInfo({ creatorId: sessionB.creator_id, profiles });
    const resC = resolveFacultyInfo({ creatorId: sessionC.creator_id, profiles });

    expect(resA).toEqual(resB);
    expect(resB).toEqual(resC);
    expect(resA.name).toBe("Dr. Ramesh Babu");
    expect(resA.email).toBe("ramesh.babu@kct.ac.in");
  });

  test("falls back to login logs if profile is missing but login event exists", () => {
    const loginLogs: MockLoginLog[] = [
      {
        user_id: sampleCreatorId,
        email: "kavitha.m@kct.ac.in",
      },
    ];

    const result = resolveFacultyInfo({
      creatorId: sampleCreatorId,
      profiles: [],
      loginLogs,
      loading: false,
    });

    expect(result.name).toBe("Kavitha M");
    expect(result.email).toBe("kavitha.m@kct.ac.in");
  });

  test("falls back to unlinked placeholder only when no profile or identity record exists", () => {
    const unknownId = "UNKNOWN999888777";
    const result = resolveFacultyInfo({
      creatorId: unknownId,
      profiles: [],
      loading: false,
    });

    expect(result.name).toBe(`Unlinked Profile (${unknownId.slice(0, 6)})`);
    expect(result.email).toBe("No email synced");
  });
});
