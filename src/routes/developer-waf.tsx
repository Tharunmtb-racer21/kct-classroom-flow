/**
 * developer-waf.tsx
 * Compatibility redirect: forwards legacy /developer-waf navigation
 * to the integrated /dashboard/developer-waf route.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/developer-waf")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/developer-waf" });
  },
  component: () => null,
});
