/**
 * request-validator.ts
 * Centralized Request & Payload Validation Pipeline for KCT PULSE.
 * Enforces route payload size limits, path sanitization, and input parameter validation
 * against SQL Injection, Cross-Site Scripting (XSS), and Path Traversal.
 */

export interface ValidationCheckResult {
  isValid: boolean;
  status: number;
  reason?: string;
  sanitizedPath: string;
}

const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB
const MAX_UPLOAD_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates request payload size based on route type.
 */
export function validatePayloadSize(
  path: string,
  bodySizeBytes: number,
): { isExceeded: boolean; limitBytes: number } {
  const isUploadRoute = path.includes("/upload") || path.includes("/document");
  const limitBytes = isUploadRoute ? MAX_UPLOAD_BODY_BYTES : MAX_JSON_BODY_BYTES;

  return {
    isExceeded: bodySizeBytes > limitBytes,
    limitBytes,
  };
}

/**
 * Sanitizes request paths to prevent path traversal attacks (e.g., ../../etc/passwd).
 */
export function sanitizeRequestPath(rawPath: string): string {
  if (!rawPath) return "/";
  let clean = rawPath.replace(/\.\.\//g, "").replace(/\.\.\\/g, "");
  clean = clean.replace(/\/+/g, "/");
  return clean;
}

/**
 * Inspects query string & body for common injection attack vectors (SQLi, XSS, Path Traversal).
 */
export function validateInputThreats(
  path: string,
  queryStr: string,
  bodyText: string,
): ValidationCheckResult {
  const sanitizedPath = sanitizeRequestPath(path);

  const combinedPayload = (sanitizedPath + " " + queryStr + " " + bodyText).toLowerCase();

  // Attack Signatures
  const sqliPatterns = [
    /(\b(select|union|insert|update|delete|drop|alter|truncate|exec)\b\s+)/i,
    /(--|\/\*|\*\/|;\s*--)/,
  ];
  const xssPatterns = [/<script\b[^>]*>/i, /javascript:/i, /onload\s*=/i, /onerror\s*=/i];
  const pathTraversalPatterns = [/\.\.\//, /\.\.\\/, /\/etc\/passwd/i, /c:\\windows/i];

  for (const pattern of sqliPatterns) {
    if (pattern.test(combinedPayload)) {
      return {
        isValid: false,
        status: 403,
        reason: "Request blocked by SQL Injection defense rule.",
        sanitizedPath,
      };
    }
  }

  for (const pattern of xssPatterns) {
    if (pattern.test(combinedPayload)) {
      return {
        isValid: false,
        status: 403,
        reason: "Request blocked by Cross-Site Scripting (XSS) defense rule.",
        sanitizedPath,
      };
    }
  }

  for (const pattern of pathTraversalPatterns) {
    if (pattern.test(combinedPayload)) {
      return {
        isValid: false,
        status: 403,
        reason: "Request blocked by Path Traversal defense rule.",
        sanitizedPath,
      };
    }
  }

  return {
    isValid: true,
    status: 200,
    sanitizedPath,
  };
}
