/**
 * security-headers.ts
 * Enterprise Security Headers Module for KCT PULSE.
 * Injects standard security headers into HTTP responses to prevent clickjacking,
 * XSS attacks, MIME sniffing, and unauthorized browser feature access.
 */

export interface SecurityHeaderOptions {
  isEmbedRoute?: boolean; // If true, adjusts X-Frame-Options & CSP for slide embed views (/embed/$code)
}

/**
 * Returns a Headers object populated with enterprise security policies.
 */
export function getSecurityHeaders(opts?: SecurityHeaderOptions): Record<string, string> {
  const isEmbed = opts?.isEmbedRoute || false;

  // Frame Options: Allow embedding on /embed/$code for PowerPoint/Google Slides iFrames; restrict otherwise
  const frameOptions = isEmbed ? "ALLOWALL" : "SAMEORIGIN";

  // Content Security Policy (CSP)
  // Allows inline styles/scripts for Vite/React and connects to Supabase/Firebase endpoints
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://*.firebaseapp.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.groq.com https://integrate.api.nvidia.com https://generativelanguage.googleapis.com https://api.together.xyz",
    isEmbed ? "frame-ancestors *" : "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");

  return {
    "Content-Security-Policy": cspDirectives,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": frameOptions,
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

/**
 * Applies security headers onto a Response object
 */
export function applySecurityHeaders(response: Response, opts?: SecurityHeaderOptions): Response {
  const headersMap = getSecurityHeaders(opts);
  const newHeaders = new Headers(response.headers);

  Object.entries(headersMap).forEach(([key, val]) => {
    newHeaders.set(key, val);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
