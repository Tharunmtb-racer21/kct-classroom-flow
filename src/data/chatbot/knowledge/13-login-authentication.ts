import type { KnowledgeItem } from "./types";

export const loginAuthenticationKnowledge: KnowledgeItem[] = [
  {
    id: "kb-login-auth",
    title: "Faculty Authentication & Domain Security (/auth)",
    category: "Authentication",
    summary:
      "Enterprise authentication via Firebase Auth restricted strictly to verified @kct.ac.in and @kongu.edu institutional emails.",
    content:
      "KCT PULSE enforces strict institutional boundaries for faculty accounts:\n" +
      "• Institutional Email Restriction: Only email addresses ending with `@kct.ac.in` (and affiliate partner `@kongu.edu`) can register or log in. Public accounts (e.g. `@gmail.com`, `@yahoo.com`) are automatically rejected.\n" +
      "• Authentication Methods: Supports Google OAuth, Microsoft OAuth, and email/password sign-in.\n" +
      "• Email Verification: Faculty must verify their email address before accessing session creation tools.\n" +
      "• 30-Minute Inactivity Auto-Logout: Automatically signs out instructors after 30 minutes of inactivity to protect shared auditorium and lab computers.\n" +
      "• Telemetry Logging: Every successful login records browser, device, and OS metadata in `public.login_logs`.",
    keywords: [
      "login",
      "authentication",
      "sign in",
      "signup",
      "register",
      "domain restriction",
      "kct.ac.in",
      "firebase auth",
      "inactivity logout",
      "30 minutes",
      "password reset",
    ],
    suggestedQuestions: [
      "Who can create a faculty account?",
      "Can I sign in with a personal Gmail account?",
      "Why was I automatically logged out after 30 minutes?",
    ],
    relatedTopics: ["kb-privacy-security", "kb-faculty-workflows", "kb-developer-portal"],
  },
];
