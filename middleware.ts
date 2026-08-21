import { inspectRequest } from "./kct-shield/src/detector";
import { renderBlockPage } from "./kct-shield/src/blockpage";
import { getRules, loadRules } from "./kct-shield/src/rules";

export const config = {
  // Run middleware on all paths except static assets
  matcher: "/((?!node_modules|@|favicon.ico|_next|assets).*)",
};

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  const queryString = url.search;
  const method = req.method;
  const headers = req.headers;

  const clientIp = headers.get("x-forwarded-for") || "127.0.0.1";

  // Load and compile rules if cache is empty
  if (getRules().length === 0) {
    loadRules();
  }

  // Bypass WAF rate/signature checks for typical static asset formats
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|tsx?)$/i.test(path);
  if (isAsset) {
    return;
  }

  let body = "";
  let bodySize = 0;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    try {
      const clone = req.clone();
      body = await clone.text();
      bodySize = body.length;
    } catch (e) {
      console.warn("WAF Middleware failed to read body:", e);
    }
  }

  // Run WAF rules check
  const { triggeredRules, score, action } = inspectRequest(
    path,
    queryString,
    headers,
    body,
    bodySize,
  );

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
}
