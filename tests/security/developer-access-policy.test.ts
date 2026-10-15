import { describe, expect, test } from "bun:test";
import {
  DEVELOPER_ACCESS_MESSAGES,
  LEGACY_DEVELOPER_STORAGE_KEYS,
  evaluateDeveloperAccess,
  isKctEmail,
} from "../../src/lib/developer-access-policy";

const base = { signedIn: true, email: "admin@kct.ac.in", emailVerified: true, isAdmin: true };

describe("evaluateDeveloperAccess", () => {
  test("allows only a signed-in, verified @kct.ac.in admin", () => {
    expect(evaluateDeveloperAccess(base)).toEqual({ allowed: true });
  });

  test("denies signed-out users", () => {
    expect(evaluateDeveloperAccess({ ...base, signedIn: false })).toEqual({
      allowed: false,
      reason: "signed_out",
    });
  });

  test("denies non-KCT, subdomain and look-alike emails", () => {
    for (const email of [
      "admin@gmail.com",
      "admin@sub.kct.ac.in",
      "admin@kct.ac.in.evil.com",
      "a@b@kct.ac.in",
      "",
      null,
    ]) {
      expect(evaluateDeveloperAccess({ ...base, email })).toEqual({
        allowed: false,
        reason: "email_domain",
      });
    }
  });

  test("denies unverified emails", () => {
    expect(evaluateDeveloperAccess({ ...base, emailVerified: false })).toEqual({
      allowed: false,
      reason: "email_unverified",
    });
  });

  test("denies non-admins and fails closed when the role lookup fails", () => {
    expect(evaluateDeveloperAccess({ ...base, isAdmin: false })).toEqual({
      allowed: false,
      reason: "not_admin",
    });
    expect(evaluateDeveloperAccess({ ...base, isAdmin: null })).toEqual({
      allowed: false,
      reason: "check_failed",
    });
  });

  test("accepts KCT emails case-insensitively", () => {
    expect(isKctEmail(" Admin@KCT.AC.IN ")).toBe(true);
  });

  test("has a user-facing message for every denial reason", () => {
    for (const reason of [
      "signed_out",
      "email_domain",
      "email_unverified",
      "not_admin",
      "check_failed",
    ] as const) {
      expect(DEVELOPER_ACCESS_MESSAGES[reason].length).toBeGreaterThan(10);
    }
  });

  test("clears every storage key used by the retired passkey gate", () => {
    expect([...LEGACY_DEVELOPER_STORAGE_KEYS].sort()).toEqual(
      ["kct_dev_auth", "kct_dev_auth_hash", "kct_dev_auth_time", "kct_dev_passkey"].sort(),
    );
  });
});
