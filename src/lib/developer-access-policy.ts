/**
 * developer-access-policy.ts
 * Pure decision logic for the developer portal UI gate.
 *
 * This is a usability gate only. The database enforces the same rule in
 * public.is_platform_admin(): a verified @kct.ac.in Firebase identity whose UID has the
 * 'admin' role. No shared passkey is accepted anywhere.
 */

export type DeveloperAccessReason =
  "signed_out" | "email_domain" | "email_unverified" | "not_admin" | "check_failed";

export type DeveloperAccessDecision =
  { allowed: true } | { allowed: false; reason: DeveloperAccessReason };

export interface DeveloperAccessInput {
  signedIn: boolean;
  email: string | null | undefined;
  emailVerified: boolean;
  /** null means the admin-role lookup failed. */
  isAdmin: boolean | null;
}

const KCT_EMAIL = /^[^@\s]+@kct\.ac\.in$/;

export function isKctEmail(email: string | null | undefined): boolean {
  return KCT_EMAIL.test((email ?? "").trim().toLowerCase());
}

export function evaluateDeveloperAccess(input: DeveloperAccessInput): DeveloperAccessDecision {
  if (!input.signedIn) return { allowed: false, reason: "signed_out" };
  if (!isKctEmail(input.email)) return { allowed: false, reason: "email_domain" };
  if (!input.emailVerified) return { allowed: false, reason: "email_unverified" };
  if (input.isAdmin === null) return { allowed: false, reason: "check_failed" };
  if (!input.isAdmin) return { allowed: false, reason: "not_admin" };
  return { allowed: true };
}

export const DEVELOPER_ACCESS_MESSAGES: Record<DeveloperAccessReason, string> = {
  signed_out: "Sign in with your @kct.ac.in administrator account to open the developer portal.",
  email_domain: "Only official @kct.ac.in administrator accounts can open the developer portal.",
  email_unverified: "Verify your @kct.ac.in email address before opening the developer portal.",
  not_admin: "Your account does not have the administrator role.",
  check_failed: "Could not verify administrator access. Please try again.",
};

/** Legacy browser-storage keys from the retired passkey gate. Cleared on load. */
export const LEGACY_DEVELOPER_STORAGE_KEYS = [
  "kct_dev_auth",
  "kct_dev_auth_time",
  "kct_dev_auth_hash",
  "kct_dev_passkey",
] as const;
