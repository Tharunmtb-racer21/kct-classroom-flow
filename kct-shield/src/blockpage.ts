/**
 * Renders a visually premium, modern dark-themed HTML block page for WAF security actions.
 */
export function renderBlockPage(params: {
  ip: string;
  reason: string;
  score: number;
  rules: string[];
  incidentId: string;
}): string {
  const rulesList = params.rules.length > 0 
    ? params.rules.map(r => `<span class="rule-badge">${r}</span>`).join(" ")
    : `<span class="rule-badge secondary">GENERIC-BLOCK</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied — KCT SHIELD</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.7);
      --border: rgba(239, 68, 68, 0.2);
      --glow: rgba(239, 68, 68, 0.15);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #ef4444;
      --accent-glow: #f87171;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      overflow: hidden;
      position: relative;
    }

    /* Ambient background glows */
    body::before {
      content: '';
      position: absolute;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, var(--glow) 0%, transparent 70%);
      top: 15%;
      left: 15%;
      pointer-events: none;
    }

    body::after {
      content: '';
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, var(--glow) 0%, transparent 70%);
      bottom: 10%;
      right: 10%;
      pointer-events: none;
    }

    .container {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37), 0 0 20px 0 var(--glow);
      border-radius: 24px;
      padding: 3rem;
      width: 90%;
      max-width: 580px;
      text-align: center;
      position: relative;
      z-index: 10;
      animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .icon-wrapper {
      width: 80px;
      height: 80px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 2rem;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
    }

    .icon-wrapper svg {
      width: 40px;
      height: 40px;
      stroke: var(--accent);
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      margin-bottom: 1rem;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    p.description {
      font-size: 1.1rem;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 2.5rem;
    }

    .details-table {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 16px;
      padding: 1.5rem;
      text-align: left;
      margin-bottom: 2rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      color: var(--text-muted);
      font-weight: 400;
    }

    .detail-value {
      color: var(--text);
      font-weight: 600;
    }

    .rule-badge {
      background: rgba(239, 68, 68, 0.15);
      color: var(--accent-glow);
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid rgba(239, 68, 68, 0.25);
      font-size: 0.75rem;
      margin-left: 4px;
    }

    .rule-badge.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .threat-level {
      color: var(--accent);
      font-weight: 800;
    }

    .footer-text {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 2rem;
    }

    .badge-shield {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 30px;
      padding: 6px 14px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-wrapper">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
      </svg>
    </div>

    <h1>Access Blocked</h1>
    <p class="description">Your request has been intercepted and blocked by KCT SHIELD Web Application Firewall due to suspicious security indicators.</p>

    <div class="details-table">
      <div class="detail-row">
        <span class="detail-label">Client IP</span>
        <span class="detail-value">${params.ip}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Reason</span>
        <span class="detail-value">${params.reason}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Threat Score</span>
        <span class="detail-value threat-level">${params.score} / 100</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Rules Triggered</span>
        <span class="detail-value">${rulesList}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Incident ID</span>
        <span class="detail-value">${params.incidentId}</span>
      </div>
    </div>

    <div class="badge-shield">
      <span>🛡️ Powered by KCT SHIELD WAF</span>
    </div>
    
    <p class="footer-text">If you believe this is a false positive, please contact your systems administrator.</p>
  </div>
</body>
</html>`;
}

/**
 * Renders a visually premium HTML page for 429 Rate Limiter blocks.
 */
export function renderRateLimitPage(params: { ip: string; retryAfter: number }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rate Limit Exceeded — KCT SHIELD</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.7);
      --border: rgba(245, 158, 11, 0.2);
      --glow: rgba(245, 158, 11, 0.15);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #f59e0b;
      --accent-glow: #fbbf24;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      overflow: hidden;
      position: relative;
    }

    body::before {
      content: '';
      position: absolute;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, var(--glow) 0%, transparent 70%);
      top: 15%;
      left: 15%;
      pointer-events: none;
    }

    .container {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37), 0 0 20px 0 var(--glow);
      border-radius: 24px;
      padding: 3rem;
      width: 90%;
      max-width: 580px;
      text-align: center;
      position: relative;
      z-index: 10;
      animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .icon-wrapper {
      width: 80px;
      height: 80px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 2rem;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
    }

    .icon-wrapper svg {
      width: 40px;
      height: 40px;
      stroke: var(--accent);
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      margin-bottom: 1rem;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    p.description {
      font-size: 1.1rem;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 2.5rem;
    }

    .details-table {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 16px;
      padding: 1.5rem;
      text-align: left;
      margin-bottom: 2rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      color: var(--text-muted);
      font-weight: 400;
    }

    .detail-value {
      color: var(--text);
      font-weight: 600;
    }

    .badge-shield {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 30px;
      padding: 6px 14px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .retry-level {
      color: var(--accent);
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-wrapper">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>

    <h1>Too Many Requests</h1>
    <p class="description">Your connection speed is exceeding our rate protection policies. This block has been automatically triggered to prevent server overload.</p>

    <div class="details-table">
      <div class="detail-row">
        <span class="detail-label">Client IP</span>
        <span class="detail-value">${params.ip}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Action</span>
        <span class="detail-value retry-level">RATE_LIMIT</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status Code</span>
        <span class="detail-value">429 Too Many Requests</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Retry After</span>
        <span class="detail-value retry-level">${params.retryAfter} seconds</span>
      </div>
    </div>

    <div class="badge-shield">
      <span>🛡️ Powered by KCT SHIELD WAF</span>
    </div>
  </div>
</body>
</html>`;
}
