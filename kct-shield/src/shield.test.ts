import { expect, test, describe, beforeAll } from "bun:test";
import { normalizePayload, inspectRequest } from "./detector";
import { initIPFilter, blockIP, isIPBlocked, allowIP, isIPAllowed, unblockIP } from "./filter";
import { checkRateLimit } from "./limiter";
import { loadRules } from "./rules";
import { initDatabase } from "./storage";

describe("🛡️ KCT SHIELD WAF Unit Tests", () => {
  beforeAll(() => {
    // Setup databases and load configurations
    initDatabase();
    initIPFilter();
    loadRules();
  });

  test("1. Input Normalization", () => {
    // URL decoding
    expect(normalizePayload("SELECT%20*%20FROM%20users")).toBe("select * from users");
    
    // Double URL encoding bypass prevention
    expect(normalizePayload("%253cscript%253e")).toBe("<script>");
    
    // Casing normalization
    expect(normalizePayload("<sCrIpT>alert(1)</ScRiPt>")).toBe("<script>alert(1)</script>");
    
    // Whitespace collapse
    expect(normalizePayload("select   *   from\n\nusers")).toBe("select * from users");
  });

  test("2. Threat Detection Rules", () => {
    // SQL Injection in Query (Score: 45)
    const sqliQuery = inspectRequest(
      "/join/code", 
      "input=1'+OR+1=1+--", 
      new Headers(), 
      "", 
      0
    );
    expect(sqliQuery.score).toBe(45);
    expect(sqliQuery.triggeredRules).toContain("SQLI-001");
    expect(sqliQuery.action).toBe("MONITOR");

    // XSS payload triggers BLOCK (Score: 50)
    const xssQuery = inspectRequest(
      "/join/code", 
      "name=<script>alert('hack')</script>", 
      new Headers(), 
      "", 
      0
    );
    expect(xssQuery.score).toBe(50);
    expect(xssQuery.triggeredRules).toContain("XSS-001");
    expect(xssQuery.action).toBe("BLOCK");

    // Path traversal in path triggers BLOCK (Score: 40)
    const traversalPath = inspectRequest(
      "/static/../../etc/passwd", 
      "", 
      new Headers(), 
      "", 
      0
    );
    expect(traversalPath.score).toBe(40);
    expect(traversalPath.triggeredRules).toContain("DIR-001");
    expect(traversalPath.action).toBe("MONITOR");
  });

  test("3. IP Allowlist & Blocklist Filters", () => {
    const testIp = "192.168.10.10";

    // Clean IP state
    unblockIP(testIp);
    expect(isIPBlocked(testIp)).toBe(false);
    expect(isIPAllowed(testIp)).toBe(false);

    // Apply manual Block
    blockIP(testIp);
    expect(isIPBlocked(testIp)).toBe(true);

    // Remove block & Apply Allow
    unblockIP(testIp);
    allowIP(testIp);
    expect(isIPAllowed(testIp)).toBe(true);
    expect(isIPBlocked(testIp)).toBe(false);

    // Clean up
    unblockIP(testIp);
  });

  test("4. Token Bucket Rate Limiter", () => {
    const rateIp = "192.168.100.1";

    // Make 60 sequential allowed requests (capacity = 60)
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit(rateIp)).toBe(true);
    }

    // The 61st request triggers rate limitation
    expect(checkRateLimit(rateIp)).toBe(false);
  });
});
