/**
 * dashboard.security.tsx
 * Faculty security route: safely redirects to /dashboard.
 * Platform security telemetry is exclusively accessible to authorized Developer/Admin users at /developer.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/security")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
