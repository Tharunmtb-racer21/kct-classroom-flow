import type { KnowledgeItem } from "./types";

export const privacySecurityKnowledge: KnowledgeItem[] = [
  {
    id: "kb-privacy-security",
    title: "Privacy, Security & Data Protection Policies",
    category: "Security",
    summary:
      "Security policies governing institutional authentication, Row Level Security (RLS), and student privacy.",
    content:
      "KCT PULSE adheres to institutional security and student privacy standards:\n" +
      "• Student Privacy: Students are never tracked across independent sessions. No passwords, permanent personal profiles, or device trackers are collected from students.\n" +
      "• Row Level Security (RLS): All PostgreSQL tables have RLS enabled, validating queries against `public.auth_uid()`.\n" +
      "• Edge Security Headers: Enforces strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), X-Content-Type-Options, and frame ancestor restrictions.\n" +
      "• Inactivity Timeouts: Faculty accounts auto-logout after 30 minutes, and active sessions auto-revert to draft after 1 hour.\n" +
      "• Local Knowledge Chatbot: The conversational assistant operates 100% locally from repository knowledge without sending queries to external LLM APIs (no Gemini, OpenAI, or Groq external calls).",
    keywords: [
      "security",
      "privacy",
      "data protection",
      "rls",
      "row level security",
      "csp",
      "hsts",
      "student data",
      "is my data safe",
      "compliance",
      "local chatbot",
    ],
    suggestedQuestions: [
      "Is student data private and secure?",
      "How does the platform protect faculty accounts?",
      "Does the chatbot send my conversation to external AI servers?",
    ],
    relatedTopics: ["kb-login-auth", "kb-kct-shield-waf", "kb-developer-portal"],
  },
];

