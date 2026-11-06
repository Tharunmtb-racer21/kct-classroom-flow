import type { KnowledgeItem } from "./types";

export const developerPortalKnowledge: KnowledgeItem[] = [
  {
    id: "kb-developer-portal",
    title: "Developer Telemetry Portal & Administration (/developer)",
    category: "Administration",
    summary:
      "Protected system monitoring console offering live audit logs, database ping latencies, and faculty drilldown tools.",
    content:
      "The Developer Portal (`/developer` / `/dashboard/developer`) is an administrative console for system engineers and institutional administrators:\n" +
      "• Password & Role Gated: Protected by developer password authentication and database-level role verification (`public.is_platform_admin()`).\n" +
      "• Real-Time Login Telemetry: Records and audits faculty logins, user agents, operating systems, and active session durations.\n" +
      "• Database Health Diagnostics: Live Supabase PostgreSQL query latency pings and WebSocket channel monitors.\n" +
      "• Faculty Session Drill-Down: Clicking any faculty member opens an interactive modal revealing all authored sessions, live participant headcounts, and direct report downloads.\n" +
      "• Global Search: Unified multi-entity search bar filtering across session titles, codes, faculty names, and queries.\n" +
      "• Emergency Controls: Supabase Server Down Mode toggle to protect the application during scheduled maintenance.",
    keywords: [
      "developer portal",
      "developer",
      "telemetry",
      "system health",
      "database ping",
      "login logs",
      "audit trail",
      "server down mode",
      "faculty drilldown",
      "administration",
    ],
    suggestedQuestions: [
      "What is the Developer Portal?",
      "How do administrators access system telemetry?",
      "What is Supabase Server Down Mode?",
    ],
    relatedTopics: ["kb-kct-shield-waf", "kb-login-auth", "kb-privacy-security"],
  },
  {
    id: "kb-kct-shield-waf",
    title: "KCT SHIELD Web Application Firewall (/developer-waf)",
    category: "Administration",
    summary:
      "Real-time edge security monitor detailing packet inspection, IP rate limiting, and threat analysis.",
    content:
      "KCT SHIELD (`/developer-waf`) is the platform's security intelligence console:\n" +
      "• Threat Telemetry: Inspects total incoming packets, allowed traffic ratios, and blocked anomalous requests.\n" +
      "• Rate Limiting: Token Bucket algorithm throttling excessive burst queries from misconfigured or abusive clients.\n" +
      "• Console Access: Protected by developer password authentication and @kct.ac.in administrator role verification.",
    keywords: [
      "kct shield",
      "waf",
      "firewall",
      "threats",
      "rate limit",
      "security console",
      "ip rules",
      "packets",
      "waf portal",
    ],
    suggestedQuestions: [
      "What is KCT SHIELD?",
      "How does the platform block abusive traffic?",
      "How do administrators log into the WAF console?",
    ],
    relatedTopics: ["kb-developer-portal", "kb-privacy-security"],
  },
];
