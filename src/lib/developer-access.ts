/**
 * developer-access.ts
 * Browser-side developer portal gate based on the signed-in Firebase identity and the
 * caller's own row in public.user_roles (readable through the existing
 * "Users can view own roles" policy, keyed on public.auth_uid()).
 *
 * This only decides what the UI shows. Every privileged developer RPC re-checks
 * public.is_platform_admin() in the database.
 */

import { auth } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import {
  LEGACY_DEVELOPER_STORAGE_KEYS,
  evaluateDeveloperAccess,
  type DeveloperAccessDecision,
} from "./developer-access-policy";

export {
  DEVELOPER_ACCESS_MESSAGES,
  evaluateDeveloperAccess,
  type DeveloperAccessDecision,
  type DeveloperAccessReason,
} from "./developer-access-policy";

/** Removes any value left by the retired passkey gate from browser storage. */
export function clearLegacyDeveloperStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_DEVELOPER_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Storage may be unavailable (private mode); nothing to clear.
    }
  }
}

/** Checks whether the current Firebase user may open the developer portal UI. */
export async function checkDeveloperAccess(): Promise<DeveloperAccessDecision> {
  const user = auth.currentUser;
  if (!user)
    return evaluateDeveloperAccess({
      signedIn: false,
      email: null,
      emailVerified: false,
      isAdmin: false,
    });

  let emailVerified = user.emailVerified;
  try {
    let token = await user.getIdTokenResult();
    emailVerified = token.claims.email_verified === true;

    // If cached claims indicate the email is not verified, reload the Firebase
    // user and force-refresh the ID token once to pick up any recent out-of-band verification.
    if (!emailVerified) {
      try {
        await user.reload();
        token = await user.getIdTokenResult(true);
        emailVerified = token.claims.email_verified === true;
      } catch (reloadErr) {
        console.warn("[developer-access] Could not refresh user verification status:", reloadErr);
        // Refresh failure must NOT be treated as verification.
      }
    }
  } catch {
    return evaluateDeveloperAccess({
      signedIn: true,
      email: user.email,
      emailVerified,
      isAdmin: null,
    });
  }

  let isAdmin: boolean | null = null;
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.uid)
      .eq("role", "admin")
      .maybeSingle();

    if (error) {
      const errStr = (error.message || "").toLowerCase();
      if (
        errStr.includes("issued at future") ||
        errStr.includes("not yet valid") ||
        (errStr.includes("jwt") && errStr.includes("future"))
      ) {
        console.warn(
          "[developer-access] JWT timestamp verification failed ('JWT issued at future'). " +
            "Your system clock may be drifting behind network time. Please synchronize device time with NTP.",
        );
      } else {
        console.warn("[developer-access] Supabase role verification failed:", error.message);
      }
      isAdmin = null;
    } else {
      isAdmin = !!data;
    }
  } catch (err) {
    console.warn("[developer-access] Unexpected error during role verification:", err);
    isAdmin = null;
  }

  return evaluateDeveloperAccess({ signedIn: true, email: user.email, emailVerified, isAdmin });
}
