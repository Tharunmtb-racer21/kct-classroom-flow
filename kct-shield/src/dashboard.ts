import { getWafStats, getSecurityLogs, getAllIPRules } from "./storage";
import { allowIP, blockIP, unblockIP, getTemporaryBlocks } from "./filter";

const ADMIN_PORT = 8081;

/**
 * Returns the HTML page for the Dashboard interface.
 */
function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KCT SHIELD — Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      background-color: #080b11;
      color: #e2e8f0;
    }
    .glass-card {
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }
    code {
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body class="min-height-screen pb-12">
  <!-- Nav Header -->
  <nav class="border-b border-gray-800 bg-[#0f172a]/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🛡️</span>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-white">KCT SHIELD</h1>
          <p class="text-xs text-red-500 font-mono">Custom Web Application Firewall</p>
        </div>
      </div>
      <div class="flex items-center gap-6">
        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
          <span class="w-2 height-2 rounded-full bg-green-400 animate-pulse"></span> WAF ACTIVE
        </span>
        <span class="text-xs text-gray-500">Port 8080 ➔ Port 5173</span>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 gap-8">
    <!-- Grid of KPIs -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
        <div class="flex items-center justify-between text-gray-400 mb-4">
          <span class="text-sm font-medium">Total Requests</span>
          <span class="p-2 rounded-lg bg-blue-500/10 text-blue-400">📊</span>
        </div>
        <div>
          <h3 id="stat-total" class="text-3xl font-extrabold text-white">0</h3>
          <p class="text-xs text-gray-500 mt-1">Processed packets</p>
        </div>
      </div>

      <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
        <div class="flex items-center justify-between text-gray-400 mb-4">
          <span class="text-sm font-medium">Allowed Traffic</span>
          <span class="p-2 rounded-lg bg-green-500/10 text-green-400">✔️</span>
        </div>
        <div>
          <h3 id="stat-allowed" class="text-3xl font-extrabold text-white">0</h3>
          <p class="text-xs text-green-500 mt-1" id="stat-allowed-pct">0% success rate</p>
        </div>
      </div>

      <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
        <div class="flex items-center justify-between text-gray-400 mb-4">
          <span class="text-sm font-medium">Blocked Incidents</span>
          <span class="p-2 rounded-lg bg-red-500/10 text-red-400">🚫</span>
        </div>
        <div>
          <h3 id="stat-blocked" class="text-3xl font-extrabold text-white">0</h3>
          <p class="text-xs text-red-500 mt-1" id="stat-blocked-pct">0% filtered attacks</p>
        </div>
      </div>

      <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
        <div class="flex items-center justify-between text-gray-400 mb-4">
          <span class="text-sm font-medium">Rate Limited</span>
          <span class="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">⏳</span>
        </div>
        <div>
          <h3 id="stat-rate" class="text-3xl font-extrabold text-white">0</h3>
          <p class="text-xs text-yellow-500 mt-1">Bursts throttled</p>
        </div>
      </div>
    </div>

    <!-- Charts & IP Controls -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Chart Card -->
      <div class="lg:col-span-2 glass-card rounded-2xl p-6">
        <h3 class="text-lg font-bold text-white mb-6">Threat Categories</h3>
        <div class="w-full h-64 flex justify-center">
          <canvas id="threatChart"></canvas>
        </div>
      </div>

      <!-- IP Actions Card -->
      <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
        <div>
          <h3 class="text-lg font-bold text-white mb-4">Quick Fire IP Rules</h3>
          <form id="ip-rule-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-400 mb-2">Target IP Address</label>
              <input type="text" id="ip-address" placeholder="e.g. 192.168.1.10" class="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-red-500" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-400 mb-2">Rule Action</label>
              <select id="ip-type" class="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-red-500">
                <option value="block">BLOCK (Deny all)</option>
                <option value="allow">ALLOW (Bypass checks)</option>
                <option value="unblock">UNBLOCK (Reset state)</option>
              </select>
            </div>
            <button type="submit" class="w-full py-2 bg-red-600 hover:bg-red-500 transition font-bold text-white rounded-lg text-sm shadow-lg shadow-red-600/20">
              Apply IP Firewall Rule
            </button>
          </form>
        </div>

        <div class="mt-6 border-t border-gray-800 pt-6">
          <h4 class="text-xs font-semibold text-gray-400 mb-3">Recent Manual Rules</h4>
          <div id="ip-rules-list" class="max-h-32 overflow-y-auto space-y-2 text-xs font-mono">
            <p class="text-gray-600 italic">No manual overrides registered.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Security Events Stream -->
    <div class="glass-card rounded-2xl p-6">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold text-white">Live Threat Stream</h3>
        <button onclick="fetchData()" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs font-medium rounded-lg text-gray-300 transition">
          Refresh List
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left text-gray-400">
          <thead class="text-xs uppercase bg-gray-950/60 text-gray-500 font-mono border-b border-gray-800">
            <tr>
              <th scope="col" class="px-6 py-3">Timestamp</th>
              <th scope="col" class="px-6 py-3">IP Address</th>
              <th scope="col" class="px-6 py-3">Method / Route</th>
              <th scope="col" class="px-6 py-3">Action</th>
              <th scope="col" class="px-6 py-3">Score</th>
              <th scope="col" class="px-6 py-3">Triggered rules</th>
            </tr>
          </thead>
          <tbody id="logs-tbody" class="divide-y divide-gray-800/50">
            <!-- Event Logs rows -->
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    let threatChartInstance = null;

    async function fetchData() {
      // 1. Fetch Stats
      const statsRes = await fetch("/api/stats");
      const stats = await statsRes.json();
      
      document.getElementById("stat-total").innerText = stats.total;
      document.getElementById("stat-allowed").innerText = stats.allowed;
      document.getElementById("stat-blocked").innerText = stats.blocked;
      document.getElementById("stat-rate").innerText = stats.rateLimited;

      const allowedPct = stats.total > 0 ? Math.round((stats.allowed / stats.total) * 100) : 0;
      const blockedPct = stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) : 0;
      document.getElementById("stat-allowed-pct").innerText = allowedPct + "% success rate";
      document.getElementById("stat-blocked-pct").innerText = blockedPct + "% filtered attacks";

      // Update Chart
      const categories = stats.categories;
      const chartData = [categories.SQLI, categories.XSS, categories.TRAVERSAL, categories.COMMAND, categories.RATE_LIMIT];
      
      if (threatChartInstance) {
        threatChartInstance.data.datasets[0].data = chartData;
        threatChartInstance.update();
      } else {
        const ctx = document.getElementById('threatChart').getContext('2d');
        threatChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['SQL Injection', 'Cross-Site Scripting (XSS)', 'Path Traversal', 'Command Injection', 'Rate Limiting'],
            datasets: [{
              label: 'Trigger Count',
              data: chartData,
              backgroundColor: [
                'rgba(239, 68, 68, 0.4)',
                'rgba(244, 63, 94, 0.4)',
                'rgba(168, 85, 247, 0.4)',
                'rgba(236, 72, 153, 0.4)',
                'rgba(245, 158, 11, 0.4)'
              ],
              borderColor: [
                'rgba(239, 68, 68, 1)',
                'rgba(244, 63, 94, 1)',
                'rgba(168, 85, 247, 1)',
                'rgba(236, 72, 153, 1)',
                'rgba(245, 158, 11, 1)'
              ],
              borderWidth: 1.5,
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' }
              },
              x: {
                grid: { display: false },
                ticks: { color: '#64748b' }
              }
            },
            plugins: {
              legend: { display: false }
            }
          }
        });
      }

      // 2. Fetch Logs
      const logsRes = await fetch("/api/logs");
      const logs = await logsRes.json();
      const logsTbody = document.getElementById("logs-tbody");
      logsTbody.innerHTML = "";

      if (logs.length === 0) {
        logsTbody.innerHTML = \`<tr><td colspan="6" class="px-6 py-6 text-center text-gray-600 italic">No WAF security logs logged yet.</td></tr>\`;
      } else {
        logs.forEach(log => {
          let badgeClass = "bg-green-500/10 text-green-400 border-green-500/20";
          if (log.action === "BLOCK") badgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
          if (log.action === "RATE_LIMIT") badgeClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
          if (log.action === "MONITOR") badgeClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";

          let scoreColor = "text-green-500";
          if (log.score >= 50) scoreColor = "text-red-500 font-bold";
          else if (log.score >= 20) scoreColor = "text-purple-500";

          const formattedTime = new Date(log.timestamp).toLocaleString();
          const rulesBadge = log.rules.map(r => \`<span class="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] text-gray-400 font-mono">\${r}</span>\`).join(" ");

          const tr = document.createElement("tr");
          tr.className = "hover:bg-white/[0.02] transition-colors border-b border-gray-900/50";
          tr.innerHTML = \`
            <td class="px-6 py-4 font-mono text-xs text-gray-500">\${formattedTime}</td>
            <td class="px-6 py-4 font-mono font-medium text-white">\${log.ip}</td>
            <td class="px-6 py-4 font-mono"><span class="text-blue-400 font-semibold">\${log.method}</span> <span class="text-gray-300">\${log.path}</span></td>
            <td class="px-6 py-4"><span class="px-2 py-0.5 border rounded-full text-xs font-semibold \${badgeClass}">\${log.action}</span></td>
            <td class="px-6 py-4 font-mono \${scoreColor}">\${log.score}</td>
            <td class="px-6 py-4 flex flex-wrap gap-1 mt-1">\${rulesBadge || '<span class="text-gray-600 italic text-xs">None</span>'}</td>
          \`;
          logsTbody.appendChild(tr);
        });
      }

      // 3. Fetch IP rules
      const ipRulesRes = await fetch("/api/rules");
      const ipData = await ipRulesRes.json();
      const ipRulesList = document.getElementById("ip-rules-list");
      ipRulesList.innerHTML = "";

      const activeRules = [...ipData.rules, ...Object.entries(ipData.tempBlocks).map(([ip, expiresAt]) => ({ ip, type: 'block (temp)', expiresAt }))];

      if (activeRules.length === 0) {
        ipRulesList.innerHTML = '<p class="text-gray-600 italic">No manual overrides registered.</p>';
      } else {
        activeRules.forEach(rule => {
          const typeBadge = rule.type === 'allow' 
            ? 'text-green-400 bg-green-500/10 border border-green-500/20' 
            : 'text-red-400 bg-red-500/10 border border-red-500/20';

          const item = document.createElement("div");
          item.className = "flex items-center justify-between p-2 rounded bg-gray-950/40 border border-gray-900";
          item.innerHTML = \`
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
              <span class="text-white font-medium">\${rule.ip}</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] uppercase font-bold \${typeBadge}">\${rule.type}</span>
            </div>
            \${rule.type !== 'block (temp)' ? \`
            <button onclick="deleteRule('\${rule.ip}')" class="text-red-500 hover:text-red-400 transition text-[10px] font-bold">REMOVE</button>
            \` : \`
            <span class="text-[9px] text-gray-600 italic">Expiring</span>
            \`}
          \`;
          ipRulesList.appendChild(item);
        });
      }
    }

    async function deleteRule(ip) {
      await fetch("/api/rules/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip })
      });
      fetchData();
    }

    document.getElementById("ip-rule-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const ip = document.getElementById("ip-address").value;
      const type = document.getElementById("ip-type").value;
      
      await fetch("/api/rules/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, type })
      });

      document.getElementById("ip-address").value = "";
      fetchData();
    });

    // Start auto-poll every 3 seconds
    fetchData();
    setInterval(fetchData, 3000);
  </script>
</body>
</html>`;
}

