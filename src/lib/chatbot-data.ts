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
    content:
      "Kumaraguru College of Technology (KCT), Coimbatore is a leading private autonomous engineering college established in 1984. KCT PULSE is developed by Navneeth V and designed by Tharun N E.",
  },
  {
    keywords: [
      "shield",
      "firewall",
      "waf",
      "security",
      "block",
      "xss",
      "sqli",
      "cmd",
      "attack",
      "ban",
      "port 3000",
      "temporary",
    ],
    content:
      "KCT SHIELD is a custom Web Application Firewall (WAF) running on Port 3000. It performs Token Bucket rate limiting, SQLi/XSS signature scanning, and temporarily blocks malicious IPs for 5 minutes.",
  },
  {
    keywords: ["quiz", "quizzes", "correct", "grades", "leaderboard", "points", "multiple correct"],
    content:
      "Quizzes in KCT PULSE are interactive timed questions (MCQs with 4 options) which can have single or multiple correct answers. They track student grades and feed the live leaderboard.",
  },
  {
    keywords: ["poll", "opinion", "feedback", "multiple", "sentiment"],
    content:
      "Polls capture student opinion with 3-4 options and no single correct answer. Results are displayed as real-time interactive bar charts to see class-wide statistics.",
  },
  {
    keywords: ["wordcloud", "cloud", "words", "open-ended", "visualize"],
    content:
      "Word Clouds collect short, open-ended text answers from students and arrange them into a dynamic word cloud visualization, sizing words by popularity.",
  },
  {
    keywords: ["join", "code", "shortcode", "student", "participate"],
    content:
      "Students participate in lectures without logging in. They visit the home page, enter the session's 6-character shortcode (e.g. KCT123), and provide their name to join.",
  },
  {
    keywords: [
      "login",
      "register",
      "signup",
      "faculty",
      "email",
      "domain",
      "kct.ac.in",
      "microsoft",
    ],
    content:
      "Faculty logins are managed by Firebase Auth (Microsoft or email-based). Faculty sign-up is strictly restricted to institutional emails ending in '@kct.ac.in'.",
  },
  {
    keywords: ["generate", "ai questions", "pdf", "document", "nvidia", "groq", "upload", "import"],
    content:
      "Faculty can upload course materials or lecture slides. The AI system (supporting NVIDIA NIM, Groq, Google, and Together AI) scans the text to generate quizzes, polls, or word clouds instantly.",
  },
  {
    keywords: ["export", "pdf download", "report", "stats", "download", "excel"],
    content:
      "Faculty can export detailed student performance analytics, leaderboard positions, attendance records, and question stats to formatted PDF and Excel reports.",
  },
  {
    keywords: [
      "exam",
      "integrity",
      "cheat",
      "fullscreen",
      "clipboard",
      "right click",
      "copy",
      "paste",
      "lockdown",
    ],
    content:
      "Exam Integrity Mode secures tests by blocking copying/pasting, restricting right-clicks, and tracking/limiting student fullscreen exits (alerting the instructor after a set limit, e.g. 3 exits).",
  },
  {
    keywords: ["cohost", "co-host", "share", "faculty", "collaborate", "helper", "assistant"],
    content:
      "Faculty can add other instructors as co-hosts using their '@kct.ac.in' emails. Co-hosts share control over session activation, question launching, and analytics.",
  },
  {
    keywords: [
      "draft",
      "expire",
      "stale",
      "1 hour",
      "auto-draft",
      "cleanup",
      "live limit",
      "automatic",
    ],
    content:
      "To maintain server health, live sessions automatically revert to 'draft' status after 1 hour of active status or when their expiration time is reached.",
  },
  {
    keywords: ["logout", "inactivity", "30 minutes", "automatic logout", "timeout", "secure"],
    content:
      "To protect faculty dashboards and credentials, instructors are automatically logged out of the application after 30 minutes of inactivity.",
  },
  {
    keywords: [
      "telemetry",
      "ping",
      "latency",
      "connection",
      "speed",
      "network",
      "online",
      "offline",
      "ms",
    ],
    content:
      "Students can monitor their connection quality in real-time via a color-coded latency indicator (e.g. 50ms) in the header of the student answering screen.",
  },
  {
    keywords: [
      "embed",
      "slide",
      "powerpoint",
      "google slides",
      "iframe",
      "projection",
      "presentation",
    ],
    content:
      "Faculty can embed live session results directly inside PowerPoint or Google Slides presentations using the frameless `/embed/$code` route.",
  },
  {
    keywords: ["upload", "docx", "xlsx", "word", "excel", "txt", "pdf", "file", "generate"],
    content:
      "Supported file formats for AI question generation include PDF, Microsoft Word (.docx), Excel (.xlsx), and plain text (.txt) files.",
  },
];

/**
 * Searches the user query against the knowledge base keywords and returns
 * context to inject into the LLM system prompt.
 */
export function findRelevantContext(query: string): string {
  const normalized = query.toLowerCase();
  const matched = KNOWLEDGE_BASE.filter((block) =>
    block.keywords.some((keyword) => normalized.includes(keyword)),
  );

  if (matched.length === 0) {
    return "";
  }

  return (
    "\n[AI Context Override from KCT Knowledge Base]:\n" +
    matched.map((b) => `- ${b.content}`).join("\n") +
    "\n"
  );
}
