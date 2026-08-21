/**
 * Standalone script to start ONLY the KCT Shield Dashboard API server (port 8081).
 * Use this when you want WAF telemetry monitoring without the proxy on port 3000.
 *
 * Usage:  bun run src/dashboard-only.ts
 */
import { initDatabase } from "./storage";
import { initIPFilter } from "./filter";
import { loadRules } from "./rules";
import { startDashboard } from "./dashboard";

// Boot sequence
initDatabase();
initIPFilter();
loadRules();

// Spin up the administration dashboard server on port 8081
startDashboard();

console.log(`\x1b[32m🛡️  KCT SHIELD Dashboard API listening on http://localhost:8081\x1b[0m`);
console.log(`📊 WAF telemetry monitor ready — no proxy started.\n`);