export function startDashboard() {
  Bun.serve({
    port: ADMIN_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      // Handle CORS preflight options
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      const addCors = (response: Response): Response => {
        for (const [key, val] of Object.entries(corsHeaders)) {
          response.headers.set(key, val);
        }
        return response;
      };

      // 1. Serve Dashboard HTML
      if (req.method === "GET" && path === "/") {
        return new Response(getDashboardHtml(), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // 2. API: stats
      if (req.method === "GET" && path === "/api/stats") {
        return addCors(Response.json(getWafStats()));
      }

      // 3. API: logs
      if (req.method === "GET" && path === "/api/logs") {
        return addCors(Response.json(getSecurityLogs(50)));
      }

      // 4. API: rules (allowlist / blocklist)
      if (req.method === "GET" && path === "/api/rules") {
        return addCors(Response.json({
          rules: getAllIPRules(),
          tempBlocks: getTemporaryBlocks(),
        }));
      }

      // 5. API: add rule
      if (req.method === "POST" && path === "/api/rules/add") {
        try {
          const body: any = await req.json();
          const { ip, type } = body;
          
          if (type === "allow") {
            allowIP(ip);
          } else if (type === "block") {
            blockIP(ip);
          } else if (type === "unblock") {
            unblockIP(ip);
          }
          
          return addCors(Response.json({ success: true }));
        } catch (err: any) {
          return addCors(Response.json({ success: false, error: err.message }, { status: 400 }));
        }
      }

      // 6. API: delete rule
      if (req.method === "POST" && path === "/api/rules/delete") {
        try {
          const body: any = await req.json();
          const { ip } = body;
          unblockIP(ip);
          return addCors(Response.json({ success: true }));
        } catch (err: any) {
          return addCors(Response.json({ success: false, error: err.message }, { status: 400 }));
        }
      }

      return addCors(new Response("Not Found", { status: 404 }));
    },
  });

  console.log(`\x1b[35m📊  KCT SHIELD Dashboard running on http://localhost:${ADMIN_PORT}\x1b[0m\n`);
}
