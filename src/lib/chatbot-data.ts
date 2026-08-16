export interface KnowledgeBlock {
  keywords: string[];
  content: string;
}

/**
 * Knowledge base containing app documentation, FAQs, and college context.
 */
export const KNOWLEDGE_BASE: KnowledgeBlock[] = [
  {
    keywords: ["kct", "kumaraguru", "college", "coimbatore", "institution", "tharun", "navneeth"],
    content: "Kumaraguru College of Technology (KCT), Coimbatore is a leading private autonomous engineering college established in 1984. KCT PULSE is developed by Navneeth V and designed by Tharun N E."
  },
  {
    keywords: ["shield", "firewall", "waf", "security", "block", "xss", "sqli", "cmd", "attack", "ban", "port 3000", "temporary"],
    content: "KCT SHIELD is a custom Web Application Firewall (WAF) running on Port 3000. It performs Token Bucket rate limiting, SQLi/XSS signature scanning, and temporarily blocks malicious IPs for 5 minutes."
  },
  {
    keywords: ["quiz", "quizzes", "correct", "grades", "leaderboard", "points"],
    content: "Quizzes in KCT PULSE are multiple-choice questions (4 options) with a single correct answer. They track student grades and feed the live classroom leaderboard."
  },
  {
    keywords: ["poll", "opinion", "feedback", "multiple"],
    content: "Polls capture student sentiment with 3-4 response options and no correct answer. Results are shown as real-time interactive bar charts."
  },
  {
    keywords: ["wordcloud", "cloud", "words", "open-ended", "visualize"],
    content: "Word Clouds collect student short-text responses and display them as a dynamic word cloud visualization, highlighting the most popular words."
  },
  {
    keywords: ["join", "code", "shortcode", "student", "participate"],
    content: "Students join a lecture by going to the homepage, entering the session's 6-character shortcode (e.g., KCT123), and typing their name. No login is needed."
  },
  {
    keywords: ["login", "register", "signup", "faculty", "email", "domain", "kct.ac.in"],
    content: "Faculty logins are managed by Firebase Auth. Account creation is restricted to institutional emails containing the @kct.ac.in domain."
  },
  {
    keywords: ["generate", "ai questions", "pdf", "document", "nvidia", "groq", "upload"],
    content: "Faculty can upload classroom documents or PDFs. The AI system uses NVIDIA NIM, Groq, Gemini, or Together AI to instantly construct quizzes, polls, or word clouds from the content."
  },
  {
    keywords: ["export", "pdf download", "report", "stats", "download"],
    content: "Faculty can export comprehensive session statistics, student lists, leaderboard standings, and question analytics to a styled PDF file from the session view."
  },
  {
    keywords: ["developer", "telemetry", "db purge", "cleanup", "audit", "pulse_2026"],
    content: "The hidden Developer Portal is accessed via /developer using password Pulse_2026. It manages Supabase schemas, Groq API key checking, database cleanups, and KCT SHIELD firewall stats."
  }
];

/**
 * Searches the user query against the knowledge base keywords and returns
 * context to inject into the LLM system prompt.
 */
export function findRelevantContext(query: string): string {
  const normalized = query.toLowerCase();
  const matched = KNOWLEDGE_BASE.filter(block =>
    block.keywords.some(keyword => normalized.includes(keyword))
  );

  if (matched.length === 0) {
    return "";
  }

  return "\n[AI Context Override from KCT Knowledge Base]:\n" + 
    matched.map(b => `- ${b.content}`).join("\n") + "\n";
}
