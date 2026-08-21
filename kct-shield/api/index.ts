import { inspectRequest } from "../src/detector";
import { renderBlockPage } from "../src/blockpage";
import { getRules, loadRules } from "../src/rules";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const queryString = url.search;
  const method = req.method;
  const headers = req.headers;

  // Extract client IP from headers
  const clientIp = headers.get("x-forwarded-for") || "127.0.0.1";

  // Build compiled rules at Edge initialization
  if (getRules().length === 0) {
    loadRules();
  }

  // Read request body if present
  let body = "";
  let bodySize = 0;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    try {
      const clone = req.clone();
      body = await clone.text();
      bodySize = body.length;
    } catch (e) {
      console.warn("Failed to read request body:", e);
    }
  }

  // 1. Run WAF rules check
  const { triggeredRules, score, action } = inspectRequest(path, queryString, headers, body, bodySize);

  if (action === "BLOCK") {
    const html = renderBlockPage({
      ip: clientIp,
      reason: "Access Denied. Your request triggered KCT SHIELD security policies.",
      score,
      rules: triggeredRules,
      incidentId: `INC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    });
    return new Response(html, {
      status: 403,
      headers: { "Content-Type": "text/html" },
    });
  }

  // 2. Proxy request to the destination host
  const targetUrl = process.env.TARGET_URL || "https://kct-classroom-flow.vercel.app";
  const proxyUrl = new URL(path + queryString, targetUrl);

  const proxyHeaders = new Headers(headers);
  proxyHeaders.set("x-forwarded-for", clientIp);
  proxyHeaders.set("x-kct-shield", "active");

  try {
    const response = await fetch(proxyUrl.toString(), {
      method,
      headers: proxyHeaders,
      body: method !== "GET" && method !== "HEAD" ? req.body : undefined,
      redirect: "manual",
    });

    return response;
  } catch (err: any) {
    console.error("Proxy error:", err);
    return new Response(`WAF Gateway Error: ${err.message}`, { status: 502 });
  }
}
