import type { LimiterBucket } from "./types";
import { blockIPTemp } from "./filter";

// Rate limiter configuration parameters
const MAX_TOKENS = 60; // Maximum burst capacity
const REFILL_RATE = 1.0; // Tokens added per second (1 req/sec = 60 req/min)
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity triggers bucket cleanup
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup routine every 1 minute

const buckets = new Map<string, LimiterBucket>();

// Periodic memory cleanup routine
setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > IDLE_TIMEOUT_MS) {
      buckets.delete(ip);
      evicted++;
    }
  }
  if (evicted > 0) {
    console.log(`[KCT SHIELD] Evicted ${evicted} idle rate limiter buckets from memory.`);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Checks if a request from an IP should be allowed based on Token Bucket.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);

  // If no bucket exists, create one with max capacity
  if (!bucket) {
    buckets.set(ip, {
      tokens: MAX_TOKENS - 1, // Consume 1 token for this initial request
      lastRefill: now,
    });
    return true;
  }

  // Calculate elapsed time and refill amount
  const elapsedMs = now - bucket.lastRefill;
  const tokensToAdd = (elapsedMs / 1000) * REFILL_RATE;

  // Update tokens, bounding at MAX_TOKENS
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  // Check if we have at least one token to consume
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(ip, bucket);
    return true;
  }

  // Rate limit exceeded! Temporarily block the IP for 60 seconds as a penalty
  console.log(`[KCT SHIELD] Rate limit exceeded for IP: ${ip}. Applying 60s block.`);
  blockIPTemp(ip, 60);
  return false;
}

/**
 * Returns current bucket status for debug/dashboard.
 */
export function getLimiterStats(ip: string): { tokens: number; capacity: number } | null {
  const bucket = buckets.get(ip);
  if (!bucket) return null;
  return {
    tokens: Math.round(bucket.tokens * 100) / 100,
    capacity: MAX_TOKENS,
  };
}
