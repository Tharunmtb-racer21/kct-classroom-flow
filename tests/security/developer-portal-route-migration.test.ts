import { describe, expect, test, mock } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateDeveloperAccess,
  isKctEmail,
  DEVELOPER_ACCESS_MESSAGES,
} from "../../src/lib/developer-access-policy";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "src");

describe("developer portal route migration", () => {
  test("migrated developer portal file exists at _authenticated/dashboard.developer.tsx", () => {
    const targetFile = join(SRC, "routes", "_authenticated", "dashboard.developer.tsx");
    expect(existsSync(targetFile)).toBe(true);
    const content = readFileSync(targetFile, "utf-8");
    expect(content).toContain('createFileRoute("/_authenticated/dashboard/developer")');
    expect(content).toContain("checkDeveloperAccess");
    expect(content).toContain("DeveloperDashboard");
  });

  test("legacy /developer route is a minimal redirect to /dashboard/developer", () => {
    const legacyFile = join(SRC, "routes", "developer.tsx");
    expect(existsSync(legacyFile)).toBe(true);
    const content = readFileSync(legacyFile, "utf-8");
    expect(content).toContain('createFileRoute("/developer")');
    expect(content).toContain('redirect({ to: "/dashboard/developer" })');
    // Ensure it is a lightweight redirect and does not duplicate the full portal UI
    expect(content.split("\n").length).toBeLessThan(30);
  });

  test("dashboard layout suppresses duplicate sidebar, navigation, and footer on developer route", () => {
    const dashboardLayout = readFileSync(
      join(SRC, "routes", "_authenticated", "dashboard.tsx"),
      "utf-8",
    );
    expect(dashboardLayout).toContain('pathname.startsWith("/dashboard/developer")');
    expect(dashboardLayout).toContain("if (isDeveloperRoute)");
    expect(dashboardLayout).toContain("return <Outlet />");
  });

  test("root route exempts /dashboard/developer from chatbot and keeps server-down bypass", () => {
    const rootRoute = readFileSync(join(SRC, "routes", "__root.tsx"), "utf-8");
    expect(rootRoute).toContain('pathname.startsWith("/dashboard/developer")');
    expect(rootRoute).toContain("const isDeveloperRoute");
    expect(rootRoute).toContain(
      "showEmergencyServerDownScreen = isServerDown && !isDeveloperRoute",
    );
    expect(rootRoute).toContain(
      'showChatBot = pathname.startsWith("/dashboard") && !isDeveloperRoute',
    );
  });

  test("developer WAF portal is routed under /dashboard/developer-waf and links to /dashboard/developer", () => {
    const legacyWafRoute = readFileSync(join(SRC, "routes", "developer-waf.tsx"), "utf-8");
    expect(legacyWafRoute).toContain('to: "/dashboard/developer-waf"');

    const wafRoute = readFileSync(join(SRC, "routes", "_authenticated", "dashboard.developer-waf.tsx"), "utf-8");
    expect(wafRoute).toContain('<Link to="/dashboard/developer">');
    expect(wafRoute).not.toContain('<Link to="/developer">');
  });

  test("developer gate card allows returning directly to /dashboard without redirect loop", () => {
    const targetFile = join(SRC, "routes", "_authenticated", "dashboard.developer.tsx");
    const content = readFileSync(targetFile, "utf-8");
    expect(content).toContain('to="/dashboard"');
    expect(content).toContain("Return to Faculty Dashboard");
  });
});

describe("developer access evaluation policy", () => {
  test("unauthenticated visitor is denied with signed_out", () => {
    const decision = evaluateDeveloperAccess({
      signedIn: false,
      email: null,
      emailVerified: false,
      isAdmin: false,
    });
    expect(decision).toEqual({ allowed: false, reason: "signed_out" });
    if (!decision.allowed) {
      expect(DEVELOPER_ACCESS_MESSAGES[decision.reason]).toContain("Sign in");
    }
  });

  test("authenticated non-admin faculty member is denied with not_admin", () => {
    const decision = evaluateDeveloperAccess({
      signedIn: true,
      email: "faculty@kct.ac.in",
      emailVerified: true,
      isAdmin: false,
    });
    expect(decision).toEqual({ allowed: false, reason: "not_admin" });
    if (!decision.allowed) {
      expect(DEVELOPER_ACCESS_MESSAGES[decision.reason]).toBe(
        "Your account does not have the administrator role.",
      );
    }
  });

  test("authenticated user with external or student email is denied with email_domain", () => {
    const student = evaluateDeveloperAccess({
      signedIn: true,
      email: "student@student.kct.ac.in",
      emailVerified: true,
      isAdmin: true,
    });
    expect(student).toEqual({ allowed: false, reason: "email_domain" });

    const external = evaluateDeveloperAccess({
      signedIn: true,
      email: "outsider@gmail.com",
      emailVerified: true,
      isAdmin: true,
    });
    expect(external).toEqual({ allowed: false, reason: "email_domain" });
  });

  test("authenticated admin with unverified email is denied with email_unverified", () => {
    const decision = evaluateDeveloperAccess({
      signedIn: true,
      email: "admin@kct.ac.in",
      emailVerified: false,
      isAdmin: true,
    });
    expect(decision).toEqual({ allowed: false, reason: "email_unverified" });
    if (!decision.allowed) {
      expect(DEVELOPER_ACCESS_MESSAGES[decision.reason]).toContain("Verify your @kct.ac.in email");
    }
  });

  test("verified admin with @kct.ac.in email is granted access", () => {
    const decision = evaluateDeveloperAccess({
      signedIn: true,
      email: "admin@kct.ac.in",
      emailVerified: true,
      isAdmin: true,
    });
    expect(decision).toEqual({ allowed: true });
  });

  test("fails closed if admin role query fails", () => {
    const decision = evaluateDeveloperAccess({
      signedIn: true,
      email: "admin@kct.ac.in",
      emailVerified: true,
      isAdmin: null,
    });
    expect(decision).toEqual({ allowed: false, reason: "check_failed" });
  });
});
