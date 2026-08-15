import { saveIPRule, deleteIPRule, getAllIPRules } from "./storage";

// In-memory sets for ultra-fast checks without disk hits
const allowlist = new Set<string>();
const blocklist = new Set<string>();

// Temporary IP block map: IP -> Expires At (timestamp in ms)
const temporaryBlocks = new Map<string, number>();

/**
 * Initializes the IP filter by reading rules from SQLite.
 */
export function initIPFilter() {
  allowlist.clear();
  blocklist.clear();
  temporaryBlocks.clear();

  const rules = getAllIPRules();
  const now = new Date();

  for (const rule of rules) {
    if (rule.expiresAt && new Date(rule.expiresAt) < now) {
      // Rule expired, prune it
      deleteIPRule(rule.ip);
      continue;
    }

    if (rule.type === 'allow') {
      allowlist.add(rule.ip);
    } else {
      blocklist.add(rule.ip);
    }
  }

  console.log(`[KCT SHIELD] IP Filter loaded: ${allowlist.size} allowed, ${blocklist.size} blocked from DB.`);
}

/**
 * Check if client IP is blocked (permanently or temporarily).
 */
export function isIPBlocked(ip: string): boolean {
  // 1. Permanent Block check
  if (blocklist.has(ip)) {
    return true;
  }

  // 2. Temporary Block check
  const tempBlockExpiry = temporaryBlocks.get(ip);
  if (tempBlockExpiry) {
    if (Date.now() < tempBlockExpiry) {
      return true; // Still blocked
    } else {
      temporaryBlocks.delete(ip); // Expiry passed, lift block
    }
  }

  return false;
}

/**
 * Check if client IP is in the allowlist.
 */
export function isIPAllowed(ip: string): boolean {
  return allowlist.has(ip);
}

/**
 * Permanently blocks an IP.
 */
export function blockIP(ip: string) {
  // If allowed, remove from allowlist first
  allowlist.delete(ip);

  blocklist.add(ip);
  saveIPRule(ip, 'block', null);
  console.log(`[KCT SHIELD] IP permanently blocked: ${ip}`);
}

/**
 * Temporarily blocks an IP for N seconds.
 */
export function blockIPTemp(ip: string, durationSeconds: number) {
  if (allowlist.has(ip)) return; // Don't block allowed IPs

  const expiresAt = Date.now() + durationSeconds * 1000;
  temporaryBlocks.set(ip, expiresAt);
  console.log(`[KCT SHIELD] IP temporarily blocked for ${durationSeconds}s: ${ip}`);
}

/**
 * Permanently allows an IP.
 */
export function allowIP(ip: string) {
  blocklist.delete(ip);
  temporaryBlocks.delete(ip);

  allowlist.add(ip);
  saveIPRule(ip, 'allow', null);
  console.log(`[KCT SHIELD] IP permanently allowed: ${ip}`);
}

/**
 * Removes all block/allow rules for an IP.
 */
export function unblockIP(ip: string) {
  allowlist.delete(ip);
  blocklist.delete(ip);
  temporaryBlocks.delete(ip);
  deleteIPRule(ip);
  console.log(`[KCT SHIELD] IP unblocked/reset: ${ip}`);
}

/**
 * Get active temporary block lists.
 */
export function getTemporaryBlocks(): Record<string, string> {
  const result: Record<string, string> = {};
  const now = Date.now();
  for (const [ip, expiresAt] of temporaryBlocks.entries()) {
    if (expiresAt > now) {
      result[ip] = new Date(expiresAt).toISOString();
    }
  }
  return result;
}
