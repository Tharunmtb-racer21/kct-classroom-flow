import { getRules, type CompiledWafRule } from "./rules";

/**
 * Normalizes a payload string to counter obfuscation attacks (such as double URL encoding).
 */
export function normalizePayload(input: string): string {
  if (!input) return "";
  let normalized = input;

  // Recursive URL decoding (up to 3 levels to tackle double URL encoding bypasses)
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      // Decode error, try browser legacy unescape
      try {
        const decoded = unescape(normalized);
        if (decoded === normalized) break;
        normalized = decoded;
      } catch {
        break; // Stop decoding if it's not valid URL/escape format
      }
    }
  }

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Compress multiple whitespaces (tabs, newlines, spaces) to single space
  normalized = normalized.replace(/\s+/g, " ");

  return normalized.trim();
}

/**
 * Evaluates a single compiled rule against the request fields.
 */
export function evaluateRule(
  rule: CompiledWafRule,
  params: { path: string; query: string; headers: Headers; body: string; bodySize: number }
): boolean {
  let inspectTarget = "";

  if (rule.field === "path") {
    inspectTarget = normalizePayload(params.path);
  } else if (rule.field === "query") {
    inspectTarget = normalizePayload(params.query);
  } else if (rule.field === "body") {
    if (rule.operator === "greater_than") {
      const sizeLimit = Number(rule.pattern);
      return params.bodySize > sizeLimit;
    }
    inspectTarget = normalizePayload(params.body);
  } else if (rule.field === "headers") {
    if (rule.headerName) {
      const val = params.headers.get(rule.headerName) || "";
      inspectTarget = normalizePayload(val);
    } else {
      // Search all headers combined
      let headerStr = "";
      params.headers.forEach((v, k) => {
        headerStr += `${k}: ${v}\n`;
      });
      inspectTarget = normalizePayload(headerStr);
    }
  }

  if (rule.operator === "regex" && rule.compiledRegex) {
    return rule.compiledRegex.test(inspectTarget);
  } else if (rule.operator === "contains") {
    return inspectTarget.includes(rule.pattern.toLowerCase());
  } else if (rule.operator === "equals") {
    return inspectTarget === rule.pattern.toLowerCase();
  }

  return false;
}

/**
 * Inspects request properties, maps triggered rules, aggregates threat score, and decides WAF action.
 */
export function inspectRequest(
  path: string,
  queryString: string,
  headers: Headers,
  body: string,
  bodySize: number
): { triggeredRules: string[]; score: number; action: "ALLOW" | "MONITOR" | "BLOCK" } {
  const rules = getRules();
  const triggeredRules: string[] = [];
  let score = 0;

  for (const rule of rules) {
    const isMatched = evaluateRule(rule, {
      path,
      query: queryString,
      headers,
      body,
      bodySize,
    });

    if (isMatched) {
      triggeredRules.push(rule.id);
      score += rule.score;
    }
  }

  // Cap score at 100
  score = Math.min(100, score);

  let action: "ALLOW" | "MONITOR" | "BLOCK" = "ALLOW";
  if (score >= 50) {
    action = "BLOCK";
  } else if (score >= 20) {
    action = "MONITOR";
  }

  return {
    triggeredRules,
    score,
    action,
  };
}
