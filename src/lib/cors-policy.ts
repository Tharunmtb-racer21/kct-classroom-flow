/**
 * cors-policy.ts
 * Cross-Origin Resource Sharing (CORS) Protection Module for KCT PULSE.
 * Enforces origin validation, allowing only authorized campus deployment domains
 * and local developer proxies to access backend API endpoints.
 */

const ALLOWED_ORIGINS = [
  "https://kct-classroom-flow.vercel.app",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:3000",
];

/**
 * Validates whether an incoming request origin is allowed.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // Same-origin request
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith(".lovable.app") || origin.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * Generates CORS headers for a request.
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  const targetOrigin = allowed && origin ? origin : "https://kct-classroom-flow.vercel.app";

  return {
    "Access-Control-Allow-Origin": targetOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, apikey",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours preflight cache
  };
}

/**
 * Handles CORS preflight OPTIONS request
 */
export function handleCorsPreflight(origin: string | null): Response {
  const headers = getCorsHeaders(origin);
  return new Response(null, {
    status: 204,
    headers,
  });
}
