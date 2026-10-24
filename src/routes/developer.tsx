/**
 * developer.tsx
 * Compatibility redirect: forwards legacy /developer navigation
 * to the integrated /dashboard/developer route.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/developer")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/developer" });
  },
  component: () => null,
});
