import { handleProxyRequest } from "./proxy";
import { initDatabase } from "./storage";
import { initIPFilter } from "./filter";
import { loadRules } from "./rules";
import { startDashboard } from "./dashboard";

// Boot sequence: setup SQLite database, pre-load rules, and initialize memory IP cache
initDatabase();
initIPFilter();
loadRules();

// Spin up the administration dashboard server on port 8081
startDashboard();

const PORT = 3000;

const server = Bun.serve({
  port: PORT,
  async fetch(request, serverInstance) {
    return handleProxyRequest(request, serverInstance);
  },
  error(error) {
    console.error("[KCT SHIELD] Server error:", error);
    return new Response("[KCT SHIELD] Internal Server Error", { status: 500 });
  }
});

console.log(`\x1b[32m🛡️  KCT SHIELD WAF listening on http://localhost:${PORT}\x1b[0m`);
console.log(`➡️  Forwarding traffic to KCT Classroom Flow on http://localhost:8080\n`);

export default server;
