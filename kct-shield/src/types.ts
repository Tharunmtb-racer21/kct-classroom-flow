export interface SecurityLog {
  id?: number;
  timestamp: string;
  ip: string;
  method: string;
  path: string;
  action: 'ALLOW' | 'MONITOR' | 'BLOCK' | 'RATE_LIMIT';
  rules: string[]; // JSON string array of triggered rule IDs
  score: number;
  userAgent: string;
}

export interface WafRule {
  id: string;
  name: string;
  category: 'SQLI' | 'XSS' | 'TRAVERSAL' | 'COMMAND' | 'SIZE' | 'METHOD' | 'IP';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  field: 'query' | 'body' | 'headers' | 'path' | 'method';
  headerName?: string; // Optional: specify header key (e.g. User-Agent)
  operator: 'equals' | 'contains' | 'regex' | 'greater_than';
  pattern: string;
}

export interface IPRule {
  ip: string;
  type: 'allow' | 'block';
  expiresAt: string | null; // ISO string or null for permanent
}

export interface LimiterBucket {
  tokens: number;
  lastRefill: number; // timestamp in ms
}
