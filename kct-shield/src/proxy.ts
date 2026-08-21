import { getClientIP } from "./proxy";
import { logSecurityEventAsync } from "./logger";
import { isIPBlocked, isIPAllowed, blockIPTemp } from "./filter";
import { checkRateLimit } from "./limiter";
import { inspectRequest } from "./detector";
import { renderBlockPage, renderRateLimitPage } from "./blockpage";

/**
 * Extracts the real client IP, checking headers like X-Forwarded-For if available.
 */
export function getClientIPAddress(request: Request, server: any): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",");
    return parts[0].trim();
  }
  const requestIP = server.requestIP(request);
  if (requestIP) {
    return requestIP.address;
  }
  return "127.0.0.1";
}

/**
 * Handles incoming requests: filters by IP, checks rate limits, evaluates security rules,
 * scores risk levels, logs incidents, and forwards traffic to the backend.
 */
export async function handleProxyRequest(request: Request, server: any): Promise<Response> {
  const clientIp = getClientIPAddress(request, server);
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  const userAgent = request.headers.get("user-agent") || "";
  const requestSize = Number(request.headers.get("content-length") || "0");
  const timestamp = new Date().toISOString();

  // 1. IP Blocklist Check (V0.3)
  if (isIPBlocked(clientIp)) {
    logSecurityEventAsync({
      timestamp,
      ip: clientIp,
      method,
      path,
      action: "BLOCK",
      rules: ["IP-BLOCKLIST"],
      score: 100,
      userAgent,
    });

    return new Response(
      renderBlockPage({
        ip: clientIp,
        reason: "Access Denied. Your IP address is on our active firewall blocklist.",
        score: 100,
        rules: ["IP-BLOCKLIST"],
        incidentId: `INC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  // 2. Rate Limiting Check (V0.4)
  // Bypass rate limiting for explicitly allowed IPs, static assets, and Vite dev endpoints
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|tsx?)$/i.test(path);
  const isVite = path.startsWith("/@") || path.startsWith("/node_modules/");
  const shouldRateLimit = !isIPAllowed(clientIp) && !isAsset && !isVite;

  if (shouldRateLimit && !checkRateLimit(clientIp)) {
    logSecurityEventAsync({
      timestamp,
      ip: clientIp,
      method,
      path,
      action: "RATE_LIMIT",
      rules: ["RATE-ABUSE"],
      score: 100,
      userAgent,
    });

    return new Response(
      renderRateLimitPage({
        ip: clientIp,
        retryAfter: 60,
      }),
      {
        status: 429,
        headers: { "Content-Type": "text/html", "Retry-After": "60" },
      }
    );
  }

  // 3. IP Allowlist Check (Bypass Rule Matching)
  if (isIPAllowed(clientIp)) {
    logSecurityEventAsync({
      timestamp,
      ip: clientIp,
      method,
      path,
      action: "ALLOW",
      rules: ["IP-ALLOWLIST"],
      score: 0,
      userAgent,
    });
    return forwardToBackend(request, clientIp);
  }

  // 4. Safe Request Body Cloning
  let bodyText = "";
  if (method !== "GET" && method !== "HEAD") {
    try {
      const inspectClone = request.clone();
      bodyText = await inspectClone.text();
    } catch (err) {
      console.error("[KCT SHIELD] Failed to read request body clone:", err);
    }
  }

  // 5. Evaluate WAF Rule Engine & Threat Scoring (V0.5, V0.6, V0.7)
  const queryString = url.searchParams.toString();
  const { triggeredRules, score, action } = inspectRequest(
    path,
    queryString,
    request.headers,
    bodyText,
    requestSize
  );

  // 6. Execute Decision Logic (ALLOW / MONITOR / BLOCK)
  if (action === "BLOCK") {
    // Add temporary block penalty: block IP for 5 minutes (300 seconds)
    blockIPTemp(clientIp, 300);

    logSecurityEventAsync({
      timestamp,
      ip: clientIp,
      method,
      path,
      action: "BLOCK",
      rules: triggeredRules,
      score,
      userAgent,
    });

    return new Response(
      renderBlockPage({
        ip: clientIp,
        reason: "Request blocked due to suspicious attack signatures.",
        score,
        rules: triggeredRules,
        incidentId: `INC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  // Save ALLOW/MONITOR log
  logSecurityEventAsync({
    timestamp,
    ip: clientIp,
    method,
    path,
    action,
    rules: triggeredRules,
    score,
    userAgent,
  });

  return forwardToBackend(request, clientIp, bodyText);
}

/**
 * Tunneling fetch function that forwards HTTP requests to KCT Classroom Flow on port 8080.
 */
async function forwardToBackend(request: Request, clientIp: string, bodyText?: string): Promise<Response> {
  const targetUrl = new URL(request.url);
  targetUrl.host = "localhost:8080";
  targetUrl.protocol = "http:";

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set("X-Forwarded-For", clientIp);
  proxyHeaders.set("X-Forwarded-Host", request.headers.get("host") || "");
  proxyHeaders.set("X-Forwarded-Proto", "http");

  try {
    const proxyInit: RequestInit = {
      method: request.method,
      headers: proxyHeaders,
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD" && bodyText) {
      proxyInit.body = bodyText;
    }

    const backendResponse = await fetch(targetUrl.toString(), proxyInit);

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete("connection");
    responseHeaders.delete("keep-alive");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[KCT SHIELD] Reverse Proxy failed:`, err.message);
    return new Response(
      `🛡️ [KCT SHIELD] Gateway Error\n\nUnable to connect to the backend server (KCT Classroom Flow) on http://localhost:8080.\nVerify that your application dev server is running.\n\nError: ${err.message}`,
      {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }
}
