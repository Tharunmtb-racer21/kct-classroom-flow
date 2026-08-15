import { Database } from "bun:sqlite";
import type { IPRule, SecurityLog } from "./types";

const DB_NAME = "shield.db";
const db = new Database(DB_NAME);

/**
 * Initializes tables if they do not exist.
 */
export function initDatabase() {
  db.query(`
    CREATE TABLE IF NOT EXISTS ip_rules (
      ip TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('allow', 'block')) NOT NULL,
      expires_at TEXT
    );
  `).run();

  db.query(`
    CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      ip TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      action TEXT NOT NULL,
      rules TEXT NOT NULL, -- JSON string array
      score INTEGER NOT NULL,
      user_agent TEXT NOT NULL
    );
  `).run();

  console.log(`[KCT SHIELD] Database initialized successfully (SQLite: ${DB_NAME}).`);
}

/**
 * Adds an IP rule (allow or block) to the database.
 */
export function saveIPRule(ip: string, type: 'allow' | 'block', expiresAt: string | null) {
  db.query(`
    INSERT OR REPLACE INTO ip_rules (ip, type, expires_at)
    VALUES ($ip, $type, $expiresAt)
  `).run({
    $ip: ip,
    $type: type,
    $expiresAt: expiresAt,
  });
}

/**
 * Removes an IP rule from the database.
 */
export function deleteIPRule(ip: string) {
  db.query(`DELETE FROM ip_rules WHERE ip = $ip`).run({ $ip: ip });
}

/**
 * Retrieves all IP rules from the database.
 */
export function getAllIPRules(): IPRule[] {
  const rows = db.query(`SELECT ip, type, expires_at as expiresAt FROM ip_rules`).all() as any[];
  return rows.map(r => ({
    ip: r.ip,
    type: r.type,
    expiresAt: r.expiresAt,
  }));
}

/**
 * Inserts a security event log.
 */
export function saveSecurityLog(log: SecurityLog) {
  db.query(`
    INSERT INTO security_logs (timestamp, ip, method, path, action, rules, score, user_agent)
    VALUES ($timestamp, $ip, $method, $path, $action, $rules, $score, $userAgent)
  `).run({
    $timestamp: log.timestamp,
    $ip: log.ip,
    $method: log.method,
    $path: log.path,
    $action: log.action,
    $rules: JSON.stringify(log.rules),
    $score: log.score,
    $userAgent: log.userAgent,
  });
}

/**
 * Retrieves security logs, optionally limited.
 */
export function getSecurityLogs(limit = 100): SecurityLog[] {
  const rows = db.query(`
    SELECT id, timestamp, ip, method, path, action, rules, score, user_agent as userAgent
    FROM security_logs
    ORDER BY id DESC
    LIMIT $limit
  `).all({ $limit: limit }) as any[];

  return rows.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    ip: r.ip,
    method: r.method,
    path: r.path,
    action: r.action as any,
    rules: JSON.parse(r.rules),
    score: r.score,
    userAgent: r.userAgent,
  }));
}

/**
 * Retrieves counts for statistics.
 */
export function getWafStats() {
  const result = db.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN action = 'RATE_LIMIT' THEN 1 ELSE 0 END) as rateLimited
    FROM security_logs
  `).get() as any;

  const threatCats = db.query(`
    SELECT rules, COUNT(*) as count 
    FROM security_logs 
    WHERE action = 'BLOCK' 
    GROUP BY rules
  `).all() as any[];

  const categoryCounts: Record<string, number> = {
    SQLI: 0,
    XSS: 0,
    TRAVERSAL: 0,
    COMMAND: 0,
    RATE_LIMIT: 0,
  };

  // Process rules categories
  for (const row of threatCats) {
    try {
      const rules = JSON.parse(row.rules) as string[];
      for (const ruleId of rules) {
        if (ruleId.startsWith("SQLI")) categoryCounts.SQLI += row.count;
        else if (ruleId.startsWith("XSS")) categoryCounts.XSS += row.count;
        else if (ruleId.startsWith("DIR")) categoryCounts.TRAVERSAL += row.count;
        else if (ruleId.startsWith("CMD")) categoryCounts.COMMAND += row.count;
      }
    } catch {}
  }

  // Add rate limits from rate limited logs
  categoryCounts.RATE_LIMIT = result?.rateLimited || 0;

  return {
    total: result?.total || 0,
    allowed: result?.allowed || 0,
    blocked: result?.blocked || 0,
    rateLimited: result?.rateLimited || 0,
    categories: categoryCounts,
  };
}
