import { inspectRequest } from "./kct-shield/src/detector";
import { renderBlockPage, renderRateLimitPage } from "./kct-shield/src/blockpage";
import { getRules, loadRules } from "./kct-shield/src/rules";
import { evaluateBehavioralAnomaly } from "./src/lib/ml-anomaly-detector";
import { getSecurityHeaders } from "./src/lib/security-headers";
import { isAllowedOrigin, getCorsHeaders, handleCorsPreflight } from "./src/lib/cors-policy";
import { validatePayloadSize, validateInputThreats } from "./src/lib/request-validator";

export const config = {
  // Run middleware on all paths except static assets
  matcher: "/((?!node_modules|@|favicon.ico|_next|assets).*)",
};

// In-memory sliding rate limit store for middleware
const rateLimitWindowMap = new Map<string, number[]>();

function checkRouteRateLimit(key: string, limitPerMinute: number): boolean {
  const now = Date.now();
  let timestamps = rateLimitWindowMap.get(key) || [];
  timestamps = timestamps.filter((t) => now - t <= 60000);

  if (timestamps.length >= limitPerMinute) {
    return false;
  }

  timestamps.push(now);
  rateLimitWindowMap.set(key, timestamps);
  return true;
}

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  const queryString = url.search;
  const method = req.method;
  const headers = req.headers;
  const origin = headers.get("origin");

  const clientIp = headers.get("x-forwarded-for") || "127.0.0.1";
  const isEmbedRoute = path.startsWith("/embed/");

  // 1. CORS Preflight & Origin Handling
  if (method === "OPTIONS") {
    return handleCorsPreflight(origin);
  }

  const corsHeaders = getCorsHeaders(origin);
  const securityHeaders = getSecurityHeaders({ isEmbedRoute });

  // Load WAF rules into memory if uninitialized
  if (getRules().length === 0) {
    loadRules();
  }

  // Bypass WAF checks for static asset formats
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|tsx?)$/i.test(path);
  if (isAsset) {
    return;
  }

  // 2. Safe Body Reading & Payload Size Check
  let body = "";
  let bodySize = 0;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    try {
      const clone = req.clone();
      body = await clone.text();
      bodySize = body.length;
    } catch (e) {
      console.warn("[Security Gateway] Failed to read request body:", e);
    }
  }

  const payloadCheck = validatePayloadSize(path, bodySize);
  if (payloadCheck.isExceeded) {
    return new Response(
      JSON.stringify({
        error: `Payload Too Large. Maximum allowed size for this route is ${
          payloadCheck.limitBytes / (1024 * 1024)
        } MB.`,
      }),
      {
        status: 413,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          ...securityHeaders,
        },
      },
    );
  }

  // 3. Request Input Validation (XSS, SQLi, Path Traversal)
  const threatCheck = validateInputThreats(path, queryString, body);
  if (!threatCheck.isValid) {
    const html = renderBlockPage({
      ip: clientIp,
      reason: threatCheck.reason || "Request blocked by input security policy.",
      score: 100,
      rules: ["INPUT-THREAT-RULE"],
      incidentId: `INC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    });
    return new Response(html, {
      status: 403,
      headers: {
        "Content-Type": "text/html",
        ...corsHeaders,
        ...securityHeaders,
      },
    });
  }

  // 4. Route-Tiered Rate Limiting 🚦
  let rateLimitMax = 60; // Default: 60 req/min for general API routes
  if (path.startsWith("/auth") || path.startsWith("/api/auth")) {
    rateLimitMax = 10; // Strict limit: 10 auth attempts/min
  } else if (path.includes("/join/") || path.includes("/response")) {
    rateLimitMax = 35; // Student live submission limit: 35 req/min
  }

  const rateKey = `${clientIp}:${path.split("/")[1] || "root"}`;
  const isRateAllowed = checkRouteRateLimit(rateKey, rateLimitMax);

  if (!isRateAllowed) {
    const html = renderRateLimitPage({
      ip: clientIp,
      retryAfter: 60,
    });
    return new Response(html, {
      status: 429,
      headers: {
        "Content-Type": "text/html",
        "Retry-After": "60",
        ...corsHeaders,
        ...securityHeaders,
      },
    });
  }

  // 5. Static Rule-Based WAF Inspection
  const staticInspection = inspectRequest(path, queryString, headers, body, bodySize);

  // 6. Dynamic ML Behavioral Anomaly Detection Layer
  const mlAssessment = evaluateBehavioralAnomaly({
    ipAddress: clientIp,
    timestampMs: Date.now(),
    payloadLength: bodySize,
  });

  const aggregateScore = Math.min(100, Math.max(staticInspection.score, mlAssessment.riskScore));
  const finalAction = aggregateScore >= 50 ? "BLOCK" : staticInspection.action;

  if (finalAction === "BLOCK") {
    const html = renderBlockPage({
      ip: clientIp,
      reason: mlAssessment.primaryReason || "Access Denied. Request triggered security policies.",
      score: aggregateScore,
      rules: staticInspection.triggeredRules.concat(mlAssessment.triggeredAnomalies),
      incidentId: `INC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    });
    return new Response(html, {
      status: 403,
      headers: {
        "Content-Type": "text/html",
        ...corsHeaders,
        ...securityHeaders,
      },
    });
  }
}
