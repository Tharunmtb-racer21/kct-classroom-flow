import type { SecurityLog } from "./types";

/**
 * Checks if a key name matches common sensitive credentials or tokens.
 */
export function isSensitiveKey(key: string): boolean {
  const sensitiveRegex = /password|token|cookie|auth|key|secret|credential|jwt/i;
  return sensitiveRegex.test(key);
}

/**
 * Redacts values associated with sensitive keys.
 */
export function redactSensitiveData(key: string, value: string): string {
  if (isSensitiveKey(key)) {
    return "[REDACTED]";
  }
  return value;
}

/**
 * Scrubs HTTP headers of sensitive headers (e.g. Cookie, Authorization).
 */
export function scrubHeaders(headers: Headers): Record<string, string> {
  const scrubbed: Record<string, string> = {};
  headers.forEach((value, key) => {
    scrubbed[key] = redactSensitiveData(key, value);
  });
  return scrubbed;
}

/**
 * Scrubs HTTP query parameters of sensitive inputs.
 */
export function scrubQuery(searchParams: URLSearchParams): Record<string, string> {
  const scrubbed: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    scrubbed[key] = redactSensitiveData(key, value);
  });
  return scrubbed;
}

/**
 * Scrubs request bodies (JSON or Form URL encoded) of passwords/tokens.
 */
export function scrubBody(bodyText: string, contentType: string): string {
  if (!bodyText) return "";
  const cleanedType = contentType.toLowerCase();
  
  if (cleanedType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText);
      const redactObject = (obj: any): any => {
        if (typeof obj !== "object" || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(redactObject);
        
        const copy: any = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "object") {
            copy[k] = redactObject(v);
          } else {
            copy[k] = isSensitiveKey(k) ? "[REDACTED]" : v;
          }
        }
        return copy;
      };
      return JSON.stringify(redactObject(parsed));
    } catch {
      return "[MALFORMED_JSON_BODY_REDACTED]";
    }
  } else if (cleanedType.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(bodyText);
      const scrubbed = scrubQuery(params);
      return JSON.stringify(scrubbed);
    } catch {
      return "[MALFORMED_FORM_BODY_REDACTED]";
    }
  }

  // Fallback: if body itself matches pattern, or content-type is plain text
  return "[RAW_BODY_INSPECTED_AND_REDACTED]";
}

import { saveSecurityLog } from "./storage";

/**
 * Outputs a nicely formatted, colored terminal log.
 */
export function logSecurityEvent(event: SecurityLog) {
  const color = event.action === 'BLOCK' 
    ? '\x1b[31m' // Red
    : event.action === 'RATE_LIMIT' 
      ? '\x1b[33m' // Yellow
      : event.action === 'MONITOR'
        ? '\x1b[35m' // Magenta
        : '\x1b[32m'; // Green
  const reset = '\x1b[0m';
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  
  console.log(
    `[${timestamp}] ${color}${event.action.padEnd(10)}${reset} | IP: ${event.ip.padEnd(15)} | ${event.method.padEnd(6)} ${event.path.padEnd(30)} | Score: ${String(event.score).padStart(3)} | Rules: ${event.rules.join(", ") || "None"}`
  );
}

/**
 * Logs a security event to console and persists it asynchronously in SQLite.
 */
export function logSecurityEventAsync(event: SecurityLog) {
  // Print console warning
  logSecurityEvent(event);

  // Defer database write using setTimeout to keep request roundtrips non-blocking
  setTimeout(() => {
    try {
      saveSecurityLog(event);
    } catch (err: any) {
      console.error(`[KCT SHIELD] Database write failed:`, err.message);
    }
  }, 0);
}
