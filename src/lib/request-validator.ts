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
  ruleId?: string;
  rules?: string[];
}

const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB
const MAX_UPLOAD_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

// Pre-compiled Attack Signatures (Module Level for Max Edge Speed)
const SQLI_PATTERNS = [
  /(\b(select|union|insert|update|delete|drop|alter|truncate|exec)\b\s+)/i,
  /(--|\/\*|\*\/|;\s*--)/,
];
const XSS_PATTERNS = [/<script\b[^>]*>/i, /javascript:/i, /onload\s*=/i, /onerror\s*=/i];
const PATH_TRAVERSAL_PATTERNS = [/\.\.\//, /\.\.\\/, /\/etc\/passwd/i, /c:\\windows/i];

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

  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(combinedPayload)) {
      const ruleId = pattern.test(bodyText) && !pattern.test(queryStr) ? "SQLI-002" : "SQLI-001";
      return {
        isValid: false,
        status: 403,
        reason: "SQL Injection detected.",
        sanitizedPath,
        ruleId,
        rules: [ruleId],
      };
    }
  }

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(combinedPayload)) {
      const ruleId = pattern.test(bodyText) && !pattern.test(queryStr) ? "XSS-002" : "XSS-001";
      return {
        isValid: false,
        status: 403,
        reason: "Cross-Site Scripting detected.",
        sanitizedPath,
        ruleId,
        rules: [ruleId],
      };
    }
  }

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(combinedPayload)) {
      const ruleId = pattern.test(queryStr) ? "DIR-002" : "DIR-001";
      return {
        isValid: false,
        status: 403,
        reason: "Directory Traversal detected.",
        sanitizedPath,
        ruleId,
        rules: [ruleId],
      };
    }
  }

  return {
    isValid: true,
    status: 200,
    sanitizedPath,
  };
}
